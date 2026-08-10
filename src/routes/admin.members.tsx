import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { HUBS } from "@/lib/brand";
import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import {
  fetchMembers,
  type AccountState,
  type AdminMember,
  type Gender,
  type MemberFilters,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/members")({ component: MembersTab });

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
  const [f, setF] = useState<MemberFilters>({});
  const [rows, setRows] = useState<AdminMember[] | null>(null);

  const load = useCallback(async (filters: MemberFilters) => {
    setRows(await fetchMembers(filters));
  }, []);

  useEffect(() => {
    // 검색어는 타이핑마다 왕복시키지 않는다.
    const t = setTimeout(() => void load(f), 250);
    return () => clearTimeout(t);
  }, [f, load]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={f.gender ?? ""}
          onChange={(v) => setF({ ...f, gender: (v || undefined) as Gender | undefined })}
          options={[
            { v: "", label: "성별 전체" },
            { v: "female", label: "여성" },
            { v: "male", label: "남성" },
          ]}
        />
        <Select
          value={f.state ?? ""}
          onChange={(v) => setF({ ...f, state: (v || undefined) as AccountState | undefined })}
          options={[
            { v: "", label: "상태 전체" },
            { v: "active", label: "정상" },
            { v: "banned", label: "정지" },
            { v: "withdrawn", label: "탈퇴" },
          ]}
        />
        <Select
          value={f.hub ?? ""}
          onChange={(v) => setF({ ...f, hub: v || undefined })}
          options={[
            { v: "", label: "권역 전체" },
            ...HUBS.map((h) => ({ v: h.id, label: h.label })),
          ]}
        />
        {/* 아직 열지 않은 권역도 필터에 남긴다 — 잘못 들어간 데이터를 찾아야 한다. */}
        <Input
          className="h-9 w-56"
          placeholder="이름 · 회사 이메일"
          value={f.query ?? ""}
          onChange={(e) => setF({ ...f, query: e.target.value })}
        />
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">조건에 맞는 회원이 없습니다.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground tabular-nums">{rows.length}명</p>
          <ul className="mt-2 divide-y divide-border rounded-surface border border-border">
            {rows.map((m) => (
              <li key={m.id}>
                <Link
                  to="/admin/members/$id"
                  params={{ id: m.id }}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="font-semibold">{m.name ?? "(이름 없음)"}</span>
                  <span className="text-muted-foreground">
                    {m.gender === "female" ? "여" : "남"} · {hubLabel(m.hub_id)}
                  </span>
                  {m.role === "admin" ? <Tag tone="muted">운영자</Tag> : null}
                  {m.account_state === "banned" ? <Tag tone="alert">정지</Tag> : null}
                  {m.account_state === "withdrawn" ? <Tag tone="muted">탈퇴</Tag> : null}
                  {m.paused_at ? <Tag tone="muted">쉬는 중</Tag> : null}
                  {m.onboarding_step < 7 ? (
                    <Tag tone="muted">가입 {m.onboarding_step}/7</Tag>
                  ) : null}
                  {m.has_active_meeting ? <Tag tone="muted">만남 진행</Tag> : null}
                  {m.unused_tickets > 0 ? <Tag tone="muted">티켓 {m.unused_tickets}</Tag> : null}
                  {m.pending_reports_against > 0 ? (
                    <Tag tone="alert">신고 {m.pending_reports_against}</Tag>
                  ) : null}
                  <span className="ml-auto text-muted-foreground">{m.company_email}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** 셀렉트는 화면 하나에서만 쓰므로 네이티브로 둔다 — 운영 화면이고 접근성도 낫다. */
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
