import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import { HUBS } from "@/lib/brand";
import { fetchMembers, type AccountState, type AdminMember, type Gender } from "@/lib/admin";

/**
 * 필터를 URL 에 둔다.
 *
 * 대시보드의 숫자가 이 화면의 특정 모집단으로 연결되어야 하고("정지 1" → 정지된
 * 회원 목록), 운영자끼리 "이 화면 링크 줘" 가 되어야 한다. 컴포넌트 state 에만
 * 있으면 둘 다 안 된다.
 */
type MemberSearch = {
  gender?: Gender;
  state?: AccountState;
  hub?: string;
  paused?: boolean;
  q?: string;
};

export const Route = createFileRoute("/admin/members")({
  // 알 수 없는 값은 조용히 버린다 — 손으로 고친 URL 로 화면이 깨지지 않게.
  validateSearch: (s: Record<string, unknown>): MemberSearch => ({
    gender: s.gender === "male" || s.gender === "female" ? s.gender : undefined,
    state:
      s.state === "active" || s.state === "banned" || s.state === "withdrawn" ? s.state : undefined,
    hub: HUBS.some((h) => h.id === s.hub) ? (s.hub as string) : undefined,
    paused: typeof s.paused === "boolean" ? s.paused : s.paused === "true" ? true : undefined,
    // URL 은 공유·브라우저 기록에 남는다. 기존 이름 검색만 호환한다.
    q:
      typeof s.q === "string" && s.q.trim() && !s.q.includes("@") && !/\d{7,}/.test(s.q)
        ? s.q
        : undefined,
  }),
  component: MembersTab,
});

function MembersTab() {
  const search = Route.useSearch();
  // Keep private email searches in memory while the detail route is open, never in the URL.
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => {
    setQ(search.q ?? "");
  }, [search.q]);
  /*
    상세는 자식 라우트다. 목록이 있는 자리에 상세를 겹쳐 놓으면 "목록으로
    돌아가기" 가 브라우저 뒤로가기에만 의존하게 되는데, 운영자는 목록 ↔ 상세를
    계속 왕복한다. 상세가 열려 있을 때는 목록을 접어 둔다.
  */
  const showingDetail = useMatches().some((m) => m.routeId === "/admin/members/$id");
  if (showingDetail) return <Outlet />;
  return <MemberList q={q} setQ={setQ} />;
}

