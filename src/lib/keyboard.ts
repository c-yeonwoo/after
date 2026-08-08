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
