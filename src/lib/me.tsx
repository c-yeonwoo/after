/**
 * 내 프로필 컨텍스트.
 *
 * api.ts 에서 떼어냈다 — 한 파일이 컴포넌트와 함수를 함께 내보내면 Fast Refresh
 * 가 동작하지 않는다(react-refresh/only-export-components).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabase";

import type { Profile } from "./api";

/*
 * 예전에는 useMe() 가 화면마다 **독립 구독**을 걸고 onAuthStateChange 마다
 * 프로필을 재조회했다. 홈 한 번 로드에 REST 23회가 나왔고 그중 profiles 가
 * 7회였다 — 화면에 필요한 프로필은 나와 상대 둘뿐인데(진단 PERF-3).
 * 앱 전체에 구독 하나·조회 하나만 둔다.
 */
type MeState = {
  me: Profile | null;
  ready: boolean;
  /** 서버에서 다시 읽는다. 프로필을 수정한 화면이 부른다. */
  refresh: () => Promise<void>;
  /** 이미 받아 둔 값으로 덮어쓴다 — 방금 저장한 응답이 있으면 왕복이 필요 없다. */
  setMe: (p: Profile | null) => void;
};

const MeContext = createContext<MeState | null>(null);

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setMe(null);
      setReady(true);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();
    setMe(data);
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    // 로그인·로그아웃만 반응한다. TOKEN_REFRESHED 는 프로필과 무관한데
    // 예전에는 그때마다 재조회가 돌았다.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<MeState>(() => ({ me, ready, refresh: load, setMe }), [me, ready, load]);
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

/*
  Provider 와 그 훅은 한 파일에 두는 것이 표준 컨텍스트 패턴이다. 훅만 또 다른
  파일로 빼면 읽는 쪽이 두 파일을 오가야 하므로 규칙을 이 한 줄로만 끈다.
*/
// eslint-disable-next-line react-refresh/only-export-components
export function useMe(): MeState {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe 는 MeProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
