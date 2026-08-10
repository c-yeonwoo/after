import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { hubLabel, optionLabel } from "@/components/admin/labels";
import {
  DRINKING_OPTIONS,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
} from "@/components/onboarding/basics";
import { usePhotoUrl } from "@/lib/photo";
import { fetchMemberDetail, setAccountState, type AdminMemberDetail } from "@/lib/admin";

export const Route = createFileRoute("/admin/members/$id")({ component: MemberDetail });

const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const when = (s: string | null | undefined) => (s ? DATE.format(new Date(s)) : "—");

function MemberDetail() {
  const { id } = useParams({ from: "/admin/members/$id" });
  const [d, setD] = useState<AdminMemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  return (
    <>
      <Back />

      <header className="mt-4 flex flex-wrap items-start gap-4">
        <Photo path={p.photo_url} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{p.name ?? "(이름 없음)"}</h2>
            {p.role === "admin" ? <Tag tone="muted">운영자</Tag> : null}
            {banned ? <Tag tone="alert">정지</Tag> : null}
            {p.account_state === "withdrawn" ? <Tag tone="muted">탈퇴</Tag> : null}
            {p.paused_at ? <Tag tone="muted">쉬는 중</Tag> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.gender === "female" ? "여성" : "남성"} · {hubLabel(p.hub_id)} ·{" "}
            {p.job ?? "직업 미기재"}
          </p>
          <p className="text-sm text-muted-foreground">{p.company_email}</p>
          {banned && p.banned_reason ? (
            <p className="mt-2 text-sm text-primary-strong">정지 사유 · {p.banned_reason}</p>
          ) : null}
        </div>
      </header>

      {/*
        정지·해제. 운영자 계정은 서버가 거절한다(마지막 운영자를 정지시키면
        아무도 들어올 수 없다) — 그래서 버튼 자체를 내지 않는다.

        정지하면 서버가 진행 중 만남을 끊고, 티켓 주인이 위반자가 아니면
        환불까지 한다. 문구에 그 사실을 적어 운영자가 결과를 알고 누르게 한다.
      */}
      {p.role === "admin" ? (
        <p className="mt-6 text-sm text-muted-foreground">
          운영자 계정은 이 화면에서 상태를 바꿀 수 없습니다.
        </p>
      ) : (
        <section className="mt-6 rounded-surface border border-border p-4">
          <h3 className="text-sm font-semibold">계정 상태</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {banned
              ? "해제하면 다시 소개·만남에 참여합니다."
              : "정지하면 진행 중인 만남이 취소되고, 티켓을 낸 쪽이 이 회원이 아니면 상대에게 환불됩니다."}
          </p>
          <NoteAction
            placeholder="사유 (필수 — 기록에 남습니다)"
            onDone={load}
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
        </section>
      )}

      <Section title="프로필">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="한 줄 소개" v={p.headline} />
          <Row k="소개글" v={p.intro} />
          <Row k="생년월일" v={p.birth} />
          <Row k="MBTI" v={p.mbti} />
          <Row k="흡연" v={optionLabel(SMOKING_OPTIONS, p.smoking)} />
          <Row k="음주" v={optionLabel(DRINKING_OPTIONS, p.drinking)} />
          <Row k="종교" v={optionLabel(RELIGION_OPTIONS, p.religion)} />
          <Row k="관심사" v={p.interests?.join(", ")} />
          <Row k="매칭 태그" v={p.match_tags?.join(", ")} />
          <Row k="대화 주제" v={p.topics?.join(", ")} />
          <Row k="가입 단계" v={`${p.onboarding_step}/7`} />
          <Row k="가입일" v={when(p.created_at)} />
          <Row k="이메일 인증" v={when(p.email_verified_at)} />
          <Row k="약관 동의" v={`${when(p.terms_agreed_at)} (${p.agreed_policy_version ?? "—"})`} />
        </dl>
      </Section>

      <Section title={`티켓 ${d.tickets.length}`}>
        {d.tickets.length === 0 ? (
          <Empty>구매한 티켓이 없습니다.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {d.tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap gap-x-3 text-muted-foreground">
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
          <ul className="space-y-2 text-sm">
            {d.meetings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
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
                  <span>
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
          <ul className="space-y-2 text-sm">
            {d.reports_against.map((r) => (
              <li key={r.id} className="text-muted-foreground">
                <Tag tone={r.state === "pending" ? "alert" : "muted"}>
                  {r.state === "pending" ? "미처리" : r.state === "confirmed" ? "인정" : "기각"}
                </Tag>{" "}
                {r.reporter_name} · {r.detail}
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
          <ul className="space-y-2 text-sm">
            {d.reports_filed.map((r) => (
              <li key={r.id} className="text-muted-foreground">
                <Tag tone="muted">
                  {r.state === "pending" ? "미처리" : r.state === "confirmed" ? "인정" : "기각"}
                </Tag>{" "}
                {r.accused_name} · {r.detail}
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
    </>
  );
}

/**
 * 사진은 비공개 버킷이라 서명 URL 이 필요하다. s17 이 운영자용 읽기 정책을
 * 따로 붙였다 — 기존 정책은 public_profiles 로 보이는 사람만 허용해서
 * 운영자에게는 자기 사진만 보였다.
 */
function Photo({ path }: { path: string | null }) {
  const url = usePhotoUrl(path);
  if (!path) {
    return (
      <div className="grid size-28 shrink-0 place-items-center rounded-surface border border-border text-2xs text-muted-foreground">
        사진 없음
      </div>
    );
  }
  return (
    <div className="size-28 shrink-0 overflow-hidden rounded-surface border border-border bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
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
    <section className="mt-8">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v || "—"}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
