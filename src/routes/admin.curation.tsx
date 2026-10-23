import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { usePhotoUrl } from "@/lib/photo";
import { recordMyAiDecision } from "@/lib/api";
import { toProfileView } from "@/lib/profileView";
import { cn } from "@/lib/utils";
import { adminMeetWindows, isMeetWindowFresh, type AdminMeetWindow } from "@/lib/meetWindow";
import {
  fetchCurationTargets,
  fetchAdminProfileStory,
  fetchLikePool,
  fetchQueue,
  setQueue,
  setQueueReason,
  composePairBrief,
  fetchCurationRecommendations,
  approvePairReason,
  type CurationRecommendations,
  type CurationTarget,
  type LikePoolItem,
  type PairBrief,
  type QueueCard,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/curation")({
  validateSearch: (s: Record<string, unknown>): { male?: string } => ({
    male: typeof s.male === "string" ? s.male : undefined,
  }),
  component: CurationTab,
});

/** 전송된 카드는 상위 3장이다 — 서버(promote_intro_queue)와 같은 수. */
const DELIVER_WINDOW = 3;
const AI_SOURCE_LABELS: Record<string, string> = {
  job: "직업",
  evening_note: "퇴근 후",
  known_as: "나에 대한 말",
  topic_note: "대화 주제",
  match_note: "함께할 사람",
  interests: "관심사",
  match_tags: "관계 선호",
  topics: "대화 주제",
  intro: "공개 소개글",
  story_daily_life: "인터뷰 · 일상",
  story_getting_closer: "인터뷰 · 가까워지는 방식",
  story_conversation: "인터뷰 · 나눌 이야기",
};

const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" });
const day = (s: string | null) => (s ? DATE.format(new Date(s)) : "—");

/**
 * 큐레이션 — 이 서비스의 매칭이 실제로 일어나는 화면.
 *
 * 좌: 누구부터 손댈지 고르는 목록. 우: 그 남성의 큐를 세우는 작업판.
 *
 * 저장 전까지 순서는 **로컬 상태**다. 위/아래를 누를 때마다 서버에 쓰면 순서를
 * 다섯 번 만지는 동안 다섯 번의 왕복과 다섯 번의 감사 기록이 남는다. 다 정한
 * 뒤 한 번 저장하고 사유도 그때 한 번 받는다.
 *
 * 드래그가 아니라 위/아래 버튼이다 — 키보드로도 되고, 카드가 두 영역(큐·풀)을
 * 오가는 구조에서 드래그는 목표 영역을 잘못 짚기 쉽다.
 */
