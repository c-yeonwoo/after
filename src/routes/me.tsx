import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, CalendarDays, CircleHelp, Receipt, Settings, Ticket } from "lucide-react";
import { toast } from "sonner";

import { NotificationBell } from "@/components/app/NotificationBell";
import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { BRAND, HUBS } from "@/lib/brand";
import { myStats, paymentsEnabled, remainingCandidates, signOut, type MyStats } from "@/lib/api";
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

/**
 * 메뉴.
 *
 * 티켓 상점은 **남성에게만** 보인다. 티켓을 쓰는 함수(open_intro ·
 * use_meeting_ticket)는 전부 성별 게이트가 있어서, 여성에게 이 줄은 살 수는
 * 있고 쓸 수는 없는 것으로 가는 문이었다. 실제로 여성 계정으로 30,000원짜리
 * 주문이 만들어졌고, 운영자 승인 대기열에 영원히 이행 불가능한 주문이 쌓였다.
 */
const MENU = [
  {
    to: "/availability",
    icon: CalendarDays,
    label: "만남 가능 시간",
    hint: "퇴근 후 편한 요일",
    male: false,
  },
  // 무료 베타에도 상점 진입은 유지한다. 구매 가능 여부는 상점 안에서 안내한다.
  { to: "/store", icon: Ticket, label: "티켓 상점", hint: "소개 · 만남 이용 안내", male: true },
  { to: "/orders", icon: Receipt, label: "티켓 이용 내역", hint: "발급 · 사용 · 결제", male: true },
  {
    to: "/settings",
    icon: Settings,
    label: "환경설정",
    hint: "만남 지역 · 화면 · 알림",
    male: false,
  },
  {
    to: "/support",
    icon: CircleHelp,
    label: "도움 · 문의",
    hint: "고객 지원 · 계정 삭제",
    male: false,
  },
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
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paid, setPaid] = useState<boolean | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const photo = usePhotoUrl(me?.photo_url);
  const isMale = me?.gender === "male";

  useEffect(() => {
    // 랜딩으로 보낸다. /signup 으로 보내면 **로그아웃도 여기에 걸린다** —
    // signOut() 직후 me 가 null 이 되는 순간 이 가드가 먼저 이겨서, 나가려던
    // 사람이 "성별을 알려주세요(1/7)"에 떨어졌다(iOS 점검에서 발견).
    // 랜딩은 로그인한 사람을 /home 으로 되돌려주므로 양쪽 다 안전하다.
    if (ready && !me) navigate({ to: "/" });
  }, [ready, me, navigate]);

  useEffect(() => {
    if (!ready || !me) return;
    let cancelled = false;
    setStatsError(false);
    myStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        if (!cancelled) setStatsError(true);
      });
    if (me.gender === "male") {
      paymentsEnabled()
        .then((enabled) => {
          if (!cancelled) setPaid(enabled);
        })
        .catch(() => {
          if (!cancelled) setPaid(null);
        });
    }
    // 여성 화면의 티켓 자리를 대신 채우는 값. 남성에게는 부르지 않는다.
    if (me.gender === "female") {
      remainingCandidates()
        .then((n) => {
          if (!cancelled) setRemaining(n);
        })
        .catch(() => {
          if (!cancelled) setStatsError(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [ready, me, retry]);

  if (!me) {
    return (
      <AppScreen title="나" back="/home" action={<NotificationBell from="me" />}>
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  const hub = HUBS.find((h) => h.id === me.hub_id);

  return (
    <AppScreen title="나" back="/home" action={<NotificationBell from="me" />}>
      {/* ── 대시보드 ────────────────────────────────
        진행 상황(소개 도착·확정 등)은 넣지 않는다 — 홈이 소유하는 정보이고,
        같은 상태를 두 화면이 서로 다른 문장으로 말하는 게 홈 재설계로 걷어낸
        문제였다. 받은 좋아요 수·넘긴 수도 넣지 않는다: 앞의 것은 "이미 나를
        고른 사람"이라는 전제를 카운터로 바꾸고, 뒤의 것은 사람에게 해롭다.
      */}
      <div className="app-elevated mt-3 rounded-surface bg-card p-5">
        <Link
          to="/profile"
          className="pressable -m-2 flex min-h-20 items-center gap-4 rounded-control p-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="size-16 shrink-0 overflow-hidden rounded-surface bg-muted">
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
              {/*
              가입 시점("2026년 9월부터")을 적었었다. 소속감을 준다고 생각했지만,
              읽는 사람이 그 숫자로 할 수 있는 일이 없다. 자기 프로필에서 자기
              가입월을 확인할 이유가 없고, 오래된 계정에는 "아직도 못 만났구나"
              로 읽힌다. 쓸모가 없으면 지우는 편이 낫다.
            */}
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {hub ? `만남 지역 · ${hub.label}` : "만남 지역 선택 전"}
              </p>
            </div>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            프로필 보기
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </Link>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
          {/*
            여기가 여성이 이 앱에서 보는 **첫 숫자**였다 — "0장 소개 / 0장 만남".
            쓸 수도 없는 것의 결핍이다. 이 제품이 여성에게 주장하는 가장 큰
            유인("당신은 돈을 내지 않는다")이 화면에서 지워지고 그 자리를
            0이 차지하고 있었다. 그래서 성별로 가른다.

            남성에게는 티켓을 종류별로 나눠 적는다. 합치면 "몇 장이 무엇에
            쓰이는지" 를 잃고, 한쪽만 세면 나머지를 가진 사람이 0장을 본다.
          */}
          {isMale && paid === false ? (
            <div>
              <dt className="text-3xs font-semibold text-muted-foreground">베타 이용</dt>
              <dd className="mt-1 text-sm font-semibold">소개·만남 요청 무료</dd>
            </div>
          ) : isMale ? (
            <div>
              <dt className="text-3xs font-semibold text-muted-foreground">보유 티켓</dt>
              <dd className="headline mt-1 text-2xl tabular-nums">
                {stats ? stats.introTickets : "—"}
                <span className="ml-1 text-sm font-normal text-muted-foreground">장 소개</span>
              </dd>
              <dd className="headline mt-0.5 text-2xl tabular-nums">
                {stats ? stats.meetingTickets : "—"}
                <span className="ml-1 text-sm font-normal text-muted-foreground">장 만남</span>
              </dd>
            </div>
          ) : (
            <div>
              <dt className="text-3xs font-semibold text-muted-foreground">평가 남은 분</dt>
              <dd className="headline mt-1 text-2xl tabular-nums">
                {remaining === null ? "—" : remaining}
                <span className="ml-1 text-sm font-normal text-muted-foreground">명</span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-3xs font-semibold text-muted-foreground">만난 횟수</dt>
            <dd className="headline mt-1 text-2xl tabular-nums">
              {stats ? stats.metCount : "—"}
              <span className="ml-1 text-sm font-normal text-muted-foreground">번</span>
            </dd>
          </div>
        </dl>

        {statsError ? (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            이용 현황을 불러오지 못했어요.
            <Button variant="ghost" size="sm" onClick={() => setRetry((v) => v + 1)}>
              다시 확인
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── 메뉴 ──────────────────────────────── */}
      <nav className="mt-6" aria-label="설정 메뉴">
        <ul className="app-elevated divide-y divide-border/60 overflow-hidden rounded-surface bg-card">
          {MENU.filter((m) => !m.male || isMale).map(({ to, icon: Icon, label, hint }) => (
            <li key={to}>
              <Link
                to={to}
                search={to === "/availability" ? { from: "me" } : {}}
                className="pressable flex min-h-20 items-center gap-3.5 px-4 py-3 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-subtle text-primary-strong">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <button
        type="button"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          try {
            await signOut();
            navigate({ to: "/" });
          } catch {
            toast.error("로그아웃하지 못했어요. 다시 시도해 주세요.");
            setSigningOut(false);
          }
        }}
        className="pressable mt-6 min-h-12 w-full rounded-control text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {signingOut ? "로그아웃 중…" : "로그아웃"}
      </button>
    </AppScreen>
  );
}
