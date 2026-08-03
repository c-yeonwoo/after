import type { ReactNode } from "react";

/** 안내자 「세라」 — 전환 지점에서만 등장하는 목소리 (혼합형 컨셉) */
export const GUIDE_NAME = "세라";

/**
 * 세라의 말은 문장마다 줄을 바꾼다.
 * 안내문은 보통 "상황 + 다음 행동" 두 문장인데, 이어 붙이면 어디까지가 상황이고
 * 어디부터가 할 일인지 한눈에 안 들어온다.
 *
 * 문자열일 때만 나눈다 — children 에 엘리먼트가 들어오면 그대로 둔다.
 */
function splitSentences(node: ReactNode): string[] | null {
  if (typeof node !== "string") return null;
  const parts = node
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : null;
}

/** PRD F6·D11: 세라는 사람이 아니라 기능이다. 이 사실을 숨기지 않는다. */
export const GUIDE_ROLE = "자동 안내";

export function GuideNote({
  children,
  /**
   * 세라가 처음 등장하는 자리에서는 정체를 한 문장으로 밝힌다 (PRD F6).
   * 결제(티켓) 화면 이전에 반드시 한 번은 노출돼야 한다.
   */
  introduce = false,
  /**
   * 세라의 말과 그에 따른 행동을 **한 카드로 묶는다.**
   * 따로 두면 "안내"와 "지금 할 일"이 같은 내용을 두 번 말하게 된다.
   */
  action,
}: {
  children: ReactNode;
  introduce?: boolean;
  action?: ReactNode;
}) {
  const lines = splitSentences(children);

  return (
    <div className="relative overflow-hidden rounded-surface border border-primary/30 bg-primary/12 shadow-card">
      <span className="absolute inset-y-0 left-0 w-1.5 bg-primary" aria-hidden="true" />
      <div className="flex gap-3 py-4 pr-4 pl-5">
        {/*
          아바타 자리 — 지금은 이니셜 플레이스홀더다.
          사람 일러스트로 교체할 때 이 span 만 바꾸면 된다(크기·정렬 유지).
        */}
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm leading-none font-bold text-primary-foreground shadow-sm"
        >
          S
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-2xs font-semibold tracking-[0.14em] text-primary-strong uppercase">
              {GUIDE_NAME}
            </span>
            <span className="rounded-control bg-primary/15 px-2 py-0.5 text-3xs font-semibold tracking-wide text-primary-strong">
              {GUIDE_ROLE}
            </span>
          </p>
          {lines ? (
            <div className="mt-1.5 space-y-1">
              {lines.map((line) => (
                <p key={line} className="text-sm leading-relaxed text-foreground">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{children}</p>
          )}
          {introduce ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              세라는 사람이 아니라 약속 조율을 돕는 자동 안내입니다. 예약을 대신 잡아 드리지는
              않습니다.
            </p>
          ) : null}

          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
