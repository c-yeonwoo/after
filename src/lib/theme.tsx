/**
 * 테마 — 시스템 설정을 따르고, 사용자가 고르면 그 선택을 기억한다.
 *
 * `.dark` 토큰은 예전부터 styles.css 에 있었지만 그것을 켜는 코드가 없어
 * 도달 불가였다(진단 Later). 게다가 값이 shadcn 기본값(청회색)이라 켜는 순간
 * 코럴이 사라진 다른 제품이 됐다 — 팔레트를 브랜드 hue 로 다시 쓴 뒤에야
 * 켤 수 있는 상태가 됐다.
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

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "after.theme";

/**
 * 첫 페인트 전에 실행되는 스크립트.
 *
 * React 가 붙기를 기다리면 라이트로 한 번 그려진 뒤 다크로 바뀐다(FOUC).
 * body 보다 앞, head 안에서 동기로 돌려야 한다. 그래서 이것만 인라인이다.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.classList.toggle("dark",d);
}catch(e){}})();`;

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  return dark;
}

type ThemeState = {
  choice: ThemeChoice;
  /** 지금 실제로 어두운지. choice 가 "system" 이면 OS 설정에 따라 달라진다. */
  isDark: boolean;
  setChoice: (c: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 서버 렌더에서는 알 수 없다. 인라인 스크립트가 이미 클래스를 붙였으므로
  // 화면은 맞고, 이 상태는 마운트 후 실제 값으로 맞춘다.
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial: ThemeChoice = stored === "dark" || stored === "light" ? stored : "system";
    setChoiceState(initial);
    setIsDark(apply(initial));
  }, []);

  // "시스템"을 고른 사람은 OS 설정이 바뀔 때 따라가야 한다.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setIsDark(apply("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    // "시스템"은 저장하지 않는다 — 값이 없는 상태가 곧 시스템 추종이고,
    // 인라인 스크립트도 같은 규칙으로 읽는다.
    if (c === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, c);
    setIsDark(apply(c));
  }, []);

  const value = useMemo<ThemeState>(
    () => ({ choice, isDark, setChoice }),
    [choice, isDark, setChoice],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 는 ThemeProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}
