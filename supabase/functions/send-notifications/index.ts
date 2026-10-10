// 알림 아웃박스 발송 워커 — 앱 푸시(APNs)로 보낸다(s55, 2026-10-10).
//
// notifications 표에서 아직 안 보낸 행을 꺼내 회원의 iOS 기기로 푸시한다. 아웃박스에
// 행을 남기는 쪽(트리거·cron)은 발송을 절대 시도하지 않는다 — 상태 전이 트랜잭션이
// 외부 서버 속도에 묶이면 안 되고, 롤백된 전이에 대한 알림이 나가서도 안 된다.
//
// 예전에는 개인 알림 메일로 보냈다. 이제 메일은 로그인·가입 인증 코드뿐이다.
//   · 기기 토큰이 있는 회원 — 푸시
//   · 없는 회원(웹만 쓰는 사람) — 보내지 않는다. 행은 그대로 화면 속 알림 목록이
//     된다(my_notifications). sent_at 은 "처리 끝" 이라는 뜻으로 찍는다.
//
// 호출: pg_cron drain_notification_outbox_5m(s15)이 5분마다 pg_net 으로 부른다.
// 실패는 삼키지 않는다. attempts·last_error 를 남겨 운영자 화면에 보이게 한다.

import { createClient } from "npm:@supabase/supabase-js@2";

import { apnsConfigFromEnv, sendApns, type ApnsEnv } from "../_shared/apns.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { notificationCopy, type NotificationKind } from "../_shared/notification-copy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** 한 번 호출에서 처리할 최대 건수. 타임아웃 안에 끝나도록 묶는다. */
const BATCH = Number(Deno.env.get("NOTIFY_BATCH") ?? "50");
/** 이 횟수를 넘게 실패한 행은 더 시도하지 않는다(사람이 봐야 하는 상태). */
const MAX_ATTEMPTS = 5;

/** 토큰이 더는 쓸모없다는 APNs 응답. 이 토큰은 지운다. */
const DEAD_TOKEN = new Set(["Unregistered", "DeviceTokenNotForTopic", "ExpiredToken"]);

type PendingRow = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  meeting_id: string | null;
  attempts: number;
  payload: { counterpart_id?: string } | null;
};

type Device = { token: string; user_id: string; apns_env: ApnsEnv | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  /*
    APNs 키가 없으면 푸시를 건너뛰고 행을 "처리 끝" 으로 둔다. 알림은 목록에 그대로
    있다. 키가 생긴 뒤의 알림부터 푸시가 나간다 — 지난 알림을 한꺼번에 몰아 보내지
    않는다(잠금화면에 며칠 전 알림이 쏟아지면 그게 더 나쁘다).
  */
  const apns = apnsConfigFromEnv((k) => Deno.env.get(k));

  const { data: pending, error: pendErr } = await db
    .from("notifications")
    .select("id, user_id, kind, meeting_id, attempts, payload")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (pendErr) return json({ error: pendErr.message }, 500);
  if (!pending?.length) return json({ pushed: 0, inAppOnly: 0, failed: 0 });

  const rows = pending as PendingRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const { data: devices, error: devErr } = await db
    .from("device_tokens")
    .select("token, user_id, apns_env")
    .in("user_id", userIds);
  if (devErr) return json({ error: devErr.message }, 500);
  const devicesByUser = new Map<string, Device[]>();
  for (const d of (devices ?? []) as Device[]) {
    devicesByUser.set(d.user_id, [...(devicesByUser.get(d.user_id) ?? []), d]);
  }

  // 상대 이름 — payload 의 counterpart_id, 없으면(후기 요청) 약속의 반대편.
  const counterpartOf = new Map<string, string>();
  for (const r of rows)
    if (r.payload?.counterpart_id) counterpartOf.set(r.id, r.payload.counterpart_id);
  const meetingIds = [
    ...new Set(
      rows.filter((r) => !counterpartOf.has(r.id) && r.meeting_id).map((r) => r.meeting_id!),
    ),
  ];
  if (meetingIds.length) {
    const { data: ms } = await db
      .from("meetings")
      .select("id, intros!inner(male_id, female_id)")
      .in("id", meetingIds);
    const pairs = new Map(
      (ms ?? []).map((m) => [
        m.id as string,
        (m as unknown as { intros: { male_id: string; female_id: string } }).intros,
      ]),
    );
    for (const r of rows) {
      const pair = r.meeting_id ? pairs.get(r.meeting_id) : undefined;
      if (!counterpartOf.has(r.id) && pair) {
        counterpartOf.set(r.id, pair.male_id === r.user_id ? pair.female_id : pair.male_id);
      }
    }
  }
  const nameIds = [...new Set(counterpartOf.values())];
  const { data: people } = nameIds.length
    ? await db.from("profiles").select("id, name").in("id", nameIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id as string, p.name as string | null]));

  const markDone = (id: string) =>
    db
      .from("notifications")
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq("id", id);

  let pushed = 0;
  let inAppOnly = 0;
  let failed = 0;

  for (const row of rows) {
    const targets = devicesByUser.get(row.user_id) ?? [];
    // 알림 메일 인증 코드는 더 보내지 않는다(메일 알림 폐지). 남은 행만 정리한다.
    if (row.kind === "notification_email_verify" || !apns || targets.length === 0) {
      await markDone(row.id);
      inAppOnly++;
      continue;
    }

    const counterpartId = counterpartOf.get(row.id);
    const copy = notificationCopy(row.kind, {
      counterpart: counterpartId ? (nameById.get(counterpartId) ?? null) : null,
      meetingId: row.meeting_id,
    });

    let delivered = false;
    const errors: string[] = [];
    for (const device of targets) {
      /*
        개발 빌드(Xcode)는 sandbox 토큰을 준다. 처음 보는 토큰은 production 으로
        보내 보고, BadDeviceToken 이면 sandbox 로 다시 보낸다. 맞은 쪽을 기록한다.
      */
      const order: ApnsEnv[] = device.apns_env ? [device.apns_env] : ["production", "sandbox"];
      for (const env of order) {
        const r = await sendApns(apns, env, device.token, copy, {
          path: copy.path,
          notificationId: row.id,
        });
        if (r.ok) {
          delivered = true;
          if (device.apns_env !== env) {
            await db.from("device_tokens").update({ apns_env: env }).eq("token", device.token);
          }
          break;
        }
        if (DEAD_TOKEN.has(r.reason) || r.status === 410) {
          await db.from("device_tokens").delete().eq("token", device.token);
          break;
        }
        errors.push(`${env} ${r.status} ${r.reason}`);
        if (r.reason !== "BadDeviceToken") break;
      }
    }

    if (delivered || errors.length === 0) {
      // 토큰이 전부 죽어 지워졌으면 errors 도 비어 있다 — 목록에는 남으니 끝낸다.
      await markDone(row.id);
      if (delivered) pushed++;
      else inAppOnly++;
    } else {
      await db
        .from("notifications")
        .update({ attempts: row.attempts + 1, last_error: errors.join("; ").slice(0, 300) })
        .eq("id", row.id);
      failed++;
    }
  }

  return json({ pushed, inAppOnly, failed });
});
