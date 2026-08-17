/** 만남 조율에 쓰이는 선택지 */
import { HUBS, PRIMARY_HUB } from "@/lib/brand";

export type MeetPrefs = {
  /** 가능한 저녁 (ISO datetime) */
  dates: string[];
  /** 이동이 편한 역. 여러 개 고를 수 있고, 비워도 된다. */
  stations: string[];
  /** "어디든 괜찮아요" — 역 선택과 **함께** 켤 수 있다(배타 아님). */
  anywhere: boolean;
  /** 한마디 (선택) */
  note?: string;
};

/**
 * 역 검색 후보 — **사용자의 권역 안에서만** 찾는다.
 *
 * 목록 자체는 `HUBS[].stations` 가 갖는다(brand.ts). 예전에는 여기 강남권 역만
 * 담긴 전역 배열이 있었는데, 그러면 판교 사용자가 생기는 순간 "역 이름 검색"에
 * 강남 역만 나온다. 권역을 여는 스위치와 그 권역의 역이 같은 자리에 있어야
 * 그 사고가 안 난다.
 *
 * hubId 를 모르면(구 데이터·로딩 중) 첫 열린 권역으로 떨어진다. 빈 목록을 주면
 * 검색이 조용히 아무것도 안 찾는 화면이 되는데, 그건 고장과 구분이 안 된다.
 */
/* hubId 는 DB 컬럼(text)에서 그대로 온다 — HubId 로 좁히면 호출부마다 캐스팅이 붙는다. */
export function stationsFor(hubId: string | null | undefined): readonly string[] {
  return (HUBS.find((h) => h.id === hubId) ?? PRIMARY_HUB).stations;
}

export function searchStations(
  query: string,
  exclude: string[] = [],
  hubId?: string | null,
): string[] {
  const q = query.trim();
  if (!q) return [];
  return stationsFor(hubId)
    .filter((s) => s.includes(q) && !exclude.includes(s))
    .slice(0, 6);
}

/** 요약 문구 — 상대(남성)에게 보여줄 때 쓴다. */
export function describePrefs(p: {
  stations?: string[];
  anywhere?: boolean;
  note?: string | null;
}) {
  const parts: string[] = [];
  if (p.stations?.length) parts.push(p.stations.map((s) => `${s}역`).join(" · "));
  if (p.anywhere) parts.push(parts.length ? "그 외에도 괜찮아요" : "어디든 괜찮아요");
  return parts.join(" · ");
}

export type CalendarDay = {
  /** 로컬 기준 YYYY-MM-DD. UTC 로 밀리는 toISOString() 을 쓰면 안 된다. */
  key: string;
  month: number;
  day: number;
  weekday: number;
  /** 그 달의 1일 — 그리드에서 달이 바뀌는 지점을 표시하는 데 쓴다. */
  firstOfMonth: boolean;
  selectable: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 로컬 날짜 키. `new Date().toISOString().slice(0,10)` 은 KST 새벽에 하루가 밀린다. */
export function dayKeyOf(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 오늘이 속한 주부터 `weeks` 주치 달력 (일요일 시작).
 *
 * 요일을 미리 걸러내지 않는다 — 예전에는 "평일 저녁 5개"를 앱이 골라서 보여줬는데,
 * 토요일 낮이 편한 사람에게는 고를 선택지 자체가 없었다. 지난 날짜와 오늘만 막는다
 * (당일 약속은 조율할 시간이 없다).
 *
 * 하이드레이션 주의: `new Date()` 를 쓰므로 클라이언트에서만 호출해야 한다.
 */
export function calendarDays(weeks = 3): CalendarDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay());

  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      key: dayKeyOf(d),
      month: d.getMonth() + 1,
      day: d.getDate(),
      weekday: d.getDay(),
      firstOfMonth: d.getDate() === 1,
      selectable: d.getTime() > today.getTime(),
    };
  });
}

export type TimeOption = { value: string; label: string };

/** 평일 — 퇴근 후를 전제한다. 라벨에 "저녁"을 안 붙여도 이 시간대에선 헷갈리지 않는다. */
export const WEEKDAY_TIMES: TimeOption[] = [
  { value: "18:30", label: "6시 반" },
  { value: "19:00", label: "7시" },
  { value: "19:30", label: "7시 반" },
  { value: "20:00", label: "8시" },
];

/**
 * 주말 — 퇴근 시각에 묶일 이유가 없다.
 *
 * 토·일을 고를 수 있게 해 놓고 저녁 시간대만 주면 "퇴근하고 만난다"는 평일 전제가
 * 그대로 남는다. 낮·오후가 섞이므로 라벨에 때를 명시한다.
 */
export const WEEKEND_TIMES: TimeOption[] = [
  { value: "12:00", label: "낮 12시" },
  { value: "15:00", label: "오후 3시" },
  { value: "18:00", label: "오후 6시" },
  { value: "19:00", label: "저녁 7시" },
];

/** 두 목록 모두에 있는 값이라 어느 쪽 기본값으로도 안전하다. */
export const DEFAULT_MEET_TIME = "19:00";

export function isWeekendKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return w === 0 || w === 6;
}

export function timesFor(key: string) {
  return isWeekendKey(key) ? WEEKEND_TIMES : WEEKDAY_TIMES;
}

/** "8월 5일 (수)" — 시각을 빼고 날짜만. 날짜별로 시각을 고르는 화면에서 쓴다. */
export function formatDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** 날짜 키(YYYY-MM-DD) + 시각(HH:mm) → 저장용 ISO */
export function meetingIso(key: string, time: string) {
  const [y, m, d] = key.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/**
 * "8월 5일 (화) 저녁 7시" · "8월 8일 (토) 낮 12시"
 *
 * 때(오전·낮·오후·저녁)와 시각을 모두 ISO 에서 읽는다. 예전에는 "저녁 7시"를
 * 문자열에 박아 뒀는데, 주말 낮 약속이 생기면 사실과 다른 시각을 보여주게 된다.
 */
export function formatMeetTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const h = d.getHours();
  const half = d.getMinutes() === 30 ? " 반" : "";
  const period = h >= 18 ? "저녁" : h >= 13 ? "오후" : h >= 11 ? "낮" : "오전";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${date} ${period} ${hour}시${half}`;
}
