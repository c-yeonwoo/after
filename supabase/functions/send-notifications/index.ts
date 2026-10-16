// The in-app notification is available when the DB row is created. This worker
// attempts APNs separately and records what the provider actually accepted.
// A timed-out provider call or expired lease is unknown, never an auto-resend.
import { createClient } from "npm:@supabase/supabase-js@2";

import { apnsConfigFromEnv, sendApns, type ApnsEnv } from "../_shared/apns.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { notificationCopy, type NotificationKind } from "../_shared/notification-copy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH = Math.max(1, Math.min(5, Number(Deno.env.get("NOTIFY_BATCH") ?? "5") || 5));
const DEAD_TOKEN = new Set(["Unregistered", "DeviceTokenNotForTopic", "ExpiredToken"]);

type Claimed = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  meeting_id: string | null;
  payload: { counterpart_id?: string } | null;
  attempts: number;
  lease_token: string;
};
type Device = { token: string; user_id: string; apns_env: ApnsEnv | null };
type DeliveryResult = {
  channel: "push";
  recipient_ref: string;
  status: "submitted" | "unavailable" | "failed" | "unknown" | "skipped";
  error_code: string | null;
  provider_ref?: string | null;
  retryable?: boolean;
};

async function tokenRef(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeReason(status: number, reason: string) {
  return `${status}_${reason.replace(/[^a-zA-Z0-9_]/g, "_")}`.slice(0, 80);
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  // JWT verification alone accepts ordinary member tokens too. Only the cron's
  // service-role bearer may invoke this privileged worker.
  if (!SERVICE_ROLE_KEY || req.headers.get("authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const apns = apnsConfigFromEnv((key) => Deno.env.get(key));
  const { data: claimed, error: claimError } = await db.rpc("claim_notification_dispatches", {
    p_limit: BATCH,
  });
  if (claimError) return json({ error: "claim failed" }, 500);
  const rows = (claimed ?? []) as Claimed[];
  let submitted = 0;
  let unavailable = 0;
  let skipped = 0;
  let failed = 0;
  let unknown = 0;

  for (const row of rows) {
    const stillRelevant = async () => {
      const result = await db.rpc("notification_push_still_relevant", {
        p_id: row.id,
        p_lease_token: row.lease_token,
      });
      if (result.error) throw result.error;
      return result.data === true;
    };
    const finish = async (
      state: string,
      errorCode: string | null,
      results: DeliveryResult[],
      retryable = false,
    ) => {
      const result = await db.rpc("finish_notification_dispatch", {
        p_id: row.id,
        p_lease_token: row.lease_token,
        p_state: state,
        p_error_code: errorCode,
        p_results: results,
        p_retryable: retryable,
      });
      if (result.error || result.data !== true) throw result.error ?? new Error("lease lost");
    };

    const results: DeliveryResult[] = [];
    let providerCallStarted = false;
    try {
      if (!(await stillRelevant())) {
        await finish("skipped", "source_not_current", results);
        skipped++;
        continue;
      }
      if (!apns) {
        results.push({
          channel: "push",
          recipient_ref: await tokenRef("apns_not_configured"),
          status: "unavailable",
          error_code: "apns_not_configured",
        });
        await finish("unavailable", "apns_not_configured", results);
        unavailable++;
        continue;
      }
      const { data: targets, error: targetsError } = await db
        .from("device_tokens")
        .select("token, user_id, apns_env")
        .eq("user_id", row.user_id);
      if (targetsError) throw targetsError;
      if (!targets?.length) {
        results.push({
          channel: "push",
          recipient_ref: await tokenRef("no_device"),
          status: "unavailable",
          error_code: "no_device",
        });
        await finish("unavailable", "no_device", results);
        unavailable++;
        continue;
      }

      let counterpartId = row.payload?.counterpart_id;
      if (!counterpartId && row.meeting_id) {
        const { data: meeting } = await db
          .from("meetings")
          .select("intros!inner(male_id, female_id)")
          .eq("id", row.meeting_id)
          .maybeSingle();
        const pair = (
          meeting as unknown as {
            intros: { male_id: string; female_id: string };
          } | null
        )?.intros;
        if (pair) counterpartId = pair.male_id === row.user_id ? pair.female_id : pair.male_id;
      }
      const { data: counterpart } = counterpartId
        ? await db.from("profiles").select("name").eq("id", counterpartId).maybeSingle()
        : { data: null };
      const copy = notificationCopy(row.kind, {
        counterpart: counterpart?.name ?? null,
        meetingId: row.meeting_id,
      });

      for (const device of targets as Device[]) {
        const recipientRef = await tokenRef(device.token);
        if (!(await stillRelevant())) {
          results.push({
            channel: "push",
            recipient_ref: recipientRef,
            status: "skipped",
            error_code: "source_not_current",
          });
          continue;
        }
        // Token ownership may change on logout or account switch after claim.
        const { data: current, error: currentError } = await db
          .from("device_tokens")
          .select("user_id")
          .eq("token", device.token)
          .maybeSingle();
        if (currentError) throw currentError;
        if (current?.user_id !== row.user_id) {
          results.push({
            channel: "push",
            recipient_ref: recipientRef,
            status: "skipped",
            error_code: "token_moved",
          });
          continue;
        }

        const environments: ApnsEnv[] = device.apns_env
          ? [device.apns_env]
          : ["production", "sandbox"];
        let outcome: DeliveryResult = {
          channel: "push",
          recipient_ref: recipientRef,
          status: "failed",
          error_code: "apns_rejected",
        };
        for (const env of environments) {
          try {
            providerCallStarted = true;
            const response = await sendApns(apns, env, device.token, copy, {
              path: copy.path,
              notificationId: row.id,
            });
            if (response.ok) {
              outcome = {
                channel: "push",
                recipient_ref: recipientRef,
                status: "submitted",
                error_code: null,
                provider_ref: response.providerRef,
              };
              if (device.apns_env !== env) {
                await db.from("device_tokens").update({ apns_env: env }).eq("token", device.token);
              }
              break;
            }
            const errorCode = safeReason(response.status, response.reason);
            if (DEAD_TOKEN.has(response.reason) || response.status === 410) {
              await db.from("device_tokens").delete().eq("token", device.token);
              outcome = {
                channel: "push",
                recipient_ref: recipientRef,
                status: "unavailable",
                error_code: errorCode,
                provider_ref: response.providerRef,
              };
              break;
            }
            if (response.reason === "BadDeviceToken" && (device.apns_env || env === "sandbox")) {
              await db.from("device_tokens").delete().eq("token", device.token);
              outcome = {
                channel: "push",
                recipient_ref: recipientRef,
                status: "unavailable",
                error_code: errorCode,
                provider_ref: response.providerRef,
              };
              break;
            }
            outcome = {
              channel: "push",
              recipient_ref: recipientRef,
              status: "failed",
              error_code: errorCode,
              provider_ref: response.providerRef,
              retryable: response.status === 429 || response.status >= 500,
            };
            if (response.reason !== "BadDeviceToken") break;
          } catch {
            // A network timeout may occur after APNs accepts the request.
            outcome = {
              channel: "push",
              recipient_ref: recipientRef,
              status: "unknown",
              error_code: "provider_result_unknown",
            };
            break;
          }
        }
        results.push(outcome);
      }
      const state = results.some((result) => result.status === "submitted")
        ? "submitted"
        : results.some((result) => result.status === "unknown")
          ? "unknown"
          : results.some((result) => result.status === "failed")
            ? "failed"
            : results.every((result) => result.status === "skipped")
              ? "skipped"
              : "unavailable";
      await finish(
        state,
        state === "submitted" ? null : `push_${state}`,
        results,
        state === "failed" && results.some((result) => result.retryable),
      );
      if (state === "submitted") submitted++;
      else if (state === "unavailable") unavailable++;
      else if (state === "skipped") skipped++;
      else if (state === "failed") failed++;
      else unknown++;
    } catch {
      // No provider call means a bounded retry is safe. If APNs explicitly
      // accepted a push, retry recording that known result, never re-send it.
      try {
        if (!providerCallStarted) {
          await finish("failed", "pre_send_error", results, true);
          failed++;
          continue;
        }
        if (results.some((result) => result.status === "submitted")) {
          await finish("submitted", null, results);
          submitted++;
          continue;
        }
        await finish("unknown", "worker_result_unknown", results);
      } catch {
        // The lease may be gone; the next run classifies it as unknown.
      }
      unknown++;
    }
  }

  const { error: heartbeatError } = await db.rpc("record_notification_worker_run", {
    p_duration_ms: Math.min(600_000, Date.now() - startedAt),
    p_claimed: rows.length,
    p_submitted: submitted,
    p_unavailable: unavailable,
    p_skipped: skipped,
    p_failed: failed,
    p_unknown: unknown,
  });
  if (heartbeatError) return json({ error: "worker result recording failed" }, 500);
  return json({ submitted, unavailable, skipped, failed, unknown });
});
