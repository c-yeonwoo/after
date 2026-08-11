import { createFileRoute, Link, Outlet, useMatches, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
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
    q: typeof s.q === "string" && s.q.trim() ? s.q : undefined,
  }),
  component: MembersTab,
});

function MembersTab() {
  /*
    상세는 자식 라우트다. 목록이 있는 자리에 상세를 겹쳐 놓으면 "목록으로
    돌아가기" 가 브라우저 뒤로가기에만 의존하게 되는데, 운영자는 목록 ↔ 상세를
    계속 왕복한다. 상세가 열려 있을 때는 목록을 접어 둔다.
  */
  const showingDetail = useMatches().some((m) => m.routeId === "/admin/members/$id");
  if (showingDetail) return <Outlet />;
  return <MemberList />;
}

function MemberList() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<AdminMember[] | null>(null);
  // 검색어만 로컬에 둔다 — 타이핑마다 URL 을 갈면 뒤로가기 이력이 글자 수만큼 쌓인다.
  const [q, setQ] = useState(search.q ?? "");

  const set = (patch: Partial<MemberSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const load = useCallback(async (s: MemberSearch, query: string) => {
    setRows(
      await fetchMembers({
        gender: s.gender,
        state: s.state,
        hub: s.hub,
        paused: s.paused,
        query,
      }),
    );
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search, q), 250);
    return () => clearTimeout(t);
  }, [search, q, load]);

  const active = search.gender || search.state || search.hub || search.paused !== undefined || q;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={search.gender ?? ""}
          onChange={(v) => set({ gender: (v || undefined) as Gender | undefined })}
          options={[
            { v: "", label: "성별 전체" },
            { v: "female", label: "여성" },
            { v: "male", label: "남성" },
          ]}
        />
        <Select
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
          value={search.hub ?? ""}
          onChange={(v) => set({ hub: v || undefined })}
          options={[
            { v: "", label: "권역 전체" },
            ...HUBS.map((h) => ({ v: h.id, label: h.label })),
          ]}
        />
        <Select
          value={search.paused === undefined ? "" : search.paused ? "y" : "n"}
          onChange={(v) => set({ paused: v === "" ? undefined : v === "y" })}
          options={[
            { v: "", label: "쉬는 중 전체" },
            { v: "y", label: "쉬는 중" },
            { v: "n", label: "활동 중" },
          ]}
        />
        <Input
          className="h-9 w-56"
          placeholder="이름 · 회사 이메일"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {active ? (
          <button
            onClick={() => {
              setQ("");
              void navigate({ search: {}, replace: true });
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            초기화
          </button>
        ) : null}
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
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
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <Th>이름</Th>
                  <Th>성별</Th>
                  <Th>권역</Th>
                  <Th>상태</Th>
                  <Th className="text-right">티켓</Th>
                  <Th className="text-right">신고</Th>
                  <Th>회사 이메일</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="group">
                    <Td>
                      <Link
                        to="/admin/members/$id"
                        params={{ id: m.id }}
                        className="font-semibold underline-offset-2 group-hover:underline"
                      >
                        {m.name ?? "(이름 없음)"}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{m.gender === "female" ? "여" : "남"}</Td>
                    <Td className="text-muted-foreground">{hubLabel(m.hub_id)}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {m.role === "admin" ? <Tag tone="muted">운영자</Tag> : null}
                        {m.account_state === "banned" ? <Tag tone="alert">정지</Tag> : null}
                        {m.account_state === "withdrawn" ? <Tag tone="muted">탈퇴</Tag> : null}
                        {m.paused_at ? <Tag tone="muted">쉬는 중</Tag> : null}
                        {m.onboarding_step < 7 ? (
                          <Tag tone="muted">가입 {m.onboarding_step}/7</Tag>
                        ) : null}
                        {m.has_active_meeting ? <Tag tone="muted">만남 진행</Tag> : null}
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
                    <Td className="text-muted-foreground">{m.company_email}</Td>
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
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-surface border border-border bg-background px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
