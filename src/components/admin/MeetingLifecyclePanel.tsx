import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type Item = {
  id: string;
  scheduled_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  attendance_policy_version: string | null;
  male_attendance_at: string | null;
  female_attendance_at: string | null;
  male_id: string;
  female_id: string;
  male_name: string;
  female_name: string;
  feedback_count: number;
  nudge_count: number;
  male_warnings: number;
  female_warnings: number;
  male_notice_read: boolean;
  female_notice_read: boolean;
};
type Overview = { as_of: string; total: number; items: Item[] };

function status(item: Item, now: number) {
  if (item.cancelled_at)
    return item.cancel_reason === "checkin_no_response" ? "미응답 취소 · 티켓 복구" : "취소";
  if (item.feedback_count === 2) return "양측 후기 완료";
  if (Date.parse(item.scheduled_at) <= now) return `후기 ${item.feedback_count}/2명`;
  if (!item.attendance_policy_version) return "기존 약속 · 참석 확인 미적용";
  if (item.male_attendance_at && item.female_attendance_at) return "양측 참석 확인";
  if (Date.parse(item.scheduled_at) <= now + 2 * 3600_000) {
    if (
      !item.male_attendance_at &&
      !item.female_attendance_at &&
      (!item.male_notice_read || !item.female_notice_read)
    )
      return "안내 열람 미확인 · 운영 연락 필요";
    return "참석 미확인 · 운영 확인 필요";
  }
  return "참석 확인 대기";
}

export function MeetingLifecyclePanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let alive = true,
      loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      if (alive) setBusy(true);
      try {
        const r = await supabase.rpc("admin_meeting_lifecycle");
        if (r.error) throw r.error;
        const next = r.data as unknown as Overview;
        if (!next || !Array.isArray(next.items) || typeof next.total !== "number")
          throw new Error("invalid response");
        if (alive) {
          setData(next);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      } finally {
        loading = false;
        if (alive) setBusy(false);
      }
    }
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [retry]);
  const rows = data?.items ?? [];
  return (
    <section
      aria-label="참석과 후기 모니터링"
      className="mb-6 rounded-surface border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">참석과 후기</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            최근 14일 이후 약속 {data ? `${data.total}건` : "확인 중"} · 최대 100건 · 화면을 보는
            동안 30초마다 갱신
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setRetry((v) => v + 1)}>
          참석 현황 새로고침
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          현재 상태를 불러오지 못했습니다. 이전 조회 결과일 수 있어요. 다시 확인해 주세요.
        </p>
      ) : null}
      {data ? (
        <p className="mt-2 text-xs text-muted-foreground">
          조회 시각 {new Date(data.as_of).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}
        </p>
      ) : null}
      {data && !rows.length ? (
        <p className="mt-4 text-sm text-muted-foreground">확정된 약속이 없습니다.</p>
      ) : null}
      <ul className="mt-3 divide-y divide-border">
        {(expanded ? rows : rows.slice(0, 5)).map((item) => (
          <li key={item.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to="/admin/meetings"
                search={{ meeting: item.id }}
                className="text-sm font-semibold underline-offset-4 hover:underline"
              >
                {item.male_name} · {item.female_name}
              </Link>
              <span className="text-xs font-medium text-foreground">
                {status(item, Date.parse(data!.as_of))}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {new Date(item.scheduled_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} ·
              참석 {item.male_attendance_at ? "남 확인" : "남 미확인"} /{" "}
              {item.female_attendance_at ? "여 확인" : "여 미확인"} · 인앱 알림 {item.nudge_count}회
            </p>
            {item.male_warnings >= 2 || item.female_warnings >= 2 ? (
              <p className="mt-2 text-xs font-medium text-primary-strong">
                반복 미응답 검토 ·{" "}
                <Link
                  to="/admin/members/$id"
                  params={{ id: item.male_warnings >= 2 ? item.male_id : item.female_id }}
                  className="underline underline-offset-4"
                >
                  회원 확인
                </Link>{" "}
                (자동정지 없음)
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length > 5 ? (
        <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "접기" : `${rows.length}건 보기`}
        </Button>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        한 분만 참석을 확인한 약속은 자동취소하지 않습니다. 상대 확인이 늦으면 운영팀이 직접 조율해
        주세요. 알림 횟수는 인앱 생성 건수이며 기기 수신을 의미하지 않습니다. 양측의 안내 열람이
        확인되지 않은 약속도 자동취소·경고 대신 운영팀 연락이 필요합니다.
      </p>
    </section>
  );
}
