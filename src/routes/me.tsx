import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Bell, FileText, Ticket, User } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { BRAND, HUBS } from "@/lib/brand";
import { myStats, signOut, type MyStats } from "@/lib/api";
import { useMe } from "@/lib/me";
import { usePhotoUrl } from "@/lib/photo";

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: `나 — ${BRAND.name}` },
      { name: "description", content: "내 프로필과 티켓, 설정을 한곳에서 관리합니다." },
    ],
  }),
  component: MePage,
});

/** "2026년 3월부터" 처럼 소속감만 준다. 일수를 세면 압박이 된다. */
function joinedLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월부터`;
}

const MENU = [
  { to: "/profile", icon: User, label: "내 프로필", hint: "상대에게 보이는 모습" },
  { to: "/store", icon: Ticket, label: "티켓 상점", hint: "만남 티켓 구매" },
  { to: "/settings", icon: Bell, label: "환경설정", hint: "화면 · 알림" },
  { to: "/terms", icon: FileText, label: "약관 · 문의", hint: "이용약관 · 개인정보" },
] as const;

/**
 * 마이페이지 = 허브.
 *
 * 예전에는 이 한 화면이 프로필 전문(사진·기본정보·5개 섹션)과 테마 설정과
 * 약관 링크를 모두 담아, 무엇을 하러 온 화면인지 알 수 없었다. 프로필은
 * 읽을거리이고 설정은 조작거리인데 둘의 성격이 달라 같은 스크롤에 두면
 * 어느 쪽도 잘 안 된다. 프로필을 /profile 로 떼고 여기는 문패만 남긴다.
 */
function MePage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const [stats, setStats] = useState<MyStats | null>(null);
  const photo = usePhotoUrl(me?.photo_url);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/signup" });
  }, [ready, me, navigate]);

  useEffect(() => {
    if (!ready || !me) return;
    let cancelled = false;
    myStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, me]);

  if (!me) {
    return (
      <AppScreen title="나">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  const hub = HUBS.find((h) => h.id === me.hub_id);

  return (
    <AppScreen title="나">
      {/* ── 대시보드 ────────────────────────────────
        진행 상황(소개 도착·확정 등)은 넣지 않는다 — 홈이 소유하는 정보이고,
        같은 상태를 두 화면이 서로 다른 문장으로 말하는 게 홈 재설계로 걷어낸
        문제였다. 받은 좋아요 수·넘긴 수도 넣지 않는다: 앞의 것은 "이미 나를
        고른 사람"이라는 전제를 카운터로 바꾸고, 뒤의 것은 사람에게 해롭다.
      */}
      <div className="mt-3 rounded-surface border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="size-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
            {photo ? (
              <img src={photo} alt="" className="size-full object-cover" />
            ) : (
              <span
                aria-hidden="true"
                className="headline flex size-full items-center justify-center text-xl text-muted-foreground"
              >
                {me.name?.[0] ?? "·"}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="headline truncate text-xl">{me.name ?? "이름 없음"}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {hub?.label ?? "강남·역삼권"}
              {stats ? ` · ${joinedLabel(stats.joinedAt)}` : ""}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div>
            <dt className="text-3xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              보유 티켓
            </dt>
            <dd className="headline mt-1 text-2xl tabular-nums">
              {stats ? stats.unusedTickets : "—"}
              <span className="ml-1 text-sm font-normal text-muted-foreground">장</span>
            </dd>
          </div>
          <div>
            <dt className="text-3xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              만난 횟수
            </dt>
            <dd className="headline mt-1 text-2xl tabular-nums">
              {stats ? stats.metCount : "—"}
              <span className="ml-1 text-sm font-normal text-muted-foreground">번</span>
            </dd>
          </div>
        </dl>

        {stats?.metCount === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">아직 첫 만남 전이에요.</p>
        ) : null}
      </div>

      {/* ── 메뉴 ──────────────────────────────── */}
      <nav className="mt-6" aria-label="설정 메뉴">
        <ul className="overflow-hidden rounded-surface border border-border bg-card">
          {MENU.map(({ to, icon: Icon, label, hint }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-16 items-center gap-3.5 border-b border-border/70 px-5 last:border-0 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Icon className="size-5 shrink-0 text-primary-strong" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <button
        type="button"
        onClick={async () => {
          await signOut();
          navigate({ to: "/" });
        }}
        className="mt-6 min-h-12 w-full rounded-control border border-border text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        로그아웃
      </button>
    </AppScreen>
  );
}
