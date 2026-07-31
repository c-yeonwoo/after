/**
 * 브랜드 상수 — 서비스명 변경 시 이 파일만 수정하면 됩니다.
 * 애프터(After): 퇴근 후, 하루의 다음 장면에서 만나는 사람.
 */
export const BRAND = {
  name: "애프터",
  nameEn: "After",

  tagline: "퇴근하고 만나기 좋은 거리에, 좋은 사람 한 명.",
  description:
    "직장 인증을 마친 강남·역삼권 직장인끼리, 오가는 길이 겹치는 한 사람을 소개받습니다. 저녁 한 끼든 가벼운 한 잔이든, 무엇을 할지는 두 분이 정하세요.",
} as const;



export const HUBS = [
  {
    id: "gangnam",
    label: "강남·역삼권",
    detail: "강남 · 역삼 · 선릉 · 삼성",
    available: true,
  },
  {
    id: "pangyo",
    label: "판교권",
    detail: "판교 · 정자 · 서현",
    available: false,
  },
  {
    id: "jongno",
    label: "종로권",
    detail: "종로 · 광화문 · 을지로",
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

/** 서비스가 제공하는 것 — 랜딩·온보딩에 공통 노출 */
export const FEATURES = [
  {
    id: "verify",
    title: "직장 인증 · 가까운 거리",
    body: "회사 이메일로 재직을 확인하고, 퇴근하고 만나기 좋은 거리 안에서만 소개합니다.",
  },
  {
    id: "profile",
    title: "AI 인터뷰 프로필",
    body: "몇 가지 질문에 답하면 사진과 스펙 대신, 대화 결이 드러나는 소개글을 만들어 드립니다.",
  },
  {
    id: "match",
    title: "매칭 주선",
    body: "훑어보는 피드는 없습니다. 서로 맞을 만한 한 사람씩만 순서대로 소개합니다.",
  },
  {
    id: "chat",
    title: "채팅 오픈",
    body: "양쪽이 좋다고 하면 대화가 열립니다. 약속을 잡는 데 필요한 만큼만.",
  },
  {
    id: "meet",
    title: "만남 보장",
    body: "채팅만 하다 흐지부지되지 않도록, 실제로 만나는 데까지 서비스가 챙깁니다.",
  },
  {
    id: "feedback",
    title: "만남 후 피드백 (선택)",
    body: "남기면 다음 소개가 더 정확해집니다. 상대에게는 공개되지 않습니다.",
  },
] as const;

