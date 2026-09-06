import { useState } from "react";
import { toast } from "sonner";

import { savePreferenceAnswer } from "@/lib/api";
import { ACTIVE_QUESTIONS, nextQuestions, type PreferenceQuestion } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * 취향 문답 카드 — 기다리는 동안 하는 일.
 *
 * ── 보상을 만들지 않는다 ──
 * 포인트도, 연속 출석도, 진행률 뱃지도 없다. 소개팅 서비스에서 점수판은 사람을
 * 수집 대상으로 만들고, 그건 "고르는 피로 없이 한 사람에 집중" 과 반대 방향이다.
 *
 * 그 대신 **답이 실제로 쓰인다는 사실**을 말한다. 그 문장이 참이려면 쓰는 쪽이
 * 먼저 있어야 하고, 그래서 큐레이션 화면의 대조표를 같은 작업에서 만들었다
 * (admin_preference_compare). 쓰이지 않는 것을 채우게 하는 화면은 이미 하나
 * 있었고, 하나 더 만들지 않는다.
 *
 * ── 한 번에 세 개 ──
 * 아홉 개를 늘어놓으면 설문이 되고, 설문은 시작하기 전에 닫힌다. 세 개는
 * "지금 해치울 수 있다" 로 읽히는 분량이다. 답하면 그 자리에서 다음 세 개가
 * 차오르지 않는다 — 오늘 몫을 끝냈다는 감각이 남아야 내일 다시 연다.
 */
export function PreferenceCard({
  answered,
  onAnswered,
}: {
  answered: ReadonlyMap<number, number>;
  onAnswered: (questionId: number, choice: 0 | 1) => void;
}) {
  const [batch] = useState<PreferenceQuestion[]>(() => nextQuestions(answered));
  const [busy, setBusy] = useState<number | null>(null);

  const done = answered.size;
  const total = ACTIVE_QUESTIONS.length;

  // 이번 묶음을 다 답했으면 자리를 비운다. 남겨 두면 "다 했는데 왜 아직 있지" 가 된다.
  const remaining = batch.filter((q) => !answered.has(q.id));
  if (remaining.length === 0) {
    if (done < total) return null;
    return (
      <section className="mt-6" aria-label="취향 문답">
        <div className="rounded-surface border border-border bg-card px-5 py-4">
          <p className="text-sm font-semibold">취향 문답을 모두 답하셨어요</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            소개를 고를 때 이 답을 함께 봅니다. 생각이 바뀌면 언제든 다시 고르실 수 있어요.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6" aria-label="취향 문답">
      <div className="overflow-hidden rounded-surface border border-border bg-card">
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">취향 문답</p>
            {/*
              진행률을 숫자로만 적는다. 막대를 그리면 채우는 것이 목적이 되고,
              그러면 답이 아니라 완주가 보상이 된다.
            */}
            <p className="text-2xs tabular-nums text-muted-foreground">
              {done} / {total}
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            소개를 고를 때 이 답을 함께 봅니다. 정답은 없어요.
          </p>
        </div>

        <ul>
          {remaining.map((q) => (
            <li key={q.id} className="border-t border-border px-5 py-4 first:border-t-0">
              <p className="text-sm font-medium text-foreground">{q.prompt}</p>
              <div className="mt-2.5 flex gap-2">
                {q.options.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(q.id);
                      try {
                        await savePreferenceAnswer(q.id, i as 0 | 1);
                        onAnswered(q.id, i as 0 | 1);
                      } catch {
                        toast.error("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className={cn(
                      "min-h-11 flex-1 rounded-control border border-border bg-background px-3 text-sm transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      busy === q.id ? "opacity-60" : "hover:border-primary",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
