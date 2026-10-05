/** Customer-facing identity. Technical identifiers and the current domain stay separate. */
export const BRAND = {
  name: "애프터",
  nameEn: "after",
  domain: "eclps.kr",

  tagline: "퇴근 후, 한 사람과의 약속.",
  description:
    "회사 이메일을 인증한 직장인을 한 번에 한 사람씩 소개하고, 약속 조율을 도와드리는 서비스입니다.",
} as const;

/**
 * 권역 정의.
 *
 * ── stations 가 왜 여기 있나 ──
 * 만남 장소로 고를 수 있는 역 목록은 **권역의 정의에 속한다.** 예전에는
 * `meet.ts` 에 강남권 역만 담긴 배열 하나가 전역으로 있어서, 판교 사용자가
 * 생기는 순간 "역 이름 검색"에 강남 역만 나오는 상태가 됐다. 권역을 여는
 * 스위치(`available`)와 그 권역의 역이 한 자리에 있어야 그 사고가 안 난다.
 *
 * 아직 안 연 권역도 목록을 채워 둔다 — `available` 한 줄만 바꾸면 열리도록.
 */
export const HUBS = [
  {
    id: "gangnam",
    label: "강남·역삼권",
    detail: "강남 · 역삼 · 선릉 · 삼성",
    available: true,
    /*
      노선으로 묶지 않는다 — 강남·역삼권은 2호선 연속 구간이지만 논현·신논현처럼
      다른 노선의 역도 충분히 이동 가능 범위라, 노선을 전제하면 실제 가능한
      선택지를 오히려 좁힌다.
    */
    stations: [
      "강남",
      "역삼",
      "선릉",
      "삼성",
      "논현",
      "신논현",
      "언주",
      "학동",
      "선정릉",
      "강남구청",
      "삼성중앙",
      "봉은사",
      "청담",
      "압구정",
      "신사",
      "한티",
      "도곡",
      "매봉",
      "양재",
    ],
  },
  {
    id: "pangyo",
    label: "판교권",
    detail: "판교 · 정자 · 서현",
    available: false,
    stations: ["판교", "정자", "서현", "이매", "야탑", "수내", "미금", "모란", "청계산입구"],
  },
  {
    id: "jongno",
    label: "종로권",
    detail: "종로 · 광화문 · 을지로",
    available: false,
    stations: [
      "종각",
      "종로3가",
      "종로5가",
      "광화문",
      "시청",
      "을지로입구",
      "을지로3가",
      "안국",
      "경복궁",
      "서대문",
      "동대문",
    ],
  },
  {
    id: "yeouido",
    label: "여의도권",
    detail: "여의도 · 영등포",
    available: false,
    stations: [
      "여의도",
      "여의나루",
      "샛강",
      "영등포",
      "영등포구청",
      "영등포시장",
      "당산",
      "신길",
      "대방",
      "노량진",
    ],
  },
] as const;

export type HubId = (typeof HUBS)[number]["id"];

/** 지금 가입을 받는 권역. 하드코딩한 "강남·역삼권" 을 대신한다. */
export const OPEN_HUBS = HUBS.filter((h) => h.available);
/** 허브를 알 수 없을 때의 기본값(가입 첫 화면·표시용 폴백). */
export const PRIMARY_HUB = OPEN_HUBS[0] ?? HUBS[0];
/** 상태 문구용 — 권역이 둘 이상이면 "강남·역삼권 · 판교권" 으로 늘어난다. */
export const COVERAGE_LABEL = OPEN_HUBS.map((h) => h.label).join(" · ");

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
    title: "회사 이메일 인증 · 가까운 거리",
    body: "회사 이메일 주소를 인증하고, 퇴근 후 만나기 좋은 생활권의 사람을 소개합니다.",
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
    /*
      "남기면 다음 소개가 더 정확해집니다" 였다. **지금은 사실이 아니다** —
      feedbacks.result 는 쌓이기만 하고 그 값을 읽는 SQL 이 한 줄도 없다.
      귀속이 붙는 날 이 문장을 되살린다. 그전까지는 지금 참인 것만 말한다.
    */
    body: "약속이 지켜졌는지 확인하는 데 씁니다. 상대에게는 공개되지 않습니다.",
  },
] as const;
