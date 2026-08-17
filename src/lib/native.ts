import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

import { supabase } from "@/lib/supabase";

/**
 * 네이티브 껍데기와의 접점.
 *
 * 웹에서는 전부 조용한 no-op 이다 — 호출부에서 `if (native)` 를 매번 쓰지 않도록,
 * 분기를 여기 한 곳에 가둔다.
 */
export const isNative = Capacitor.isNativePlatform();

/**
 * OAuth 콜백이 돌아오는 주소.
 *
 * appId 와 같은 스킴을 쓴다(`kr.eclps.app`). iOS 는 Info.plist 의
 * CFBundleURLSchemes 에 등록된 스킴만 앱으로 전달하므로 **둘이 어긋나면 조용히
 * Safari 에 머문다** — 증상이 "로그인 눌렀는데 아무 일도 안 남" 이라 원인을
 * 찾기 어렵다. 바꿀 일이 생기면 Info.plist·Supabase 리다이렉트 허용목록까지
 * 세 곳을 함께 고친다.
 */
export const NATIVE_REDIRECT = "kr.eclps.app://auth/callback";

/** 상태바를 자두 밤에 맞춘다. 밝은 글자 = Style.Dark(어두운 배경용). */
export async function applyStatusBar(dark: boolean): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    // 상태바를 못 바꾼다고 앱이 멈출 이유는 없다.
  }
}

/**
 * 인가 URL 을 **웹뷰 밖**에서 연다.
 *
 * 앱 웹뷰에서 그대로 이동하면 두 가지가 깨진다 — 제공자가 임베디드 웹뷰를
 * 차단하거나, 성공해도 세션이 앱이 아니라 그 웹뷰 안에 갇힌다.
 * SFSafariViewController 는 Safari 와 쿠키를 공유해서, 카카오에 이미 로그인돼
 * 있으면 아이디를 다시 칠 필요도 없다.
 */
export async function openAuthUrl(url: string): Promise<void> {
  if (!isNative) {
    window.location.href = url;
    return;
  }
  await Browser.open({ url });
}

/** 딥링크로 돌아오면 브라우저 시트는 앱이 닫아 줘야 한다. */
async function closeAuthBrowser(): Promise<void> {
  if (!isNative) return;
  try {
    await Browser.close();
  } catch {
    // 이미 닫혔으면 그만이다.
  }
}

/**
 * URL 의 `?code=` 를 세션으로 바꾼다. 교환했으면 true.
 *
 * 웹(리다이렉트로 돌아온 주소)과 네이티브(딥링크) 양쪽이 같은 함수를 쓴다 —
 * 그래야 로그인 뒤 판정이 경로마다 갈라지지 않는다.
 */
export async function consumeAuthCode(href: string): Promise<boolean> {
  // 커스텀 스킴(kr.eclps.app://…)은 URL 파서가 다루기 껄끄러워 쿼리만 떼어 쓴다.
  const query = href.split("?")[1];
  if (!query) return false;
  const params = new URLSearchParams(query.split("#")[0]);

  const failure = params.get("error_description") ?? params.get("error");
  if (failure) throw new Error(failure);

  const code = params.get("code");
  if (!code) return false;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}

/**
 * 스플래시를 걷는다. capacitor.config 에서 자동 숨김을 껐으므로 앱이 직접 부른다.
 *
 * 실패해도 조용히 넘어간다 — 여기서 던지면 첫 렌더가 통째로 막히는데, 스플래시가
 * 안 걷히는 것보다 나쁜 결과다.
 */
export async function hideSplash(): Promise<void> {
  if (!isNative) return;
  try {
    await SplashScreen.hide();
  } catch {
    // 이미 걷혔거나 플러그인이 없는 경우.
  }
}

/**
 * 딥링크로 돌아온 OAuth 결과를 세션으로 바꾼다.
 *
 * 앱이 **꺼져 있다가** 링크로 깨어난 경우까지 잡아야 해서 `getLaunchUrl()` 도
 * 함께 본다 — 리스너만 달면 콜드 스타트에서 이벤트를 놓친다.
 */
export function watchAuthDeepLinks(onSession: () => void): () => void {
  if (!isNative) return () => {};

  const handle = async (rawUrl: string) => {
    if (!rawUrl.startsWith("kr.eclps.app://")) return;
    await closeAuthBrowser();
    if (await consumeAuthCode(rawUrl)) onSession();
  };

  const sub = App.addListener("appUrlOpen", (e: URLOpenListenerEvent) => {
    void handle(e.url);
  });
  void App.getLaunchUrl().then((r) => {
    if (r?.url) void handle(r.url);
  });

  return () => void sub.then((s) => s.remove());
}

/**
 * 촉각 피드백.
 *
 * 네이티브 앱과 웹의 차이를 사람이 가장 먼저 느끼는 지점이 여기다. 다만
 * **아무 탭에나 붙이지 않는다** — 상시 진동은 금방 성가셔진다. 되돌릴 수 없는
 * 행동(소개 열기·요청 보내기)과 결과 통지(성공·실패)에만 쓴다.
 */
export const haptics = {
  /** 가벼운 선택 — 칩·토글 */
  select() {
    if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  /** 무게 있는 확정 — 티켓 사용, 요청 전송 */
  commit() {
    if (isNative) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  success() {
    if (isNative) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  warn() {
    if (isNative) void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  },
};
