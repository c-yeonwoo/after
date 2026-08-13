/**
 * 브랜드 상수 — 서비스명 변경 시 이 파일만 수정하면 됩니다.
 *
 * 정식 명칭은 **애프터선셋**(도메인 aftersunset.kr), 화면에 쓰는 이름은
 * **애프터**다. 둘을 나눈 이유:
 *
 *   · 애프터선셋은 6음절이라 헤더·페이지 제목에서 길고, 한국어로 읽으면
 *     "애프터"와 "선셋" 둘 다 로맨틱한 단어라 겹쳐서 감성 과잉으로 읽힌다.
 *   · 반면 정식 명칭으로는 값이 있다 — 도메인·상표를 넓게 확보할 수 있고
 *     ("after" 단독은 .kr 이 이미 막혀 있었다), 검색에서 다른 "after" 와
 *     섞이지 않는다.
 *   · 축약 "애프터"가 한국 소개팅 어휘("애프터 신청")와 겹치는 것은 이
 *     서비스에서 이점이다. 카테고리가 설명 없이 전달된다.
 *
 * **쓰는 규칙**: 사용자에게 보이는 자리에는 `short`. 정식 표기가 필요한
 * 자리(공유 메타의 사이트명, 약관·고지 같은 문서)에만 `name`.
 *
 * **라틴 표기는 `nameEn` 하나다.** 로고 워드마크가 한동안 `after` 였는데 그건
 * 정식명도 약칭도 영문명도 아니었다 — 도메인은 aftersunset.kr 이고, 영어
 * `after` 는 전치사라 단독으로는 이름처럼 읽히지 않는다. 위 주석이 적어 둔
 * "`after` 단독은 .kr 이 이미 막혀 있었다" 는 사정도 같은 방향을 가리킨다.
 * 라틴 문자로 서비스명을 적는 자리(워드마크·앱 아이콘 옆)에는 `nameEn` 을 쓴다.
 */
export const BRAND = {
  /** 정식 명칭. 문서·메타 등 격식이 필요한 자리에만. */
  name: "애프터선셋",
  /** 화면에 쓰는 이름. 기본값은 이쪽이다. */
  short: "애프터",
  nameEn: "After Sunset",
  domain: "aftersunset.kr",

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

/**
 * 만남 티켓 가격 (D 확정: 30,000원).
 * 서버 권위 값은 `ticket_orders.amount` CHECK 와 `create_ticket_order()` 에 있고,
 * 이건 화면 표기 전용이다 — PRD F5 "화면에 가격을 명시한다".
 */
export const MEETING_TICKET_PRICE_KRW = 30000;
export const MEETING_TICKET_PRICE_LABEL = `${MEETING_TICKET_PRICE_KRW.toLocaleString("ko-KR")}원`;

/**
 * 소개 티켓 가격 (v2, 5,000원). 소개 프로필을 **열람**할 때 1장이 쓰이고
 * 돌려받을 수 없다 — 만남 티켓과 성격이 다르므로 상수도 따로 둔다.
 * 서버 권위 값은 ticket_bundle_amount(quantity, kind) 다.
 */
export const INTRO_TICKET_PRICE_KRW = 5000;
export const INTRO_TICKET_PRICE_LABEL = `${INTRO_TICKET_PRICE_KRW.toLocaleString("ko-KR")}원`;

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
    // PRD 비목표: "AI" 표기를 쓰지 않는다 (F2 — 표기는 "인터뷰")
    title: "인터뷰 프로필",
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
    // PRD F5·비목표: "만남 보장" 같은 절대어를 쓰지 않고 환불 규칙을 명시한다
    title: "실제로 만나는 데까지",
    body: "채팅만 하다 흐지부지되지 않도록 약속 조율을 돕습니다. 상대가 24시간 안에 응답하지 않으면 티켓은 자동으로 환불됩니다.",
  },
  {
    id: "feedback",
    title: "만남 후 피드백 (선택)",
    body: "남기면 다음 소개가 더 정확해집니다. 상대에게는 공개되지 않습니다.",
  },
] as const;
