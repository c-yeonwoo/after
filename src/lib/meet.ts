/** 만남 조율에 쓰이는 선택지 — 데모용 고정 데이터 */

export type MeetPrefs = {
  /** 여성이 고른 만남 가능 날짜 (ISO date, 최대 3개) */
  dates: string[];
  /** 선호 장소 지역 */
  area: string;
  /** 선호 음식 */
  food: string;
  /** 한마디 (선택) */
  note?: string;
};

export const PREF_AREAS = ["역삼", "선릉", "삼성", "강남역", "상관없어요"];
export const PREF_FOODS = ["한식", "이탈리안", "일식", "중식", "가벼운 안주", "상관없어요"];

/** 오늘 이후 평일 저녁 5개 (클라이언트에서만 계산해 하이드레이션 불일치 방지) */
export function upcomingEvenings(count = 5): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    out.push(d.toISOString());
  }
  return out;
}

export function formatEvening(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })} 저녁 7시`;
}

export type Venue = { id: string; name: string; kind: string; area: string; note: string };

export const VENUES: Venue[] = [
  { id: "v1", name: "논현 한상", kind: "한식", area: "역삼", note: "예약 가능 · 도보 5분" },
  { id: "v2", name: "트라토리아 미아", kind: "이탈리안", area: "선릉", note: "예약 가능 · 2인 코너석" },
  { id: "v3", name: "스시 하루", kind: "일식", area: "삼성", note: "예약 가능 · 카운터 2석" },
  { id: "v4", name: "바 온도", kind: "가벼운 안주", area: "강남역", note: "예약 가능 · 조용한 편" },
];

/** 데모: 상대가 보내온 선호 답변 */
export function demoPrefs(): MeetPrefs {
  const dates = upcomingEvenings(5);
  return {
    dates: [dates[1], dates[2], dates[4]],
    area: "선릉",
    food: "이탈리안",
    note: "퇴근이 조금 늦어서 7시 반쯤이면 더 편해요.",
  };
}
