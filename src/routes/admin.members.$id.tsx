import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { toProfileView } from "@/lib/profileView";
import {
  fetchMemberDetail,
  fetchMemberTimeline,
  setAccountState,
  type AdminMemberDetail,
  type MemberTimelineItem,
  type MemberTimelinePage,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/members/$id")({ component: MemberPage });

function MemberPage() {
  const { id } = useParams({ from: "/admin/members/$id" });
  return <MemberDetail key={id} id={id} />;
}

const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });
const when = (s: string | null | undefined) => (s ? DATE.format(new Date(s)) : "—");

/**
 * 회원 상세 — 왼쪽은 **상대에게 보이는 프로필 그대로**, 오른쪽은 운영 정보.
 *
 * 프로필을 정의 목록(dt/dd)으로 늘어놓았더니 운영자가 "이 사람이 어떻게 보이나"
 * 를 판단할 수 없었다. 신고를 판정하거나 큐레이션을 짜는 일은 결국 그 판단이라,
 * 사용자 화면과 같은 <ProfileDetail> 을 쓴다 — 별도 레이아웃을 만들면 실제로
 * 어떻게 보이는지 확인할 수 없게 된다(profile.tsx 가 같은 이유로 그렇게 한다).
 */
function MemberDetail({ id }: { id: string }) {
  const [d, setD] = useState<AdminMemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const epoch = useRef(0);

  const load = useCallback(async () => {
    const request = ++epoch.current;
    setError(null);
    try {
      const detail = await fetchMemberDetail(id);
      if (active.current && request === epoch.current) setD(detail);
    } catch {
      if (active.current && request === epoch.current) setError("회원 정보를 불러오지 못했어요.");
    }
  }, [id]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      epoch.current += 1;
    };
  }, [load]);

  if (error)
    return (
      <>
        <Back />
        <div role="alert" className="app-elevated mt-4 rounded-surface bg-card p-5">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button className="mt-3" variant="outline" onClick={() => void load()}>
            다시 불러오기
          </Button>
        </div>
      </>
    );
  if (!d) return <Back>불러오는 중…</Back>;

  const p = d.profile;
  const banned = p.account_state === "banned";
  const openMeetings = d.meetings.filter((m) => !m.cancelled_at && !m.completed_at).length;
  const pendingAgainst = d.reports_against.filter((r) => r.state === "pending").length;
  const coordination = [
    ["첫 만남", "first_date"],
    ["연락 방식", "contact"],
    ["약속 조율", "planning"],
  ] as const;

  return (
    <>
      <Back />

      <header className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{p.name ?? "(이름 없음)"}</h1>
        {p.role === "admin" ? <Tag tone="muted">운영자</Tag> : null}
        {banned ? <Tag tone="alert">정지</Tag> : null}
        {p.account_state === "withdrawn" ? <Tag tone="muted">탈퇴</Tag> : null}
        {p.paused_at ? <Tag tone="muted">쉬는 중</Tag> : null}
        {p.onboarding_step < 7 ? <Tag tone="muted">가입 {p.onboarding_step}/7</Tag> : null}
        <span className="break-all text-sm text-muted-foreground">
          {p.gender === "female" ? "여성" : "남성"} · {hubLabel(p.hub_id)} · {p.company_email}
        </span>
      </header>

      {banned && p.banned_reason ? (
        <p className="mt-2 rounded-surface bg-primary/10 px-3 py-2 text-sm text-primary-strong">
          정지 사유 · {p.banned_reason}
        </p>
      ) : null}

      {/* 한눈 요약 — 아래 섹션을 열어보기 전에 "손댈 게 있나" 만 먼저 답한다. */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <Summary
          label="사용 가능 티켓"
          v={
            d.tickets.filter(
              (t) =>
                t.state === "unused" &&
                (t.expires_at === "infinity" || new Date(t.expires_at) > new Date()),
            ).length
          }
        />
        <Summary label="진행 중 만남" v={openMeetings} />
        <Summary label="미처리 신고" v={pendingAgainst} alert={pendingAgainst > 0} />
        <Summary label="운영자 개입" v={d.admin_actions.length} />
        <span>가입 {when(p.created_at)}</span>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[24rem_1fr]">
        {/*
          상대가 보는 모습. 폭을 앱과 비슷하게 묶어 둔다 — 넓게 늘리면 사진
          비율과 줄바꿈이 달라져서 "실제로 이렇게 보인다" 가 성립하지 않는다.
        */}
        <div className="min-w-0">
          <p className="mb-2 text-xs text-muted-foreground">상대에게 보이는 프로필</p>
          <div>
            <ProfileDetail p={toProfileView(p)} />
          </div>
        </div>

        <div className="min-w-0">
          {coordination.some(
            ([, key]) =>
              (d.preferences?.choices?.[key]?.length ?? 0) > 0 ||
              d.preferences?.choiceCustom?.[key],
          ) ? (
            <Section title="매칭·조율 참고">
              <dl className="space-y-3 text-sm">
                {coordination.map(([label, key]) => {
                  const value = [
                    ...(d.preferences?.choices?.[key] ?? []),
                    d.preferences?.choiceCustom?.[key],
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return value ? (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 text-foreground">{value}</dd>
                    </div>
                  ) : null;
                })}
              </dl>
            </Section>
          ) : null}
          <Section title={`티켓 ${d.tickets.length}`}>
            {d.tickets.length === 0 ? (
              <Empty>구매한 티켓이 없습니다.</Empty>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.tickets.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-x-3 text-muted-foreground"
                  >
                    <Tag tone={t.state === "refunded" ? "alert" : "muted"}>
                      {t.state === "unused"
                        ? t.expires_at === "infinity" || new Date(t.expires_at) > new Date()
                          ? "미사용"
                          : "만료"
                        : t.state === "used"
                          ? "사용"
                          : "반환"}
                    </Tag>
                    <span className="tabular-nums">{t.price_krw.toLocaleString()}원</span>
                    <span>발급 {when(t.issued_at)}</span>
                    <span>
                      기한 {t.expires_at === "infinity" ? "없음 · 기존 무료" : when(t.expires_at)}
                    </span>
                    {t.used_at ? <span>사용 {when(t.used_at)}</span> : null}
                    {t.refunded_at ? <span>반환 {when(t.refunded_at)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`만남 ${d.meetings.length}`}>
            {d.meetings.length === 0 ? (
              <Empty>만남 이력이 없습니다.</Empty>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.meetings.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-2.5 text-muted-foreground"
                  >
                    <Link
                      to="/admin/members/$id"
                      params={{ id: m.counterpart_id }}
                      className="font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      {m.counterpart ?? "(이름 없음)"}
                    </Link>
                    {m.cancelled_at ? (
                      <Tag tone="alert">취소 · {m.cancel_reason ?? "사유 없음"}</Tag>
                    ) : m.completed_at ? (
                      <Tag tone="muted">완료</Tag>
                    ) : m.confirmed_at ? (
                      <Tag tone="muted">확정</Tag>
                    ) : (
                      <Tag tone="muted">조율 중</Tag>
                    )}
                    {m.scheduled_at ? (
                      <span className="tabular-nums">
                        {when(m.scheduled_at)} · {m.place_name ?? "장소 미정"}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`받은 신고 ${d.reports_against.length}`}>
            {d.reports_against.length === 0 ? (
              <Empty>받은 신고가 없습니다.</Empty>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.reports_against.map((r) => (
                  <li key={r.id} className="text-muted-foreground">
                    <ReportTag state={r.state} /> {r.reporter_name} · {r.detail}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 자주 신고하는 쪽도 판단 재료다 — 신고 남용을 이 화면에서 본다. */}
          <Section title={`한 신고 ${d.reports_filed.length}`}>
            {d.reports_filed.length === 0 ? (
              <Empty>접수한 신고가 없습니다.</Empty>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.reports_filed.map((r) => (
                  <li key={r.id} className="text-muted-foreground">
                    <ReportTag state={r.state} /> {r.accused_name} · {r.detail}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <MemberTimeline key={id} id={id} />

          <AccountState
            id={id}
            banned={banned}
            isAdmin={p.role === "admin"}
            openMeetings={openMeetings}
            onDone={load}
          />
        </div>
      </div>
    </>
  );
}

const TIMELINE_LABEL: Record<string, string> = {
  support_requested: "문의 접수",
  support_answered: "문의 답변",
  photo_submitted: "사진 변경",
  photo_reviewed: "사진 검수",
  content_reported: "신고 접수",
  content_report_resolved: "신고 판정",
  no_show_reported: "노쇼 신고",
  no_show_resolved: "노쇼 판정",
  payment_attention: "결제 확인 필요",
  payment_reconciled: "결제 확인 완료",
  meeting_confirmed: "약속 확정",
  meeting_attendance_confirmed: "참석 의사 확인",
  meeting_response_warning: "미응답 경고 기록",
  meeting_canceled: "약속 취소",
  ticket_issued: "티켓 발급",
  ticket_consumed: "티켓 사용",
  ticket_restored: "티켓 반환",
  intro_delivered: "소개 도착",
  intro_opened: "소개 열람",
  intro_expired: "소개 만료",
};

function MemberTimeline({ id }: { id: string }) {
  const [items, setItems] = useState<MemberTimelineItem[] | null>(null);
  const [cursor, setCursor] = useState<MemberTimelinePage["next_cursor"]>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (append = false) => {
      setBusy(true);
      setError(false);
      try {
        const page = await fetchMemberTimeline(id, append ? cursor : null);
        setItems((current) => (append && current ? [...current, ...page.items] : page.items));
        setCursor(page.next_cursor);
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [id, cursor],
  );

  useEffect(() => {
    void load(false);
    // A different member starts at the first page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <Section title="운영 타임라인">
      <p className="mb-3 text-xs text-muted-foreground">
        새 계측을 시작한 이후의 사건과 기존 운영자 개입 기록입니다.
      </p>
      {error ? (
        <button
          type="button"
          onClick={() => void load(false)}
          className="text-xs text-destructive underline"
        >
          이력을 확인할 수 없습니다. 다시 시도
        </button>
      ) : items === null ? (
        <Empty>이력을 불러오는 중입니다.</Empty>
      ) : items.length === 0 ? (
        <Empty>아직 기록된 사건이 없습니다.</Empty>
      ) : (
        <ol className="space-y-3 border-l border-border pl-3">
          {items
            .filter(
              (item) => !(item.object_type === "admin_action" && item.kind === "case_transition"),
            )
            .map((item) => (
              <li key={item.id} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {TIMELINE_LABEL[item.kind] ??
                      (item.object_type === "admin_action" ? "운영 조치" : item.kind)}
                  </span>
                  <span className="text-xs text-muted-foreground">{when(item.at)}</span>
                  {item.object_type === "ops_case" ? (
                    <Link
                      to="/admin/tasks"
                      search={{ caseId: item.object_id }}
                      className="text-xs text-primary-strong hover:underline"
                    >
                      작업 보기
                    </Link>
                  ) : null}
                </div>
                {typeof item.details.note === "string" ? (
                  <p className="mt-1 text-xs text-muted-foreground">{item.details.note}</p>
                ) : null}
              </li>
            ))}
        </ol>
      )}
      {cursor && !error ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(true)}
          className="mt-3 text-xs text-primary-strong hover:underline disabled:opacity-50"
        >
          {busy ? "불러오는 중…" : "이전 기록 더 보기"}
        </button>
      ) : null}
    </Section>
  );
}

/**
 * 정지·해제는 접어서 맨 아래에 둔다.
 *
 * 자주 쓰는 일이 아니고(대부분은 신고 탭에서 인정과 함께 처리된다) 되돌리기
 * 비용이 큰 조작이다. 프로필 위에 사유 입력창을 펼쳐 두면 화면에서 가장 눈에
 * 띄는 자리를 가장 드물게 쓰는 파괴적 조작이 차지한다.
 *
 * 운영자 계정은 서버가 거절한다 — 마지막 운영자를 정지시키면 아무도 들어올 수
 * 없다. 그래서 접는 버튼조차 내지 않는다.
 */
function AccountState({
  id,
  banned,
  isAdmin,
  openMeetings,
  onDone,
}: {
  id: string;
  banned: boolean;
  isAdmin: boolean;
  openMeetings: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (isAdmin) {
    return (
      <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        운영자 계정은 이 화면에서 상태를 바꿀 수 없습니다.
      </p>
    );
  }

  return (
    <div className="mt-8 border-t border-border pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="pressable inline-flex min-h-11 items-center rounded-control px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {open ? "닫기" : banned ? "정지 해제…" : "계정 정지…"}
      </button>

      {open ? (
        <div className="mt-3 rounded-surface border border-border p-4">
          <p className="text-xs text-muted-foreground">
            {banned
              ? "해제하면 다시 소개·만남에 참여합니다."
              : openMeetings > 0
                ? `진행 중인 만남 ${openMeetings}건이 취소되고, 티켓을 낸 쪽이 이 회원이 아니면 상대에게 환불됩니다.`
                : "진행 중인 만남이 없어 취소·환불은 일어나지 않습니다."}
          </p>
          <NoteAction
            placeholder="사유 (필수 — 기록에 남습니다)"
            onDone={() => {
              setOpen(false);
              onDone();
            }}
            actions={[
              banned
                ? {
                    label: "정지 해제",
                    done: "정지를 해제했습니다.",
                    run: (note) => setAccountState(id, "active", note),
                  }
                : {
                    label: "계정 정지",
                    done: "정지했습니다.",
                    variant: "destructive",
                    run: (note) => setAccountState(id, "banned", note),
                  },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReportTag({ state }: { state: "pending" | "confirmed" | "dismissed" }) {
  return (
    <Tag tone={state === "pending" ? "alert" : "muted"}>
      {state === "pending" ? "미처리" : state === "confirmed" ? "인정" : "기각"}
    </Tag>
  );
}

function Summary({ label, v, alert }: { label: string; v: number; alert?: boolean }) {
  return (
    <span>
      {label}{" "}
      <span
        className={`font-semibold tabular-nums ${alert ? "text-primary-strong" : "text-foreground"}`}
      >
        {v}
      </span>
    </span>
  );
}

function Back({ children }: { children?: React.ReactNode }) {
  const search = useSearch({ from: "/admin/members" });
  return (
    <>
      <Button asChild variant="ghost" className="-ml-3">
        <Link to="/admin/members" search={search}>
          <ArrowLeft aria-hidden="true" />
          회원 목록
        </Link>
      </Button>
      {children ? <p className="mt-4 text-sm text-muted-foreground">{children}</p> : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="app-elevated mt-4 rounded-surface bg-card p-5 first:mt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