function MemberList({ q, setQ }: { q: string; setQ: (value: string) => void }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<AdminMember[] | null>(null);
  // 검색어만 로컬에 둔다 — 타이핑마다 URL 을 갈면 뒤로가기 이력이 글자 수만큼 쌓인다.
  const loadSequence = useRef(0);
  const [loading, setLoading] = useState(true);

  const set = (patch: Partial<MemberSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const [loadError, setLoadError] = useState(false);
  const load = useCallback(async (s: MemberSearch, query: string) => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const result = await fetchMembers({
        gender: s.gender,
        state: s.state,
        hub: s.hub,
        paused: s.paused,
        query,
      });
      if (sequence === loadSequence.current) setRows(result);
    } catch {
      if (sequence === loadSequence.current) setLoadError(true);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSequence.current += 1;
    setRows(null);
    setLoading(true);
    setLoadError(false);
    const t = setTimeout(() => void load(search, q), 250);
    return () => {
      clearTimeout(t);
      loadSequence.current += 1;
    };
  }, [search, q, load]);

  const active = search.gender || search.state || search.hub || search.paused !== undefined || q;

  return (
    <>
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">회원 관리</h1>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(search, q)}>
          새로고침
        </Button>
      </header>
      <div
        aria-label="회원 검색과 필터"
        className="app-elevated grid grid-cols-2 items-center gap-3 rounded-surface bg-card p-4 sm:flex sm:flex-wrap"
      >
        <Select
          label="성별"
          value={search.gender ?? ""}
          onChange={(v) => set({ gender: (v || undefined) as Gender | undefined })}
          options={[
            { v: "", label: "성별 전체" },
            { v: "female", label: "여성" },
            { v: "male", label: "남성" },
          ]}
        />
        <Select
          label="회원 상태"
          value={search.state ?? ""}
          onChange={(v) => set({ state: (v || undefined) as AccountState | undefined })}
          options={[
            { v: "", label: "상태 전체" },
            { v: "active", label: "정상" },
            { v: "banned", label: "정지" },
            { v: "withdrawn", label: "탈퇴" },
          ]}
        />
        {/* 아직 열지 않은 권역도 남긴다 — 잘못 들어간 데이터를 찾아야 한다. */}
        <Select
          label="선호 만남 지역"
          value={search.hub ?? ""}
          onChange={(v) => set({ hub: v || undefined })}
          options={[
            { v: "", label: "권역 전체" },
            ...HUBS.map((h) => ({ v: h.id, label: h.label })),
          ]}
        />
        <Select
          label="소개 활동"
          value={search.paused === undefined ? "" : search.paused ? "y" : "n"}
          onChange={(v) => set({ paused: v === "" ? undefined : v === "y" })}
          options={[
            { v: "", label: "쉬는 중 전체" },
            { v: "y", label: "쉬는 중" },
            { v: "n", label: "활동 중" },
          ]}
        />
        <Input
          className="col-span-2 min-h-11 w-full sm:w-64"
          placeholder="이름 · 가입 이메일"
          aria-label="회원 검색 — 이메일은 주소에 남기지 않습니다"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              void navigate({ search: {}, replace: true });
            }}
            className="col-span-2"
          >
            초기화
          </Button>
        ) : null}
      </div>

      {loadError ? (
        <div className="mt-5 rounded-surface bg-surface-subtle p-4" role="alert">
          <p className="text-sm text-destructive">
            회원 목록을 확인할 수 없습니다.{rows ? " 이전 조회 결과를 표시하고 있어요." : ""}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={loading}
            onClick={() => void load(search, q)}
          >
            다시 불러오기
          </Button>
        </div>
      ) : null}

      {rows === null ? (
        !loadError ? (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            불러오는 중…
          </p>
        ) : null
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">조건에 맞는 회원이 없습니다.</p>
      ) : (
        <>
          <p className="mt-5 text-sm text-muted-foreground tabular-nums">{rows.length}명</p>
          {/*
            표로 눕힌다. 카드로 쌓으면 한 화면에 다섯 명밖에 안 들어와서 "누가
            밀려 있나" 를 훑을 수 없다. 열을 고정하면 같은 정보가 같은 자리에
            와서 눈이 세로로 훑는다.
          */}
          <ul aria-label="회원 목록" className="mt-3 space-y-3 md:hidden">
            {rows.map((m) => (
              <li key={m.id} className="app-elevated rounded-surface bg-card">
                <Link
                  to="/admin/members/$id"
                  params={{ id: m.id }}
                  search={search}
                  className="pressable block rounded-surface p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{m.name ?? "(이름 없음)"}</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.gender === "female" ? "여성" : "남성"} · {hubLabel(m.hub_id)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <MemberStatus m={m} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                    티켓 {m.unused_tickets}장 · 미처리 신고 {m.pending_reports_against}건
                  </p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {maskEmail(m.company_email)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <div
            role="region"
            aria-label="회원 목록 표"
            tabIndex={0}
            className="app-elevated mt-3 hidden overflow-x-auto rounded-surface bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:block"
          >
            <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <Th>이름 · ID</Th>
                  <Th>성별</Th>
                  <Th>선호 지역</Th>
                  <Th>상태</Th>
                  <Th className="text-right">티켓</Th>
                  <Th className="text-right">신고</Th>
                  <Th>가입 이메일</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="group">
                    <Td>
                      <Link
                        to="/admin/members/$id"
                        params={{ id: m.id }}
                        search={search}
                        className="pressable inline-flex min-h-11 items-center rounded-control font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-hover:underline"
                      >
                        {m.name ?? "(이름 없음)"}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{m.id.slice(0, 8)}</span>
                    </Td>
                    <Td className="text-muted-foreground">{m.gender === "female" ? "여" : "남"}</Td>
                    <Td className="text-muted-foreground">{hubLabel(m.hub_id)}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        <MemberStatus m={m} />
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums text-muted-foreground">
                      {m.unused_tickets || "—"}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {m.pending_reports_against > 0 ? (
                        <span className="font-semibold text-primary-strong">
                          {m.pending_reports_against}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="text-muted-foreground">{maskEmail(m.company_email)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function maskEmail(email: string | null) {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "—";
  return `${local.slice(0, 2)}***@${domain}`;
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`border-b border-border px-3 py-2 font-medium ${className}`}>{children}</th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border px-3 py-2 group-hover:bg-muted/40 ${className}`}>
      {children}
    </td>
  );
}

/** 셀렉트는 운영 화면에서만 쓰므로 네이티브로 둔다 — 키보드 조작도 낫다. */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 min-w-0 rounded-control border border-input bg-background px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MemberStatus({ m }: { m: AdminMember }) {
  return (
    <>
      {m.role === "admin" ? <Tag tone="muted">운영자</Tag> : null}
      {m.account_state === "banned" ? <Tag tone="alert">정지</Tag> : null}
      {m.account_state === "withdrawn" ? <Tag tone="muted">탈퇴</Tag> : null}
      {m.paused_at ? <Tag tone="muted">쉬는 중</Tag> : null}
      {m.onboarding_step < 7 ? <Tag tone="muted">가입 {m.onboarding_step}/7</Tag> : null}
      {m.has_active_meeting ? <Tag tone="muted">만남 진행</Tag> : null}
      {m.role !== "admin" &&
      m.account_state === "active" &&
      !m.paused_at &&
      m.onboarding_step >= 7 &&
      !m.has_active_meeting ? (
        <Tag tone="muted">활동 중</Tag>
      ) : null}
    </>
  );
}
