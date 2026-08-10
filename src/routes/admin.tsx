import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/Logo";
import { useMe } from "@/lib/me";
import {
  ALREADY_RESOLVED,
  amIAdmin,
  fetchDashboard,
  fetchReports,
  resolveReport,
  type AdminDashboard,
  type AdminReport,
} from "@/lib/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "운영" },
      // 운영 화면은 검색에 잡힐 이유가 없다.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

/**
 * 운영자 화면.
 *
 * **앱 번들에 들어가지 않는다** — vite.config.ts 가 `admin.` 으로 시작하는 라우트
 * 파일을 앱 빌드에서 제외한다. 운영자는 웹으로만 들어온다.
 *
 * 여기서 하는 권한 확인은 화면을 감추는 것이지 보안이 아니다. 실제 방어는 서버의
 * is_admin() 이고, 그걸 통과 못 하면 아래 모든 호출이 42501 로 튕긴다.
 *
 * 레이아웃이 사용자 화면(AppScreen)과 다르다. 모바일 폭에 갇힌 프레임은 표를
 * 보기에 나쁘고, 운영자는 데스크톱에서 본다.
 */
function AdminPage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/login" });
  }, [ready, me, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ok = await amIAdmin();
      setIsAdmin(ok);
      if (!ok) return;
      const [d, r] = await Promise.all([fetchDashboard(), fetchReports()]);
      setDash(d);
      setReports(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && me) void load();
  }, [ready, me, load]);

  if (!ready || loading) {
    return <Shell>불러오는 중…</Shell>;
  }
  if (isAdmin === false) {
    return <Shell>운영자만 볼 수 있는 화면입니다.</Shell>;
  }

  const pending = reports.filter((r) => r.state === "pending");
  const resolved = reports.filter((r) => r.state !== "pending");

  return (
    <Shell>
      {dash ? <Dashboard d={dash} /> : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          미처리 신고 <span className="text-muted-foreground tabular-nums">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">처리할 신고가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((r) => (
              <ReportCard key={r.id} r={r} onResolved={load} />
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">처리된 신고</h2>
          <ul className="mt-4 space-y-2">
            {resolved.map((r) => (
              <li
                key={r.id}
                className="rounded-surface border border-border px-4 py-3 text-sm text-muted-foreground"
              >
                <span className={r.state === "confirmed" ? "text-primary-strong" : ""}>
                  {r.state === "confirmed" ? "인정" : "기각"}
                </span>{" "}
                · {r.reporter_name} → {r.accused_name} · {r.detail}
                {/*
                  처리 사유를 반드시 같이 보여준다. 서버가 note 를 not null 로
                  강제하는 이유가 "왜 그렇게 처리했는지" 를 남기는 것인데, 그걸
                  화면에 돌려주지 않으면 DB 를 열어야만 알 수 있다.

                  생성된 타입은 RETURNS TABLE 컬럼을 전부 non-null 로 적지만
                  미처리 건에는 실제로 null 이 온다 — message_body 와 같은
                  이유로 값 검사를 한다.
                */}
                {r.resolve_note ? (
                  <p className="mt-1 text-xs">처리 사유 · {r.resolve_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  /*
    스크롤을 여기서 직접 쥔다.

    styles.css 가 html·body 에 overflow:hidden 을 걸어 문서 스크롤을 잠갔다
    (iOS 에서 본문이 상태바 밑으로 지나가고 키보드가 헤더를 밀어 올리던 문제).
    사용자 화면은 AppScreen 의 main 이 스크롤을 맡지만 운영 화면은 그 프레임
    밖이라, 이걸 안 주면 신고가 쌓이는 순간 아래가 잘려 안 보인다.
  */
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header
        className="shrink-0 border-b border-border px-6 pb-4"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-muted-foreground">운영</span>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * 지표 배치가 의도적이다 — 규모(가입·활성)보다 **적체와 품질**을 위에 둔다.
 * 운영자가 매일 확인해야 하는 것은 "밀리고 있는가"이지 "몇 명인가"가 아니다.
 */
function Dashboard({ d }: { d: AdminDashboard }) {
  const passRate =
    d.quality.intros_total > 0
      ? Math.round((d.quality.intros_passed / d.quality.intros_total) * 100)
      : null;

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold">적체</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="미처리 신고"
            value={d.backlog.pending_reports}
            alert={d.backlog.pending_reports > 0}
          />
          <Stat
            label="미처리 노쇼"
            value={d.backlog.pending_no_shows}
            alert={d.backlog.pending_no_shows > 0}
          />
          <Stat label="소개 안 된 호감" value={d.backlog.unmatched_likes} />
          <Stat
            label="가장 오래 기다린 호감"
            value={d.backlog.oldest_like_hours}
            unit="시간"
            alert={(d.backlog.oldest_like_hours ?? 0) > 72}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">품질</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="소개 넘김 비율" value={passRate} unit="%" alert={(passRate ?? 0) > 60} />
          <Stat label="소개 전체" value={d.quality.intros_total} />
          <Stat label="티켓 사용" value={d.quality.intros_used} />
          <Stat label="완료된 만남" value={d.flow.completed} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">규모</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="여성" value={d.members.female} />
          <Stat label="남성" value={d.members.male} />
          <Stat label="잠시 쉬는 중" value={d.members.paused} />
          <Stat label="정지" value={d.members.banned} alert={d.members.banned > 0} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="열린 소개" value={d.flow.open_intros} />
          <Stat label="진행 중 만남" value={d.flow.active_meetings} />
          <Stat label="확정" value={d.flow.confirmed} />
        </div>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  alert,
}: {
  label: string;
  value: number | null;
  unit?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-surface border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-primary-strong" : ""}`}
      >
        {value ?? "—"}
        {unit && value !== null ? <span className="ml-0.5 text-sm">{unit}</span> : null}
      </p>
    </div>
  );
}

function ReportCard({ r, onResolved }: { r: AdminReport; onResolved: () => void }) {
  const [note, setNote] = useState("");
  const [ban, setBan] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(upheld: boolean) {
    if (note.trim().length === 0) {
      toast.error("사유를 적어 주세요.");
      return;
    }
    setBusy(true);
    try {
      await resolveReport(r.id, upheld, note.trim(), upheld && ban);
      toast.success(upheld ? "인정 처리했습니다." : "기각했습니다.");
      onResolved();
    } catch (e) {
      /*
        경합은 장애가 아니다. 운영자 둘이 같은 목록을 열고 있으면 한쪽은 반드시
        늦는다 — 그때 "처리하지 못했습니다" 는 자기 실수처럼 읽힌다. 이유를
        말하고 목록을 다시 불러 최신 상태를 보여준다.
      */
      if ((e as { code?: string } | null)?.code === ALREADY_RESOLVED) {
        toast.error("다른 운영자가 먼저 처리했습니다.");
        onResolved();
      } else {
        toast.error("처리하지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-surface border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">{r.reporter_name}</span>
        <span className="text-muted-foreground">신고 →</span>
        <span className="font-semibold">{r.accused_name}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
          {r.kind === "message" ? "메시지" : "프로필"}
        </span>
        {r.accused_state === "banned" ? (
          <span className="text-2xs text-primary-strong">이미 정지됨</span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-relaxed">{r.detail}</p>

      {r.message_body ? (
        <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
          {r.message_body}
        </blockquote>
      ) : null}

      <Textarea
        className="mt-3"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="처리 사유 (필수 — 기록에 남습니다)"
        aria-label="처리 사유"
      />

      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ban}
          onChange={(e) => setBan(e.target.checked)}
          className="size-4"
        />
        인정과 함께 계정 정지
      </label>

      <div className="mt-3 flex gap-2">
        {/*
          인정하면 신고자 티켓이 환불된다(서버에서) — 단 **만남이 딸린 신고만**
          이다. resolve_content_report 는 meeting_id 가 없으면 돌려줄 티켓을
          찾지 않는다. 그런데도 문구에 환불을 적어두면 만남 없는 프로필 신고를
          처리한 운영자가 환불된 줄 알게 된다. 실제로 일어나는 일만 적는다.
        */}
        <Button size="sm" disabled={busy} onClick={() => act(true)}>
          {r.meeting_id ? "인정 · 티켓 환불" : "인정"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(false)}>
          기각
        </Button>
      </div>
    </li>
  );
}
