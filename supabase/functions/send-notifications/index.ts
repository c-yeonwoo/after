// S9 — 알림 아웃박스 발송 워커.
//
// notifications 표에서 아직 안 보낸 행을 꺼내 메일로 보낸다. 아웃박스에 행을
// 남기는 쪽(트리거·cron)은 발송을 절대 시도하지 않는다 — 상태 전이 트랜잭션이
// 메일 서버 속도에 묶이면 안 되고, 롤백된 전이에 대한 메일이 나가서도 안 된다.
//
// 왜 함수가 스스로 표를 비우는가:
//   pg_cron 에서 pg_net 으로 이 함수를 부르려면 service_role 키를 DB 안에
//   (Vault 등에) 넣어야 한다. 그 키는 환경마다 달라 마이그레이션에 담을 수도 없다.
//   Edge Runtime 은 SUPABASE_SERVICE_ROLE_KEY 를 이미 환경에 갖고 있으므로,
//   함수가 직접 조회·발송·표시하면 비밀을 한 곳에만 둘 수 있다.
//   운영에서는 Supabase 의 Edge Function 스케줄로 분 단위 호출한다.
//
// 실패는 삼키지 않는다. attempts·last_error 를 남겨 아웃박스에서 눈에 보이게 한다.

import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";
import { transportFromEnv } from "../_shared/mail-transport.ts";
import {
  pathFor,
  renderNotification,
  type NotificationKind,
} from "../_shared/notification-mail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 앱의 공개 주소. 메일 안 링크가 여기로 붙는다.
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:55317";

// 발송 경로는 _shared/mail-transport.ts 가 환경에서 고른다(로컬 Mailpit / 운영 Resend).

/** 한 번 호출에서 처리할 최대 건수. 타임아웃 안에 끝나도록 묶는다. */
const BATCH = Number(Deno.env.get("NOTIFY_BATCH") ?? "50");
/** 이 횟수를 넘게 실패한 행은 더 시도하지 않는다(사람이 봐야 하는 상태). */
const MAX_ATTEMPTS = 5;

type PendingRow = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  meeting_id: string | null;
  attempts: number;
  payload: { counterpart_id?: string } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 설정이 없으면 여기서 끝낸다. 아웃박스에 sent_at 을 찍어 놓고 실제로는
  // 아무 데도 안 보내는 상황을 만들지 않는다.
  let send;
  try {
    send = transportFromEnv((k) => Deno.env.get(k));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: pending, error: pendErr } = await db
    .from("notifications")
    .select("id, user_id, kind, meeting_id, attempts, payload")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (pendErr) return json({ error: pendErr.message }, 500);
  if (!pending?.length) return json({ sent: 0, failed: 0, skipped: 0 });

  const rows = pending as PendingRow[];

  // 받는 사람과 상대 이름을 한 번에 모아 온다 — 건별 조회는 N+1 이다.
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.user_id);
    if (r.payload?.counterpart_id) ids.add(r.payload.counterpart_id);
  }
  const { data: people, error: peopleErr } = await db
    .from("profiles")
    .select("id, name, company_email")
    .in("id", [...ids]);
  if (peopleErr) return json({ error: peopleErr.message }, 500);

  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  // feedback_due 는 payload 에 상대가 없다(cron 이 만든다) — 만남에서 역산한다.
  const meetingIds = [
    ...new Set(
      rows.filter((r) => !r.payload?.counterpart_id && r.meeting_id).map((r) => r.meeting_id!),
    ),
  ];
  const counterpartByMeeting = new Map<string, { male_id: string; female_id: string }>();
  if (meetingIds.length) {
    const { data: ms } = await db
      .from("meetings")
      .select("id, intro_id, intros!inner(male_id, female_id)")
      .in("id", meetingIds);
    for (const m of ms ?? []) {
      const i = (m as unknown as { intros: { male_id: string; female_id: string } }).intros;
      if (i) counterpartByMeeting.set(m.id as string, i);
    }
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const to = byId.get(row.user_id);
    if (!to?.company_email) {
      // 받을 주소가 없으면 재시도해도 달라지지 않는다. 사유를 남기고 소진시킨다.
      await db
        .from("notifications")
        .update({ attempts: MAX_ATTEMPTS, last_error: "recipient email missing" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    let counterpartId = row.payload?.counterpart_id ?? null;
    if (!counterpartId && row.meeting_id) {
      const pair = counterpartByMeeting.get(row.meeting_id);
      if (pair) counterpartId = pair.male_id === row.user_id ? pair.female_id : pair.male_id;
    }
    const counterpartName = counterpartId ? (byId.get(counterpartId)?.name ?? null) : null;

    const mail = renderNotification(row.kind, {
      name: to.name ?? null,
      counterpart: counterpartName,
      url: `${APP_URL}${pathFor(row.kind, row.meeting_id)}`,
    });

    try {
      await send({ to: to.company_email, subject: mail.subject, text: mail.text });
      await db
        .from("notifications")
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      sent++;
    } catch (err) {
      await db
        .from("notifications")
        .update({
          attempts: row.attempts + 1,
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return json({ sent, failed, skipped });
});
