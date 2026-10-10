import { PushNotifications } from "@capacitor/push-notifications";

import { isNative } from "@/lib/native";
import { supabase } from "@/lib/supabase";

/**
 * 앱 푸시(s55, 2026-10-10). 웹에서는 전부 no-op 이다 — 웹은 종 아이콘 목록으로만 본다.
 *
 * 흐름: 권한 요청 → register() → iOS 가 토큰을 주면('registration') 서버에 저장한다.
 * 토큰은 앱을 지우거나 OS 가 바꿀 수 있어서 **실행할 때마다** 다시 등록한다.
 */

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

const TOKEN_KEY = "after.push-token";

function rememberToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 저장소를 못 쓰면 로그아웃 때 토큰을 못 지울 뿐이다. 다음 로그인 계정으로 옮겨 간다.
  }
}

export async function pushPermission(): Promise<PushPermission> {
  if (!isNative) return "unsupported";
  const { receive } = await PushNotifications.checkPermissions();
  return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
}

/** 권한을 묻고(처음 한 번만 시스템 창이 뜬다) 허용되면 등록한다. */
export async function enablePush(): Promise<PushPermission> {
  if (!isNative) return "unsupported";
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";
  await PushNotifications.register();
  return "granted";
}

/**
 * 로그인한 동안 붙여 둔다. 돌려주는 함수로 뗀다.
 * onOpen 은 알림을 눌러 앱이 열렸을 때 갈 경로를 받는다.
 */
export function watchPush(onOpen: (path: string) => void): () => void {
  if (!isNative) return () => undefined;

  const subs = [
    PushNotifications.addListener("registration", async ({ value }) => {
      rememberToken(value);
      await supabase.rpc("register_device_token", { p_token: value });
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = (notification.data as { path?: unknown } | undefined)?.path;
      // 서버가 정한 앱 안 경로만 따른다. 외부 주소로 나가는 일은 없다.
      if (typeof path === "string" && path.startsWith("/")) onOpen(path);
    }),
  ];

  // 이미 허용한 사람은 묻지 않고 다시 등록한다(토큰 갱신).
  void pushPermission().then((p) => {
    if (p === "granted") void PushNotifications.register();
  });

  return () => {
    for (const s of subs) void s.then((h) => h.remove());
  };
}

/** 로그아웃 직전에 부른다. 다음에 이 기기를 쓰는 사람에게 내 알림이 가지 않게. */
export async function forgetPushToken(): Promise<void> {
  if (!isNative) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  if (token) await supabase.rpc("unregister_device_token", { p_token: token });
  rememberToken(null);
}