function CurationTab() {
  const { male } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [targets, setTargets] = useState<CurationTarget[] | null>(null);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const epoch = useRef(0);
  const work = useRef<HTMLDivElement>(null);
  const previousMale = useRef<string | undefined>(undefined);

  const loadTargets = useCallback(async () => {
    const request = ++epoch.current;
    try {
      const next = await fetchCurationTargets();
      if (active.current && request === epoch.current) {
        setTargets(next);
        setError(false);
      }
    } catch {
      if (active.current && request === epoch.current) setError(true);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void loadTargets();
    return () => {
      active.current = false;
      epoch.current += 1;
    };
  }, [loadTargets]);
  useEffect(() => {
    const previous = previousMale.current;
    previousMale.current = male;
    if (male && window.matchMedia("(max-width: 1023px)").matches) {
      document.querySelector("main")?.scrollTo(0, 0);
      work.current?.focus({ preventScroll: true });
    } else if (!male && previous) {
      requestAnimationFrame(() =>
        Array.from(document.querySelectorAll<HTMLButtonElement>("[data-target-id]"))
          .find((node) => node.dataset.targetId === previous)
          ?.focus(),
      );
    }
  }, [male]);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">매칭 큐레이션</h1>
        <p className="mt-2 text-sm text-muted-foreground">대상 선택 → 프로필 검토 → 순서 저장</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div
          className={cn("min-w-0 lg:sticky lg:top-0 lg:self-start", male && "hidden lg:block")}
          role="region"
          aria-label="매칭 작업 대상"
        >
          <h2 className="text-sm font-semibold">
            작업 대상 <span className="font-normal text-muted-foreground">큐가 빈 사람부터</span>
          </h2>
          {error ? (
            <div role="alert" className="mt-3 rounded-surface bg-surface-subtle p-4">
              <p className="text-sm">작업 대상을 불러오지 못했어요.</p>
              <Button variant="outline" className="mt-3" onClick={() => void loadTargets()}>
                다시 불러오기
              </Button>
            </div>
          ) : null}
          {targets === null && !error ? (
            <p className="mt-3 text-sm text-muted-foreground">불러오는 중…</p>
          ) : targets?.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">활성 남성 회원이 없습니다.</p>
          ) : (
            <ul className="app-elevated mt-3 divide-y divide-border overflow-hidden rounded-surface bg-card lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:overscroll-contain">
              {targets?.map((t) => (
                <li key={t.id}>
                  <button
                    data-target-id={t.id}
                    aria-pressed={male === t.id}
                    onClick={() => void navigate({ search: { male: t.id }, replace: true })}
                    className={`pressable flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none ${
                      male === t.id ? "bg-surface-subtle" : "hover:bg-muted/50"
                    }`}
                  >
                    <Thumb path={t.photo_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span
                          className={`font-semibold ${t.receiving ? "" : "text-muted-foreground"}`}
                        >
                          {t.name ?? "(이름 없음)"}
                        </span>
                        <span className="text-xs text-muted-foreground">{hubLabel(t.hub_id)}</span>
                        {/* 소개 받기 OFF 는 큐레이션 대상이 아니다(문서 §1). */}
                        {!t.receiving ? <Tag tone="muted">소개 받기 OFF</Tag> : null}
                        {t.has_open_intro ? <Tag tone="muted">소개 열림</Tag> : null}
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                        <span
                          className={
                            t.pool_count > 0 && t.queued_count === 0 ? "text-primary-strong" : ""
                          }
                        >
                          대기 호감 {t.pool_count}
                        </span>
                        <span>
                          큐 {t.queued_count}
                          {t.queued_count > DELIVER_WINDOW ? ` (전송 ${t.delivered_count})` : ""}
                        </span>
                        {t.blocked_count > 0 ? (
                          <span className="text-primary-strong">막힘 {t.blocked_count}</span>
                        ) : null}
                        {t.oldest_like_hours !== null ? (
                          <span className={t.oldest_like_hours > 72 ? "text-primary-strong" : ""}>
                            최장 {Math.floor(t.oldest_like_hours / 24)}일
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          ref={work}
          tabIndex={-1}
          className={cn("min-w-0 outline-none", !male && "hidden lg:block")}
          role="region"
          aria-label="선택한 회원의 소개 큐"
        >
          {male ? (
            <Button
              variant="outline"
              className="mb-4 lg:hidden"
              onClick={() => void navigate({ search: {}, replace: true })}
            >
              작업 대상 목록으로
            </Button>
          ) : null}
          {male ? (
            <Workbench
              key={male}
              maleId={male}
              target={targets?.find((t) => t.id === male)}
              onSaved={loadTargets}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              작업 대상을 선택하면 후보 프로필과 소개 순서를 검토할 수 있어요.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** 큐 + 풀. 저장 전까지 순서는 로컬이다. */
function Workbench({
  maleId,
  target,
  onSaved,
}: {
  maleId: string;
  target?: CurationTarget;
  onSaved: () => Promise<void>;
}) {
  const [pool, setPool] = useState<LikePoolItem[] | null>(null);
  const [saved, setSaved] = useState<QueueCard[]>([]);
  // 화면에서 세우는 순서. female_id 배열이 그대로 admin_set_queue 의 인자가 된다.
  const [order, setOrder] = useState<string[]>([]);
  const [preview, setPreview] = useState<
    ((LikePoolItem | QueueCard) & { profile_story?: unknown }) | null
  >(null);
  const [windows, setWindows] = useState<Map<string, AdminMeetWindow>>(new Map());
  const [windowError, setWindowError] = useState(false);
  const [recommendations, setRecommendations] = useState<CurationRecommendations | null>(null);
  const [recommendationError, setRecommendationError] = useState(false);
  const [refreshingRecommendations, setRefreshingRecommendations] = useState(false);
  const previewGeneration = useRef(0);
  const alive = useRef(false);
  const loadEpoch = useRef(0);
  const recommendationEpoch = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const previewPanel = useRef<HTMLElement>(null);
  const previewTrigger = useRef<HTMLElement | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const refreshRecommendations = useCallback(async () => {
    const epoch = ++recommendationEpoch.current;
    setRefreshingRecommendations(true);
    try {
      const next = await fetchCurationRecommendations(maleId);
      if (alive.current && epoch === recommendationEpoch.current) {
        setRecommendations(next);
        setRecommendationError(false);
      }
    } catch {
      if (alive.current && epoch === recommendationEpoch.current) setRecommendationError(true);
    } finally {
      if (alive.current && epoch === recommendationEpoch.current)
        setRefreshingRecommendations(false);
    }
  }, [maleId]);

  const load = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    previewGeneration.current += 1;
    setLoadError(false);
    try {
      const [p, q] = await Promise.all([fetchLikePool(maleId), fetchQueue(maleId)]);
      if (!alive.current || epoch !== loadEpoch.current) return;
      await refreshRecommendations();
      try {
        const all = await adminMeetWindows([
          maleId,
          ...p.map((item) => item.id),
          ...q.map((item) => item.female_id),
        ]);
        if (!alive.current || epoch !== loadEpoch.current) return;
        setWindows(new Map(all.map((item) => [item.user_id, item])));
        setWindowError(false);
      } catch {
        if (!alive.current || epoch !== loadEpoch.current) return;
        setWindows(new Map());
        setWindowError(true);
      }
      // Publish the queue and its ordering together after dependent data is ready.
      setPool(p);
      setSaved(q);
      setOrder(q.map((c) => c.female_id));
      setPreview(null);
    } catch {
      if (alive.current && epoch === loadEpoch.current) setLoadError(true);
    }
  }, [maleId, refreshRecommendations]);

  const invalidate = useCallback(() => {
    loadEpoch.current += 1;
    recommendationEpoch.current += 1;
    previewGeneration.current += 1;
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      invalidate();
    };
  }, [load, invalidate]);

  // 큐에 든 사람의 표시 정보. 이미 저장된 카드거나 방금 풀에서 옮긴 사람이다.
  const cardOf = (id: string) =>
    saved.find((c) => c.female_id === id) ?? (pool ?? []).find((p) => p.id === id) ?? null;

  const showPreview = async (card: LikePoolItem | QueueCard | null, trigger: HTMLElement) => {
    if (!card) return;
    const current = ++previewGeneration.current;
    previewTrigger.current = trigger;
    const id = "female_id" in card ? card.female_id : card.id;
    try {
      const story = await fetchAdminProfileStory(id);
      if (current === previewGeneration.current) setPreview({ ...card, profile_story: story });
    } catch {
      if (alive.current && current === previewGeneration.current)
        toast.error("프로필을 불러오지 못했어요.");
    }
  };

  const inQueue = new Set(order);
  const available = (pool ?? []).filter((p) => !inQueue.has(p.id));
  const recommendationById = new Map((recommendations?.items ?? []).map((r) => [r.female_id, r]));
  const overlap = (femaleId: string) => {
    const maleWindow = windows.get(maleId);
    const femaleWindow = windows.get(femaleId);
    if (!isMeetWindowFresh(maleWindow) || !isMeetWindowFresh(femaleWindow)) return null;
    return maleWindow!.weekdays.filter((day) => femaleWindow!.weekdays.includes(day)).length;
  };
  const dirty = order.length !== saved.length || order.some((id, i) => saved[i]?.female_id !== id);
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname || !("male" in next.search) || next.search.male !== maleId,
    disabled: !dirty && !saving,
    enableBeforeUnload: dirty || saving,
    withResolver: true,
  });
  useEffect(() => {
    if (preview && window.matchMedia("(max-width: 1279px)").matches) {
      document.querySelector("main")?.scrollTo(0, 0);
      previewPanel.current?.focus({ preventScroll: true });
    }
  }, [preview]);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }

  function fillDeliveryWindow() {
    const slots = Math.max(0, DELIVER_WINDOW - order.length);
    if (slots === 0) return;
    // 교집합이 확인된 후보를 먼저 제안하고, 같은 조건에서는 오래 기다린 순서를 유지한다.
    // 순위는 초안일 뿐이며 저장 전 운영자가 프로필과 의사를 확인한다.
    // Server ordering includes bounded preference signals and overdue-member
    // review priority. Unknown data is not an incompatibility or exclusion.
    const ranks = new Map(
      (recommendations?.items ?? []).map((item, index) => [item.female_id, index]),
    );
    const ranked = [...available].sort(
      (a, b) =>
        (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    setOrder([...order, ...ranked.slice(0, slots).map((p) => p.id)]);
  }

  if (pool === null)
    return (
      <div
        role={loadError ? "alert" : "status"}
        className="app-elevated rounded-surface bg-card p-5"
      >
        <p className="text-sm text-muted-foreground">
          {loadError ? "후보와 큐를 불러오지 못했어요." : "후보와 소개 큐를 불러오는 중입니다…"}
        </p>
        {loadError ? (
          <Button variant="outline" className="mt-3" onClick={() => void load()}>
            다시 불러오기
          </Button>
        ) : null}
      </div>
    );

  return (
    <>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            reviewHeading.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {saving
                ? "작업을 마무리하고 있어요"
                : dirty
                  ? "저장하지 않은 큐 변경이 있어요"
                  : "작업이 완료됐어요"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {saving
                ? "진행 중인 작업이 끝날 때까지 잠시 기다려 주세요."
                : dirty
                  ? "이동하면 검토 중인 순서가 사라집니다."
                  : "변경사항이 반영됐습니다. 이동할 수 있어요."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>계속 검토하기</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => blocker.proceed?.()}>
              {dirty ? "변경 버리고 이동" : "이동하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {loadError ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          큐를 새로 확인하지 못했어요. 현재 순서는 유지했습니다. 다시 저장하기 전에 상태를 확인해
          주세요.
        </p>
      ) : null}
      <fieldset
        disabled={saving}
        className="m-0 grid min-w-0 gap-6 border-0 p-0 xl:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className={cn("min-w-0", preview && "hidden xl:block")}>
          <header className="flex flex-wrap items-baseline gap-x-3">
            <h2
              ref={reviewHeading}
              tabIndex={-1}
              id={`curation-heading-${maleId}`}
              className="text-lg font-semibold outline-none"
            >
              <Link
                to="/admin/members/$id"
                params={{ id: maleId }}
                className="underline-offset-2 hover:underline"
              >
                {target?.name ?? "회원"}
              </Link>
              의 소개 큐
            </h2>
            {target && !target.receiving ? (
              <span className="text-xs text-primary-strong">
                소개 받기가 꺼져 있어 카드가 전송되지 않습니다
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {windowError
                ? "가능 시간을 불러오지 못함"
                : isMeetWindowFresh(windows.get(maleId))
                  ? "가능 시간 확인됨"
                  : "가능 시간 미확인"}
            </span>
          </header>

          <section
            className="app-elevated mt-4 rounded-surface bg-card p-4"
            aria-label="추천 배치 상태"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <details className="group min-w-0 flex-1">
                <summary className="pressable flex min-h-11 cursor-pointer items-center rounded-control text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  추천 검토 · 기준 보기
                  <ChevronDown
                    className="ml-2 size-4 shrink-0 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  입력된 일정·첫 만남·가까워지는 방식·대화 선호를 비교합니다. 3일 이상 기다린 분은
                  우선 검토하며, 저장 전에는 누구에게도 소개를 보내지 않습니다.
                </p>
                <p className="mt-2 text-2xs text-muted-foreground">
                  추천 근거와 대기 시간을 기준으로 초안을 담습니다. 저장 전 프로필과 순서를
                  검토하세요.
                </p>
                <p className="mt-2 text-2xs text-muted-foreground">
                  {recommendations?.batch
                    ? `정기 배치 ${new Date(recommendations.batch.last_success_at).toLocaleString("ko-KR")} · ${recommendations.batch.pair_count}쌍`
                    : "정기 배치 첫 실행 전 · 현재 후보는 별도로 검사합니다."}
                </p>
              </details>
              <Button
                size="sm"
                variant="outline"
                disabled={refreshingRecommendations}
                onClick={() => void refreshRecommendations()}
              >
                {refreshingRecommendations ? "검사 중…" : "추천 다시 검사"}
              </Button>
            </div>
            {recommendationError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                추천 검사 실패 · 기존 큐는 유지됩니다. 프로필을 직접 확인하거나 다시 검사하세요.
              </p>
            ) : recommendations?.batch &&
              Date.now() - Date.parse(recommendations.batch.last_success_at) > 20 * 60_000 ? (
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                정기 배치 지연 · 추천을 다시 검사해 주세요.
              </p>
            ) : null}
          </section>

          {/* ── 큐 ── */}
          <section className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                위 {DELIVER_WINDOW}장만 전송됩니다. 나머지는 자리가 비면 올라갑니다.
              </p>
              {order.length < DELIVER_WINDOW && available.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fillDeliveryWindow}
                  disabled={recommendationError || refreshingRecommendations || !recommendations}
                >
                  전송 슬롯 자동 채우기
                </Button>
              ) : null}
            </div>
            {order.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                큐가 비어 있습니다. 아래 호감 목록에서 추가하세요.
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {order.map((id, i) => {
                  const c = cardOf(id);
                  const stored = saved.find((s) => s.female_id === id);
                  const delivering = i < DELIVER_WINDOW;
                  return (
                    <li
                      key={id}
                      className={`app-elevated rounded-surface px-4 py-3 ${
                        delivering ? "bg-card" : "bg-surface-subtle"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                        <Thumb path={c?.photo_url ?? null} />
                        <button
                          onClick={(event) => void showPreview(c, event.currentTarget)}
                          className="pressable min-h-11 min-w-0 flex-1 rounded-control text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          title="프로필 보기"
                        >
                          <span className="text-sm font-semibold underline-offset-2 hover:underline">
                            {c ? (c.name ?? "(이름 없음)") : "(불러오는 중)"}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {delivering ? (
                              stored?.delivered_at ? (
                                <>전송됨 · {day(stored.expires_at)} 만료</>
                              ) : (
                                <>저장하면 전송</>
                              )
                            ) : (
                              "대기"
                            )}
                          </span>
                          <span className="block text-2xs text-muted-foreground">
                            <TimeFit count={overlap(id)} />
                          </span>
                        </button>
                        <div className="ml-auto flex shrink-0 items-center gap-1">
                          <IconBtn label="위로" disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp className="size-4" />
                          </IconBtn>
                          <IconBtn
                            label="아래로"
                            disabled={i === order.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </IconBtn>
                          <IconBtn
                            label="큐에서 빼기"
                            onClick={() => setOrder(order.filter((x) => x !== id))}
                          >
                            <X className="size-4" />
                          </IconBtn>
                        </div>
                      </div>
                      {stored ? (
                        <ReasonEditor
                          key={`${id}:${stored.reason ?? ""}`}
                          maleId={maleId}
                          femaleId={id}
                          initial={stored.reason ?? ""}
                          disabled={dirty}
                          onSaved={load}
                          onBusyChange={setSaving}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}

            {/*
            저장은 순서째 덮어쓴다. 사유는 필수 — 왜 이 순서로 세웠는지가
            남아야 나중에 패스율을 보고 큐레이션 품질을 되짚을 수 있다.
            전송된 카드의 만료 시계는 서버가 보존한다.
          */}
            {dirty ? (
              <div
                className="app-elevated mt-4 rounded-surface bg-card p-4"
                aria-label="큐 변경사항 저장"
              >
                <p className="text-sm font-semibold">
                  변경 {order.length}장
                  <span className="ml-2 font-normal text-muted-foreground">
                    저장 전까지 반영되지 않습니다
                  </span>
                </p>
                <NoteAction
                  placeholder="큐레이션 사유 (필수 — 왜 이 순서인지)"
                  onDone={() => {}}
                  actions={[
                    {
                      label: "큐 저장",
                      done: "큐를 저장했습니다.",
                      run: async (note) => {
                        setSaving(true);
                        try {
                          await setQueue(maleId, [...order], note);
                          await load();
                          await onSaved();
                        } finally {
                          if (alive.current) setSaving(false);
                        }
                      },
                    },
                  ]}
                />
                <button
                  onClick={() => setOrder(saved.map((c) => c.female_id))}
                  className="pressable mt-2 min-h-11 rounded-control px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  되돌리기
                </button>
              </div>
            ) : null}
          </section>

          {/* ── 호감 풀 ── */}
          <section className="mt-8">
            <h3 className="text-sm font-semibold">
              대기 중인 호감{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                {available.length}
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              이 회원을 좋다고 한 사람들. 오래 기다린 순입니다.
            </p>
            {pool === null ? (
              <p className="mt-3 text-sm text-muted-foreground">불러오는 중…</p>
            ) : available.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {(pool ?? []).length === 0
                  ? "아직 이 회원을 좋다고 한 사람이 없습니다."
                  : "호감을 모두 큐에 담았습니다."}
              </p>
            ) : (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                {available.map((p) => (
                  <li key={p.id} className="app-elevated overflow-hidden rounded-surface bg-card">
                    <button
                      onClick={(event) => void showPreview(p, event.currentTarget)}
                      className="pressable block w-full focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
                      aria-label={`${p.name ?? "회원"} 프로필 보기`}
                      title="프로필 보기"
                    >
                      <div className="relative aspect-[4/5] bg-muted">
                        <Cover path={p.photo_url} name={p.name} />
                      </div>
                    </button>
                    <div className="p-2.5">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                        <span className="font-semibold">{p.name ?? "(이름 없음)"}</span>
                        <span className="text-xs text-muted-foreground">{age(p.birth)}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground" title={p.job ?? ""}>
                        {p.job ?? "직업 미기재"}
                      </p>
                      <p className="mt-0.5 text-2xs text-muted-foreground tabular-nums">
                        {p.waiting_hours !== null
                          ? `${Math.floor(p.waiting_hours / 24)}일 대기`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-2xs text-muted-foreground">
                        <TimeFit count={overlap(p.id)} />
                      </p>
                      {recommendationById.get(p.id)?.preference_dimensions ? (
                        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                          선호 {recommendationById.get(p.id)!.preference_dimensions}개 영역 일치
                          확인
                        </p>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 w-full"
                        onClick={() => {
                          setOrder((current) =>
                            current.includes(p.id) ? current : [...current, p.id],
                          );
                          setPreview(null);
                        }}
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                        큐에 추가
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/*
        카드를 누르면 **사용자가 보는 프로필 그대로** 열린다. 큐레이션은 결국
        "이 사람을 그에게 보여줄 만한가" 라는 판단이라, 축약된 카드만으로는 할 수
        없다. 회원 상세와 같은 컴포넌트를 쓴다.
      */}
        <aside
          ref={previewPanel}
          tabIndex={-1}
          aria-label="후보 프로필 검토"
          className={cn("min-w-0 outline-none", !preview && "hidden xl:block")}
        >
          {preview && "birth" in preview ? (
            <div className="sticky top-0">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">상대에게 보이는 프로필</p>
                <button
                  onClick={() => {
                    previewGeneration.current += 1;
                    setPreview(null);
                    requestAnimationFrame(() => previewTrigger.current?.focus());
                  }}
                  className="pressable min-h-11 rounded-control px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  닫기
                </button>
              </div>
              <div className="mt-2 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto xl:overscroll-contain">
                <ProfileDetail p={toProfileView(preview)} />
                {/*
                미리보기에는 풀 카드(LikePoolItem)와 큐 카드(QueueCard)가 둘 다
                들어온다. 여성 id 를 담는 필드 이름이 서로 다르므로 여기서 고른다.
              */}
                <PairBriefCard
                  key={`${maleId}:${"female_id" in preview ? preview.female_id : preview.id}`}
                  maleId={maleId}
                  femaleId={"female_id" in preview ? preview.female_id : preview.id}
                  queued={
                    !dirty &&
                    saved.some(
                      (s) =>
                        s.female_id === ("female_id" in preview ? preview.female_id : preview.id),
                    )
                  }
                  onApproved={load}
                  onBusyChange={setSaving}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              카드를 누르면 프로필 전체가 여기에 열립니다.
            </p>
          )}
        </aside>
      </fieldset>
    </>
  );
}

/**
 * 큐레이션 판단을 대신하지 않는 읽기 보조물.
 *
 * 버튼을 누를 때만 만든다. 카드를 훑을 때마다 모델을 부르면 비용만 생기고,
 * 정작 큐레이터가 원 프로필을 읽는 과정도 흐려진다.
 */
function PairBriefCard({
  maleId,
  femaleId,
  queued,
  onApproved,
  onBusyChange,
}: {
  maleId: string;
  femaleId: string;
  queued: boolean;
  onApproved: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [brief, setBrief] = useState<PairBrief | null>(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<"accepted" | "discarded" | null>(null);
  const [approving, setApproving] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    setBrief(null);
    setBusy(false);
    setDecision(null);
  }, [maleId, femaleId]);

  return (
    <section className="mt-6 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold">인터뷰 기반 소개 이유</h3>
          <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
            공개 인터뷰에서 연결점을 찾고 근거를 검토합니다. 승인 전에는 회원에게 보이지 않습니다.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || approving}
          onClick={() => {
            if (sending.current) return;
            sending.current = true;
            onBusyChange(true);
            setBusy(true);
            setDecision(null);
            composePairBrief(maleId, femaleId)
              .then(setBrief)
              .catch(() =>
                toast.error("브리프를 만들지 못했습니다. 프로필과 문답으로 계속 판단해 주세요."),
              )
              .finally(() => {
                sending.current = false;
                setBusy(false);
                onBusyChange(false);
              });
          }}
        >
          {busy ? "작성·근거 확인 중…" : brief ? "설명 다시 확인" : "소개 이유 만들기"}
        </Button>
      </div>

      {brief ? (
        <div className="mt-3 space-y-4 rounded-surface border border-border bg-muted/30 p-3 text-xs leading-relaxed">
          {brief.recommendation ? (
            <div>
              <p className="font-semibold">회원에게 보일 소개 이유 · 초안</p>
              <p className="mt-2 break-keep text-sm leading-relaxed">{brief.recommendation.text}</p>
              <div className="mt-2 space-y-1 text-muted-foreground">
                {brief.recommendation.evidence.map((e, i) => (
                  <p key={i}>
                    {e.person === "a" ? "남성" : "여성"} ·{" "}
                    {AI_SOURCE_LABELS[e.sourceField] ?? "공개 원문"} · “{e.quote}”
                  </p>
                ))}
              </div>
              {queued ? (
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  disabled={busy || approving || !brief.meta?.sourceHash}
                  onClick={async () => {
                    if (sending.current || !brief.meta?.sourceHash || !brief.meta.draftRunId)
                      return;
                    sending.current = true;
                    onBusyChange(true);
                    setApproving(true);
                    try {
                      await approvePairReason(
                        maleId,
                        femaleId,
                        brief.meta.sourceHash,
                        brief.meta.draftRunId,
                      );
                      toast.success("소개 이유를 승인했습니다. 두 분에게 같은 설명을 전합니다.");
                      await onApproved();
                    } catch {
                      toast.error(
                        "현재 프로필과 큐를 다시 확인해 주세요. 바뀐 정보가 있으면 설명을 다시 만들어야 합니다.",
                      );
                    } finally {
                      sending.current = false;
                      setApproving(false);
                      onBusyChange(false);
                    }
                  }}
                >
                  {approving ? "승인 중…" : "근거 확인 후 소개에 반영"}
                </Button>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  후보를 큐에 저장한 뒤 소개 이유를 승인할 수 있습니다.
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">
              두 사람을 연결해 설명할 공개 근거가 아직 충분하지 않아요. 억지로 추천 문장을 만들지
              않았습니다.
            </p>
          )}
          {brief.meta?.cached ? (
            <p className="text-muted-foreground">
              현재 공개 자료로 검토한 초안을 다시 불러왔습니다. 추가 AI 호출은 하지 않았습니다.
            </p>
          ) : null}
          {brief.commonGround.length ? (
            <div>
              <p className="font-semibold text-foreground">함께 볼 만한 점</p>
              <ul className="mt-1.5 space-y-2">
                {brief.commonGround.map((item, index) => (
                  <li key={`${item.insight}-${index}`}>
                    <p className="text-foreground">{item.insight}</p>
                    <div className="mt-1 space-y-0.5 text-muted-foreground">
                      {item.evidence.map((e) => (
                        <p key={`${e.person}-${e.sourceField}`}>
                          {e.person === "a" ? "남성" : "여성"} ·{" "}
                          {AI_SOURCE_LABELS[e.sourceField] ?? "원문"} · “{e.quote}”
                        </p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <p className="font-semibold text-foreground">대화 출발점</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
              {brief.conversationStarters.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
          {brief.considerations.length ? (
            <div>
              <p className="font-semibold text-foreground">직접 확인할 점</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                {brief.considerations.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {brief.meta?.runId && !decision ? (
            <div className="flex gap-2 border-t border-border pt-3">
              {(["accepted", "discarded"] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="text-xs underline-offset-2 hover:underline"
                  onClick={() => {
                    const runId = brief.meta?.runId;
                    if (!runId) return;
                    void recordMyAiDecision(runId, choice)
                      .then(() => setDecision(choice))
                      .catch(() => toast.error("의견을 기록하지 못했습니다."));
                  }}
                >
                  {choice === "accepted" ? "판단에 도움 됨" : "사용 안 함"}
                </button>
              ))}
            </div>
          ) : null}
          {decision ? <p className="text-muted-foreground">의견을 기록했습니다.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function TimeFit({ count }: { count: number | null }) {
  if (count === null) return <>최근 가능 시간 미확인</>;
  if (count === 0) return <>평소 가능한 요일이 다름</>;
  return <>평소 가능한 요일 {count}일 겹침</>;
}

function age(birth: string | null) {
  if (!birth) return "";
  const d = new Date(birth);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return `${a}`;
}

function Thumb({ path }: { path: string | null }) {
  const url = usePhotoUrl(path);
  return (
    <div className="size-10 shrink-0 overflow-hidden rounded-full bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}

/**
 * 두 회원에게 같은 문구로 전하는 운영팀의 소개 이유.
 * 감사용 사유(note)와 다르다 — 이건 받는 사람이 읽는 문장이다. 점수·궁합·"먼저 관심"은
 * 쓰지 않는다. 두 사람이 직접 적은 것에서 겹치는 이야기를 사실대로 한 줄.
 */
function ReasonEditor({
  maleId,
  femaleId,
  initial,
  disabled,
  onSaved,
  onBusyChange,
}: {
  maleId: string;
  femaleId: string;
  initial: string;
  disabled?: boolean;
  onSaved: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const changed = value.trim() !== initial.trim();
  return (
    <div className="mt-3 flex items-center gap-2">
      <Input
        aria-label="두 분에게 전할 소개 이유"
        placeholder="두 분에게 전할 소개 이유 (선택, 120자)"
        maxLength={120}
        value={value}
        disabled={busy || disabled}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-11 text-base"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy || disabled || !changed}
        onClick={async () => {
          if (sending.current) return;
          sending.current = true;
          setBusy(true);
          onBusyChange(true);
          try {
            await setQueueReason(maleId, femaleId, value);
            toast.success("한 줄을 저장했습니다.");
            await onSaved();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "저장하지 못했습니다.");
          } finally {
            setBusy(false);
            sending.current = false;
            onBusyChange(false);
          }
        }}
      >
        저장
      </Button>
    </div>
  );
}

function Cover({ path, name }: { path: string | null; name: string | null }) {
  const url = usePhotoUrl(path);
  if (url) return <img src={url} alt="" className="size-full object-cover" />;
  return (
    <div className="grid size-full place-items-center bg-muted">
      <span className="text-3xl text-muted-foreground">{(name ?? "?").slice(0, 1)}</span>
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="pressable grid size-11 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
