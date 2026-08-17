/**
 * 브랜드 상수 — 서비스명 변경 시 이 파일만 수정하면 됩니다.
 *
 * 이름은 **이클립스**(Eclipse). 일식은 해와 달이 겹치는 드문 순간이고, 이 서비스가
 * 하는 일이 그것이다 — 한 번에 한 사람만, 오가는 길이 겹치는 사람을 소개한다.
 *
 * ── 왜 애프터선셋에서 바꿨나 ──
 * 이전 이름은 "애프터"와 "선셋" 둘 다 로맨틱한 단어라 겹쳐 읽히면서 감성이 과했다.
 * 이클립스는 한 단어로 끊기고, 은유가 서비스 구조와 정확히 맞고, 입으로 옮기기 쉽다.
 *
 * 대가도 있었다 — `eclipse.kr`·`eclipse.co.kr` 은 2003·2007년부터 개인이 보유 중이라
 * 정확히 같은 도메인을 잡을 수 없었다. 그래서 도메인은 `eclps.kr` 이다. 이름과
 * 도메인의 철자가 어긋나는 것이 이 선택의 유일한 흠이고, 알고 택했다.
 *
 * ── 두 층으로 쓰지 않는다 ──
 * 이전에는 정식 `애프터선셋` / 화면용 `애프터` 로 나눠 썼다. 6음절이 길어서였는데,
 * `이클립스` 는 그럴 이유가 없다. `short` 를 없애고 `name` 하나로 쓴다 — 같은 값을
 * 가진 상수가 둘이면 어느 쪽을 쓸지 매번 판단해야 하고, 그 판단에 근거가 없다.
 *
 * 라틴 표기가 필요한 자리(워드마크·앱 아이콘 옆)에는 `nameEn`.
 */
export const BRAND = {
  /** 서비스명. 사용자에게 보이는 모든 자리에 이걸 쓴다. */
  name: "이클립스",
  nameEn: "Eclipse",
  domain: "eclps.kr",

  tagline: "퇴근하고 만나기 좋은 거리에, 좋은 사람 한 명.",
  /*
    ── 지역은 정체성이 아니다 ──
    강남·역삼권은 **첫 허브**이지 이 서비스의 정의가 아니다. 권역은 늘어날
    예정이고, 브랜드 문구에 지역을 박아 두면 늘어날 때마다 제목·og·메일
    푸터·앱스토어 문구를 전부 따라 고쳐야 한다. 게다가 그때까지는 다른
    권역에서 온 사람이 "여긴 내 동네 서비스가 아니구나" 로 읽는다.

    그래서 **정체성 문구에는 지역을 쓰지 않고**, 지역은 "현재 …에서
    운영합니다" 처럼 **상태**로만 말한다. 그 상태 문구는 아래 COVERAGE_LABEL
    에서 파생되므로 HUBS 의 available 만 바꾸면 화면이 따라온다.
  */
  description:
    "직장 인증을 마친 직장인끼리, 오가는 길이 겹치는 한 사람을 소개받습니다. 저녁 한 끼든 가벼운 한 잔이든, 무엇을 할지는 두 분이 정하세요.",
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
