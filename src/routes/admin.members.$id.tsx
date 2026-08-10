import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { toProfileView } from "@/lib/profileView";
import { fetchMemberDetail, setAccountState, type AdminMemberDetail } from "@/lib/admin";

export const Route = createFileRoute("/admin/members/$id")({ component: MemberDetail });

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
function MemberDetail() {
  const { id } = useParams({ from: "/admin/members/$id" });
  const [d, setD] = useState<AdminMemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setD(await fetchMemberDetail(id));
    } catch {
      setError("회원을 찾을 수 없습니다.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Back>{error}</Back>;
  if (!d) return <Back>불러오는 중…</Back>;

  const p = d.profile;
  const banned = p.account_state === "banned";
  const openMeetings = d.meetings.filter((m) => !m.cancelled_at && !m.completed_at).length;
  const pendingAgainst = d.reports_against.filter((r) => r.state === "pending").length;

  return (
    <>
      <Back />

      <header className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xl font-semibold">{p.name ?? "(이름 없음)"}</h2>
        {p.role === "admin" ? <Tag tone="muted">운영자</Tag> : null}
        {banned ? <Tag tone="alert">정지</Tag> : null}
        {p.account_state === "withdrawn" ? <Tag tone="muted">탈퇴</Tag> : null}
        {p.paused_at ? <Tag tone="muted">쉬는 중</Tag> : null}
        {p.onboarding_step < 7 ? <Tag tone="muted">가입 {p.onboarding_step}/7</Tag> : null}
        <span className="text-sm text-muted-foreground">
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
        <Summary label="미사용 티켓" v={d.tickets.filter((t) => t.state === "unused").length} />
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
          <div className="rounded-surface border border-border p-4">
            <ProfileDetail p={toProfileView(p)} />
          </div>
        </div>

        <div className="min-w-0">
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
                      {t.state === "unused" ? "미사용" : t.state === "used" ? "사용" : "환불"}
                    </Tag>
                    <span className="tabular-nums">{t.price_krw.toLocaleString()}원</span>
                    <span>구매 {when(t.issued_at)}</span>
                    {t.used_at ? <span>사용 {when(t.used_at)}</span> : null}
                    {t.refunded_at ? <span>환불 {when(t.refunded_at)}</span> : null}
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

          <Section title={`운영자 개입 ${d.admin_actions.length}`}>
            {d.admin_actions.length === 0 ? (
              <Empty>개입 기록이 없습니다.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.admin_actions.map((a, i) => (
                  <li key={i} className="text-muted-foreground">
                    <Tag tone="muted">{a.kind}</Tag> {a.actor_name} · {when(a.created_at)}
                    <p className="mt-0.5 text-xs">{a.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

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
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
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
  return (
    <>
      <Link to="/admin/members" className="text-sm text-muted-foreground hover:text-foreground">
        ← 회원 목록
      </Link>
      {children ? <p className="mt-4 text-sm text-muted-foreground">{children}</p> : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
