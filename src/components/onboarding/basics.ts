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

export type Basics = {
  name: string;
  /** 프로필 사진 1장 (data URL) */
  photo: string;
  birth: string; // YYYY-MM-DD
  job: string;
  mbti: string;
  smoking: string;
  drinking: string;
  religion: string;
};

export const emptyBasics: Basics = {
  name: "",
  photo: "",
  birth: "",
  job: "",
  mbti: "",
  smoking: "",
  drinking: "",
  religion: "",
};

export function ageFrom(birth: string) {
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function basicsValid(b: Basics) {
  const age = ageFrom(b.birth);
  // 사진 필수(D5, 2026-10-10). 서버의 후보 조건도 승인된 사진을 요구한다.
  return (
    Boolean(b.photo) &&
    b.name.trim().length >= 2 &&
    age !== null &&
    age >= 19 &&
    age <= 79 &&
    b.job.trim().length >= 2
  );
}

/**
 * 흡연·음주는 인터뷰 뒤 "만나기 전에 알아 두면 좋은 것" 화면에서 받는다(리부팅 C).
 * 조건을 먼저 물으면 가입이 스펙 비교로 시작한다. 그래도 흡연은 실제로 많은 사람이
 * 거르는 조건이라 필수로 둔다. MBTI·종교는 선택.
 */
export function conditionsValid(b: Basics) {
  return Boolean(b.smoking) && Boolean(b.drinking);
}
