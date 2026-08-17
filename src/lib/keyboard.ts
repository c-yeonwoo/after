import { useEffect, useState, type RefObject } from "react";

import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

/**
 * 키보드 높이를 CSS 변수 `--keyboard-height` 로 흘려보낸다.
 *
 * capacitor.config 에서 Keyboard.resize 를 none 으로 뒀기 때문에 키보드가 떠도
 * 웹뷰는 그대로다 — 레이아웃이 밀려 헤더가 상태바를 침범하는 일이 없는 대신,
 * 키보드에 가려지는 만큼은 앱이 직접 비켜 줘야 한다.
 *
 * 웹(브라우저)에서는 아무 일도 하지 않는다. 변수는 0px 로 남고, 그 자리를 쓰는
 * 쪽은 calc 안에서 그냥 0 이 된다.
 */
export function watchKeyboard(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const set = (px: number) => {
    document.documentElement.style.setProperty("--keyboard-height", `${px}px`);
  };

  const shown = Keyboard.addListener("keyboardWillShow", (info) => set(info.keyboardHeight));
  const hidden = Keyboard.addListener("keyboardWillHide", () => set(0));

  return () => {
    void shown.then((h) => h.remove());
    void hidden.then((h) => h.remove());
    set(0);
  };
}

/**
 * 키보드가 올라오면 **누를 것을 화면 안으로 끌어온다.**
 *
 * MobileFrame 이 `100dvh - var(--keyboard-height)` 로 줄어들면 본문 스크롤러가
 * 그만큼 짧아진다. 그러면 입력칸 아래의 버튼이 접힌 자리 밖으로 밀리는데,
 * 화면에는 그 아래 고정 요소(가입 안내 등)가 그대로 남아 **다 보이는 것처럼
 * 읽힌다.** 실기기에서 실제로 그랬다 — 비밀번호를 다 치고도 누를 버튼이 없었다.
 *
 * 브라우저의 자동 스크롤에 기대지 않는다. ios.scrollEnabled 를 끈 WKWebView 의
 * 중첩 스크롤러에서는 포커스 시 자동 스크롤이 오지 않는다.
 *
 * `deps` 가 바뀔 때도 다시 맞춘다 — 단계가 바뀌면서 버튼 위치가 움직이기 때문.
 */
export function useKeepActionsVisible(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const bring = () => {
      // 키보드 애니메이션이 끝난 뒤라야 최종 높이 기준으로 맞는다.
      window.setTimeout(() => {
        ref.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      }, 320);
    };

    // 웹에서는 focusin 만으로 충분하고, 네이티브에서는 키보드 이벤트가 더 정확하다.
    document.addEventListener("focusin", bring);
    const shown = Capacitor.isNativePlatform()
      ? Keyboard.addListener("keyboardDidShow", bring)
      : null;

    return () => {
      document.removeEventListener("focusin", bring);
      void shown?.then((h) => h.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * 키보드가 떠 있는가.
 *
 * 떠 있는 동안에는 **지금 필요 없는 것을 접는다.** 화면이 키보드 높이만큼
 * 줄어드는데, 그 좁은 자리를 "아직 가입하지 않으셨나요?" 같은 안내가 차지하면
 * 정작 누를 버튼이 밀려난다. 접었다 펴는 편이 스크롤로 찾게 하는 것보다 낫다.
 *
 * 웹에서는 항상 false 다 — 브라우저는 화면을 줄이지 않는다.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const shown = Keyboard.addListener("keyboardWillShow", () => setOpen(true));
    const hidden = Keyboard.addListener("keyboardWillHide", () => setOpen(false));
    return () => {
      void shown.then((h) => h.remove());
      void hidden.then((h) => h.remove());
    };
  }, []);

  return open;
}
