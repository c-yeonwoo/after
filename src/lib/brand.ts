/**
 * 브랜드 상수 — 서비스명 변경 시 이 파일만 수정하면 됩니다.
 */
export const BRAND = {
  name: "퇴근길",
  nameEn: "Toegeungil",
  tagline: "같은 퇴근길에서, 호감 있는 한 사람과, 카페 한 잔.",
  description:
    "테헤란로·역삼권 직장인을 위한 1:1 프라이빗 매칭. 스와이프 없이, 이미 호감이 오간 한 사람만 순서대로 만납니다.",
} as const;

export const HUBS = [
  {
    id: "teheran",
    label: "테헤란로·역삼권",
    detail: "역삼 · 선릉 · 삼성 · 강남",
    available: true,
  },
  {
    id: "pangyo",
    label: "판교·정자권",
    detail: "판교 · 정자 · 서현",
    available: false,
  },
  {
    id: "yeouido",
    label: "여의도권",
    detail: "여의도 · 영등포",
    available: false,
  },
] as const;

export type HubId = (typeof HUBS)[number]["id"];

/** 회사 이메일 인증에서 거부하는 개인 메일 도메인 */
export const PERSONAL_EMAIL_DOMAINS = [
  "gmail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "nate.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "yahoo.com",
  "protonmail.com",
];

export function isCompanyEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return false;
  return !PERSONAL_EMAIL_DOMAINS.includes(domain);
}

/** 1차 만남 프로토콜 — 온보딩·매칭 UI에 반복 노출되는 규칙 */
export const FIRST_MEETING_PROTOCOL = [
  {
    title: "1차는 카페",
    body: "퇴근길 카페 한 잔, 45~60분. 부담 없이 결이 맞는지만 확인합니다.",
  },
  {
    title: "술은 양쪽이 원할 때만",
    body: "두 사람 모두 술을 선호로 표시한 경우에만 술자리가 열립니다.",
  },
  {
    title: "1차 식사는 없습니다",
    body: "밥·풀코스 데이트는 1차에서 금지. 시간과 비용의 비대칭을 만들지 않습니다.",
  },
] as const;
