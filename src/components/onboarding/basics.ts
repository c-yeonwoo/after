/** MBTI 4개 축 — 각 축에서 하나씩 골라 완성합니다. */
export const MBTI_AXES = [
  { key: "ei", left: "I", right: "E", leftHint: "내향", rightHint: "외향" },
  { key: "sn", left: "S", right: "N", leftHint: "감각", rightHint: "직관" },
  { key: "tf", left: "T", right: "F", leftHint: "사고", rightHint: "감정" },
  { key: "pj", left: "P", right: "J", leftHint: "탐색", rightHint: "계획" },
] as const;

export const SMOKING_OPTIONS = [
  { id: "none", label: "비흡연" },
  { id: "quit", label: "금연 중" },
  { id: "sometimes", label: "가끔" },
  { id: "yes", label: "흡연" },
] as const;

export const DRINKING_OPTIONS = [
  { id: "none", label: "안 마심" },
  { id: "rare", label: "가끔 한 잔" },
  { id: "social", label: "즐기는 편" },
  { id: "often", label: "자주" },
] as const;

export const RELIGION_OPTIONS = [
  { id: "none", label: "무교" },
  { id: "christian", label: "기독교" },
  { id: "catholic", label: "천주교" },
  { id: "buddhist", label: "불교" },
  { id: "other", label: "기타" },
] as const;

/** 사진 장수. 서버 CHECK(s53)는 최대 6장, 자격은 승인된 3장 이상이다. */
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 6;

export type Basics = {
  name: string;
  /** 프로필 사진 Storage 경로. 순서 = 보여 줄 순서, 첫 장이 대표(s53). */
  photos: string[];
  birth: string; // YYYY-MM-DD
  job: string;
  mbti: string;
  smoking: string;
  drinking: string;
  religion: string;
};

export const emptyBasics: Basics = {
  name: "",
  photos: [],
  birth: "",
  job: "",
  mbti: "",
  smoking: "",
  drinking: "",
  religion: "",
};

/** 서버와 같은 한국 날짜 기준. 날짜 문자열의 자동 보정(예: 2월 30일)은 허용하지 않는다. */
export function ageFrom(birth: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(now.getTime())) return null;
  const d = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== birth) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  let age = part("year") - d.getUTCFullYear();
  const m = part("month") - (d.getUTCMonth() + 1);
  if (m < 0 || (m === 0 && part("day") < d.getUTCDate())) age -= 1;
  return age;
}

export function basicsIssues(b: Basics): string[] {
  const age = ageFrom(b.birth);
  const issues: string[] = [];
  // 사진 3장 이상(D5 → s53). 서버의 후보 조건도 승인된 3장을 요구한다.
  if (b.photos.length < MIN_PHOTOS) issues.push(`사진 ${MIN_PHOTOS - b.photos.length}장`);
  if (b.name.trim().length < 2) issues.push("이름 2자 이상");
  if (!b.birth) issues.push("생년월일");
  else if (age === null || age < 19 || age > 79) issues.push("만 19~79세 생년월일");
  if (b.job.trim().length < 2) issues.push("직업 2자 이상");
  return issues;
}

export function basicsValid(b: Basics) {
  return basicsIssues(b).length === 0;
}

/**
 * 흡연·음주는 인터뷰 뒤 "만나기 전에 알아 두면 좋은 것" 화면에서 받는다(리부팅 C).
 * 조건을 먼저 물으면 가입이 스펙 비교로 시작한다. 그래도 흡연은 실제로 많은 사람이
 * 거르는 조건이라 필수로 둔다. MBTI·종교는 선택.
 */
export function conditionsValid(b: Basics) {
  return Boolean(b.smoking) && Boolean(b.drinking);
}
