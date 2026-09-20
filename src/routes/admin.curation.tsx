import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { Button } from "@/components/ui/button";
import { usePhotoUrl } from "@/lib/photo";
import { questionById } from "@/lib/preferences";
import { toProfileView } from "@/lib/profileView";
import { cn } from "@/lib/utils";
import {
  fetchCurationTargets,
  fetchLikePool,
  fetchQueue,
  setQueue,
  fetchPreferenceCompare,
  composePairBrief,
  type CurationTarget,
  type LikePoolItem,
  type PairBrief,
  type PreferenceCompareRow,
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

  const loadTargets = useCallback(async () => {
    setTargets(await fetchCurationTargets());
  }, []);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_1fr]">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">
          작업 대상 <span className="font-normal text-muted-foreground">큐가 빈 사람부터</span>
        </h2>
        {targets === null ? (
          <p className="mt-3 text-sm text-muted-foreground">불러오는 중…</p>
        ) : targets.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">활성 남성 회원이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-surface border border-border">
            {targets.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => void navigate({ search: { male: t.id }, replace: true })}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    male === t.id ? "bg-muted" : "hover:bg-muted/50"
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

      <div className="min-w-0">
        {male ? (
          <Workbench
            maleId={male}
            target={targets?.find((t) => t.id === male)}
            onSaved={loadTargets}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            왼쪽에서 남성 회원을 고르면 그를 좋다고 한 여성 목록이 나옵니다.
          </p>
        )}
      </div>
    </div>
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
  onSaved: () => void;
}) {
  const [pool, setPool] = useState<LikePoolItem[] | null>(null);
  const [saved, setSaved] = useState<QueueCard[]>([]);
  // 화면에서 세우는 순서. female_id 배열이 그대로 admin_set_queue 의 인자가 된다.
  const [order, setOrder] = useState<string[]>([]);
  const [preview, setPreview] = useState<LikePoolItem | QueueCard | null>(null);

  const load = useCallback(async () => {
    const [p, q] = await Promise.all([fetchLikePool(maleId), fetchQueue(maleId)]);
    setPool(p);
    setSaved(q);
    setOrder(q.map((c) => c.female_id));
    setPreview(null);
  }, [maleId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 큐에 든 사람의 표시 정보. 이미 저장된 카드거나 방금 풀에서 옮긴 사람이다.
  const cardOf = (id: string) =>
    saved.find((c) => c.female_id === id) ?? (pool ?? []).find((p) => p.id === id) ?? null;

  const inQueue = new Set(order);
  const available = (pool ?? []).filter((p) => !inQueue.has(p.id));
  const dirty = order.length !== saved.length || order.some((id, i) => saved[i]?.female_id !== id);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
      <div className="min-w-0">
        <header className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold">
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
        </header>

        {/* ── 큐 ── */}
        <section className="mt-4">
          <p className="text-xs text-muted-foreground">
            위 {DELIVER_WINDOW}장만 전송됩니다. 나머지는 자리가 비면 올라갑니다.
          </p>
          {order.length === 0 ? (
            <p className="mt-3 rounded-surface border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
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
                    className={`flex items-center gap-3 rounded-surface border px-3 py-2 ${
                      delivering ? "border-border" : "border-dashed border-border bg-muted/30"
                    }`}
                  >
                    <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <Thumb path={c?.photo_url ?? null} />
                    <button
                      onClick={() => setPreview(c)}
                      className="min-w-0 flex-1 text-left"
                      title="프로필 보기"
                    >
                      <span className="text-sm font-semibold underline-offset-2 hover:underline">
                        {c ? (c.name ?? "(이름 없음)") : "(불러오는 중)"}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
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
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
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
            <div className="mt-4 rounded-surface border border-border p-4">
              <p className="text-sm font-semibold">
                변경 {order.length}장
                <span className="ml-2 font-normal text-muted-foreground">
                  저장 전까지 반영되지 않습니다
                </span>
              </p>
              <NoteAction
                placeholder="큐레이션 사유 (필수 — 왜 이 순서인지)"
                onDone={() => {
                  void load();
                  onSaved();
                }}
                actions={[
                  {
                    label: "큐 저장",
                    done: "큐를 저장했습니다.",
                    run: async (note) => {
                      await setQueue(maleId, order, note);
                    },
                  },
                ]}
              />
              <button
                onClick={() => setOrder(saved.map((c) => c.female_id))}
                className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
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
                <li key={p.id} className="overflow-hidden rounded-surface border border-border">
                  <button
                    onClick={() => setPreview(p)}
                    className="block w-full"
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
                      {p.waiting_hours !== null ? `${Math.floor(p.waiting_hours / 24)}일 대기` : ""}
                    </p>
                    {/*
                      취향 일치 수(s31). **분모를 반드시 함께 적는다** — 3중 3과
                      9중 7은 다른 신호이고, 비율만 쓰면 한 문항만 답한 사람이
                      100%가 된다. 운영 대시보드가 이미 지키고 있는 규율이다.
                    */}
                    {p.pref_both !== null && p.pref_both > 0 ? (
                      <p className="mt-0.5 text-2xs tabular-nums">
                        <span className="text-muted-foreground">취향 </span>
                        <span className="font-semibold text-foreground">
                          {p.pref_agree} / {p.pref_both}
                        </span>
                      </p>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => {
                        setOrder([...order, p.id]);
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
      <aside className="min-w-0">
        {preview && "birth" in preview ? (
          <div className="sticky top-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">상대에게 보이는 프로필</p>
              <button
                onClick={() => setPreview(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                닫기
              </button>
            </div>
            <div className="mt-2 max-h-[calc(100dvh-14rem)] overflow-y-auto rounded-surface border border-border p-4">
              <ProfileDetail p={toProfileView(preview)} />
              {/*
                미리보기에는 풀 카드(LikePoolItem)와 큐 카드(QueueCard)가 둘 다
                들어온다. 여성 id 를 담는 필드 이름이 서로 다르므로 여기서 고른다.
              */}
              <PreferenceCompare
                maleId={maleId}
                femaleId={"female_id" in preview ? preview.female_id : preview.id}
              />
              <PairBriefCard
                maleId={maleId}
                femaleId={"female_id" in preview ? preview.female_id : preview.id}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            카드를 누르면 프로필 전체가 여기에 열립니다.
          </p>
        )}
      </aside>
    </div>
  );
}

/**
 * 큐레이션 판단을 대신하지 않는 읽기 보조물.
 *
 * 버튼을 누를 때만 만든다. 카드를 훑을 때마다 모델을 부르면 비용만 생기고,
 * 정작 큐레이터가 원 프로필을 읽는 과정도 흐려진다.
 */
function PairBriefCard({ maleId, femaleId }: { maleId: string; femaleId: string }) {
  const [brief, setBrief] = useState<PairBrief | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBrief(null);
    setBusy(false);
  }, [maleId, femaleId]);

  return (
    <section className="mt-6 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold">페어 브리프</h3>
          <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
            프로필과 취향 문답을 다시 읽기 위한 메모입니다. 소개 순서나 결정을 자동으로 바꾸지
            않습니다.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            composePairBrief(maleId, femaleId)
              .then(setBrief)
              .catch(() =>
                toast.error("브리프를 만들지 못했습니다. 프로필과 문답으로 계속 판단해 주세요."),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "만드는 중…" : brief ? "다시 만들기" : "브리프 만들기"}
        </Button>
      </div>

      {brief ? (
        <div className="mt-3 space-y-4 rounded-surface border border-border bg-muted/30 p-3 text-xs leading-relaxed">
          {brief.commonGround.length ? (
            <div>
              <p className="font-semibold text-foreground">함께 볼 만한 점</p>
              <ul className="mt-1.5 space-y-2">
                {brief.commonGround.map((item, index) => (
                  <li key={`${item.insight}-${index}`}>
                    <p className="text-foreground">{item.insight}</p>
                    <p className="mt-0.5 text-muted-foreground">근거 · {item.basis}</p>
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
        </div>
      ) : null}
    </section>
  );
}

/**
 * 취향 문답 대조표.
 *
 * 이 화면이 있어야 홈의 "소개를 고를 때 이 답을 함께 봅니다" 가 참이 된다.
 * 모으기만 하고 쓰지 않으면 그 문장은 거짓말이고, 지금 15개 프로필 항목이 정확히
 * 그 상태다. 같은 함정을 하나 더 파지 않으려고 같은 작업에서 만들었다.
 *
 * 한쪽만 답한 문항도 보여준다. 큐레이터가 "아직 답이 적은 사람" 을 알아볼 수
 * 있어야 일치 수를 과신하지 않는다.
 */
function PreferenceCompare({ maleId, femaleId }: { maleId: string; femaleId: string }) {
  const [rows, setRows] = useState<PreferenceCompareRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    fetchPreferenceCompare(maleId, femaleId)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [maleId, femaleId]);

  if (rows === null) return null;
  const both = rows.filter((r) => r.male_choice !== null && r.female_choice !== null);
  if (rows.length === 0) {
    return (
      <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        두 분 다 취향 문답에 답하지 않았습니다.
      </p>
    );
  }
  const agree = both.filter((r) => r.male_choice === r.female_choice).length;

  return (
    <section className="mt-6 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold">취향 문답</h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          둘 다 답한 {both.length}문항 중{" "}
          <span className="font-semibold text-foreground">{agree}개 일치</span>
        </p>
      </div>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const q = questionById(r.question_id);
          if (!q) return null;
          const pick = (c: number | null) => (c === null ? "—" : q.options[c]);
          const same =
            r.male_choice !== null && r.female_choice !== null && r.male_choice === r.female_choice;
          return (
            <li key={r.question_id} className="text-2xs leading-relaxed">
              <p className="text-muted-foreground">{q.prompt}</p>
              <p
                className={cn(
                  "tabular-nums",
                  same ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                남 {pick(r.male_choice)} · 여 {pick(r.female_choice)}
                {same ? " · 같음" : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
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

function Cover({ path, name }: { path: string | null; name: string | null }) {
  const url = usePhotoUrl(path);
  if (url) return <img src={url} alt="" className="size-full object-cover" />;
  return (
    <div className="grid size-full place-items-center bg-gradient-to-br from-primary/70 to-accent">
      <span className="text-3xl text-background/90">{(name ?? "?").slice(0, 1)}</span>
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
      className="grid size-7 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
