/**
 * 모델 응답의 제품 계약. 프롬프트만 믿지 않고 저장/노출 직전에 다시 검사한다.
 * Deno Edge Function과 로컬 품질 회귀 테스트가 같은 함수를 사용한다.
 */

const HEADLINE_MIN = 15;
const HEADLINE_MAX = 35;
const INTRO_MIN = 150;
const INTRO_MAX = 350;

const BANNED_PHRASES = [
  "진심입니다",
  "소소한 행복",
  "함께하고 싶어요",
  "일상에 스며든",
  "하루를 마무리합니다",
];

export const characterCount = (value: string) => Array.from(value).length;

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function hasBannedStyle(value: string) {
  return (
    BANNED_PHRASES.some((phrase) => value.includes(phrase)) ||
    /[—;!()]/.test(value) ||
    /[\p{Extended_Pictographic}]/u.test(value)
  );
}

export function validProfileComposition(headlines: string[], intro: string) {
  if (headlines.length !== 3) return false;
  const normalized = new Set<string>();
  for (const headline of headlines) {
    const compact = headline.replace(/\s+/g, " ").trim();
    if (
      characterCount(compact) < HEADLINE_MIN ||
      characterCount(compact) > HEADLINE_MAX ||
      hasBannedStyle(compact)
    ) {
      return false;
    }
    normalized.add(compact.replace(/[\s.]/g, ""));
  }
  if (normalized.size !== 3) return false;

  const paragraphs = intro
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    characterCount(intro) >= INTRO_MIN &&
    characterCount(intro) <= INTRO_MAX &&
    paragraphs.length >= 2 &&
    paragraphs.length <= 3 &&
    !hasBannedStyle(intro)
  );
}

type PairBrief = {
  commonGround: { insight: string; basis: string }[];
  conversationStarters: string[];
  considerations: string[];
};

function isShortText(value: string, min: number, max: number) {
  const length = characterCount(value.trim());
  return length >= min && length <= max && !/[\p{Extended_Pictographic}]/u.test(value);
}

export function validPairBrief(brief: PairBrief) {
  return (
    brief.commonGround.length <= 3 &&
    brief.conversationStarters.length === 3 &&
    brief.considerations.length <= 2 &&
    brief.commonGround.every(
      (item) => isShortText(item.insight, 8, 110) && isShortText(item.basis, 3, 100),
    ) &&
    brief.conversationStarters.every((item) => isShortText(item, 8, 120)) &&
    brief.considerations.every((item) => isShortText(item, 8, 120))
  );
}
