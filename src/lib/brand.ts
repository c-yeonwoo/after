/** Customer-facing identity. Technical identifiers and the current domain stay separate. */
export const BRAND = {
  name: "애프터",
  nameEn: "after",
  domain: "aftersunset.kr",

  tagline: "하루 끝에, 설레는 시작.",
  description: "나를 알아가는 개인 소개 매니저. 잘 맞는 사람을 소개하고, 만날 약속까지 함께합니다.",
} as const;

/** 만남 선호 지역과 역 검색 목록. 가입 자격이나 고정 매칭 구역이 아니다.
 * DB meeting_area_catalog()와 같은 ID를 사용한다. 지역 선택이 겹치는 회원을
 * 소개하되, 신규 모집은 운영 가능한 범위에 집중한다.
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
    available: true,
    stations: ["판교", "정자", "서현", "이매", "야탑", "수내", "미금", "모란", "청계산입구"],
  },
  {
    id: "jongno",
    label: "종로권",
    detail: "종로 · 광화문 · 을지로",
    available: true,
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
    available: true,
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
  {
    id: "seoul",
    label: "서울 그 외 지역",
    detail: "마포 · 성수 · 잠실 등",
    available: true,
    stations: ["홍대입구", "합정", "성수", "건대입구", "잠실", "왕십리", "서울역"],
  },
  {
    id: "gyeonggi",
    label: "경기 그 외 지역",
    detail: "수원 · 안양 · 고양 등",
    available: true,
    stations: ["수원", "광교", "범계", "평촌", "일산", "화정", "구리", "다산"],
  },
  {
    id: "incheon",
    label: "인천",
    detail: "인천 · 송도",
    available: true,
    stations: ["부평", "인천시청", "송도달빛축제공원"],
  },
  { id: "busan", label: "부산", detail: "", available: true, stations: ["서면", "해운대", "광안"] },
  { id: "daegu", label: "대구", detail: "", available: true, stations: ["반월당", "동대구"] },
  { id: "daejeon", label: "대전·세종", detail: "", available: true, stations: ["대전", "시청"] },
  {
    id: "gwangju",
    label: "광주·전남",
    detail: "",
    available: true,
    stations: ["상무", "광주송정"],
  },
  { id: "ulsan", label: "울산·경남", detail: "", available: true, stations: [] },
  { id: "gyeongbuk", label: "경북", detail: "", available: true, stations: [] },
  { id: "gangwon", label: "강원", detail: "", available: true, stations: [] },
  { id: "chungcheong", label: "충북·충남", detail: "", available: true, stations: [] },
  { id: "jeonbuk", label: "전북", detail: "", available: true, stations: [] },
  { id: "jeju", label: "제주", detail: "", available: true, stations: [] },
] as const;

export type HubId = (typeof HUBS)[number]["id"];

/** 만남 장소를 고르는 지역 목록. 가입 자격이나 직장 소재지가 아니다. */
export const OPEN_HUBS = HUBS.filter((h) => h.available);

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

/**
 * 기존 회사 이메일 확인 이력을 분류할 때 쓰는 개인 도메인 목록.
 * 가입·소개 자격을 차단하지 않으며 재직 증명을 뜻하지 않는다.
 */
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
    title: "나를 알아가는 매니저",
    body: "나의 이야기와 만남 선호를 바탕으로, 잘 맞을 만한 사람을 함께 찾아요.",
  },
  {
    id: "profile",
    // PRD 비목표: "AI" 표기를 쓰지 않는다 (F2 — 표기는 "인터뷰")
    title: "인터뷰 프로필",
    body: "사진과 짧은 답변으로, 말투가 드러나는 소개글을 함께 만듭니다.",
  },
  {
    id: "match",
    title: "매칭 주선",
    body: "훑어보는 피드는 없습니다. 서로 맞을 만한 한 사람씩만 순서대로 소개합니다.",
  },
  {
    id: "chat",
    title: "채팅 오픈",
    body: "약속이 확정되면 대화가 열립니다. 일정과 장소를 편하게 확인해요.",
  },
  {
    id: "meet",
    // PRD F5·비목표: "만남 보장" 같은 절대어를 쓰지 않고 환불 규칙을 명시한다
    title: "실제로 만나는 데까지",
    body: "약속 조율을 돕습니다. 상대가 24시간 안에 응답하지 않으면 사용한 티켓이 돌아옵니다.",
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
