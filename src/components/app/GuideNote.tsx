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

/**
 * 세라의 안내 카드.
 *
 * ── 장식을 걷어낸 이유 ──
 * 예전에는 한 문장을 전하려고 장식을 다섯 개 썼다: 분홍 테두리, 분홍 틴트 채움,
 * 왼쪽 세로 막대, 원형 이니셜 아바타("S"), 알약 모양 배지 두 개. 여기에 행동
 * 버튼까지 카드 안에 들어갔다.
 *
 * 그 조합이 정확히 **챗봇 위젯의 생김새**다. 아바타 원과 이름 배지는 "여기 봇이
 * 있습니다" 를 그림으로 말하는 장치이고, 우리는 그 말을 이미 글자로 하고 있다
 * (아래 GUIDE_ROLE). 같은 말을 두 번 하면서 화면만 시끄러워졌다.
 *
 * 게다가 홈 화면에서 이 카드가 가장 큰 요소라, 분홍 틴트가 화면 절반을 덮었다.
 * 브랜드 색이 큰 면적을 먹으면 색이 기억되는 게 아니라 싸 보인다.
 *
 * 지금은 다른 카드와 같은 중립 표면이고, 세라라는 사실은 **작은 라벨 한 줄**로만
 * 남는다. 눈에 띄어야 하는 것은 안내자가 아니라 안내 내용이다.
 */
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
    <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
      <div className="px-5 pt-4 pb-5">
        <p className="text-3xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {GUIDE_NAME} · {GUIDE_ROLE}
        </p>

        {lines ? (
          <div className="mt-2.5 space-y-1.5">
            {lines.map((line) => (
              <p key={line} className="text-sm leading-relaxed text-foreground">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-2.5 text-sm leading-relaxed text-foreground">{children}</p>
        )}

        {introduce ? (
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            세라는 사람이 아니라 약속 조율을 돕는 자동 안내입니다. 예약을 대신 잡아 드리지는
            않습니다.
          </p>
        ) : null}
      </div>

      {/*
        행동은 카드 아래 끝에 붙인다. 안쪽 여백 안에 버튼을 넣으면 카드 안에 또
        카드가 있는 모양이 되어, 눌러야 할 것과 읽어야 할 것의 경계가 흐려진다.
      */}
      {action ? <div className="border-t border-border">{action}</div> : null}
    </div>
  );
}
