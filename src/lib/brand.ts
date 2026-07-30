/**
 * 브랜드 상수 — 서비스명 변경 시 이 파일만 수정하면 됩니다.
 * 세렌디피티(Serendipity): 우연히 찾아오는 뜻밖의 좋은 만남.
 */
export const BRAND = {
  name: "세렌디피티",
  nameEn: "Serendipity",

  tagline: "퇴근하고 만나기 좋은 거리에, 좋은 사람 한 명.",
  description:
    "직장 인증을 마친 테헤란로·역삼권 직장인끼리, 오가는 길이 겹치는 한 사람을 소개받습니다. 저녁 한 끼든 가벼운 한 잔이든, 무엇을 할지는 두 분이 정하세요.",
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
