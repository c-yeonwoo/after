/**
 * 데모용 로컬 저장소 — Cloud 연결 전까지 프로필/진행 상태를 브라우저에 보관합니다.
 * Cloud 활성화 후 동일한 인터페이스를 서버 함수로 교체할 예정입니다.
 */
import { useEffect, useState } from "react";

import type { Basics } from "@/components/onboarding/basics";
import type { ProfileDraft } from "@/components/onboarding/profile";

export type MeRecord = {
  gender: "female" | "male";
  hubId: string;
  email: string;
  basics: Basics;
  profile: ProfileDraft;
  intro: string;
  createdAt: string;
};

const KEY = "serendipity:me";
const STATE_KEY = "serendipity:flow";

export type FlowState = {
  /** 현재 소개된 상대 id */
  introId: string | null;
  /** 내가 이 소개에 응답한 결과 */
  myAnswer: "yes" | "pass" | null;
  /** 보유 만남 티켓 (남성) */
  tickets: number;
  /** 만남 티켓 사용 시각 (남성) */
  ticketUsedAt: string | null;
  /** 컨시어지가 상대에게 만남 선호를 물은 시각 */
  prefsAskedAt: string | null;
  /** 만남 선호 답변 (여성이 작성 → 남성에게 전달) */
  prefs: MeetPrefs | null;
  /** 대화 오픈 여부 */
  chatOpen: boolean;
  /** 확정된 만남 일시 (ISO) */
  meetupAt: string | null;
  /** 확정된 장소 id */
  venueId: string | null;
  messages: { id: string; from: "me" | "them"; text: string; at: string }[];
};

export const emptyFlow: FlowState = {
  introId: "hana",
  myAnswer: null,
  tickets: 0,
  ticketUsedAt: null,
  prefsAskedAt: null,
  prefs: null,
  chatOpen: false,
  meetupAt: null,
  venueId: null,
  messages: [],
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as T) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("serendipity:store"));
}

export function saveMe(me: Omit<MeRecord, "createdAt">) {
  write(KEY, { ...me, createdAt: new Date().toISOString() });
}

export function loadMe(): MeRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MeRecord) : null;
  } catch {
    return null;
  }
}

export function saveFlow(next: Partial<FlowState>) {
  write(STATE_KEY, { ...read(STATE_KEY, emptyFlow), ...next });
}

export function resetAll() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(STATE_KEY);
  window.dispatchEvent(new Event("serendipity:store"));
}

/** 하이드레이션 안전: 첫 렌더는 null, 마운트 후 실제 값 */
export function useMe() {
  const [me, setMe] = useState<MeRecord | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setMe(loadMe());
    sync();
    setReady(true);
    window.addEventListener("serendipity:store", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("serendipity:store", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { me, ready };
}

export function useFlow() {
  const [flow, setFlow] = useState<FlowState>(emptyFlow);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setFlow(read(STATE_KEY, emptyFlow));
    sync();
    setReady(true);
    window.addEventListener("serendipity:store", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("serendipity:store", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { flow, ready };
}
