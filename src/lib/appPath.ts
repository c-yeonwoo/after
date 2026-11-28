/**
 * "/schedule?meetingId=…" 같은 앱 안 경로를 라우터가 받는 모양으로 나눈다.
 * 알림 문구(notification-copy.ts)는 경로를 문자열 하나로 들고 있다 — 푸시 데이터에도
 * 그대로 실리기 때문이다.
 */
export function splitAppPath(path: string): { to: string; search: Record<string, string> } {
  const url = new URL(path, "https://app.invalid");
  return { to: url.pathname, search: Object.fromEntries(url.searchParams) };
}

/** Only the membership screens that support resuming an incoming notification. */
export function notificationReturnPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return;
  const [pathname, query] = raw.split("#", 1)[0].split("?");
  const path = pathname.replace(/\/+$/, "");
  const search = new URLSearchParams(query);
  if (["/requests", "/intro", "/chats"].includes(path)) return path;
  if (/^\/chat\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(path)) return path;
  if (path === "/notifications")
    return search.get("from") === "me" ? "/notifications?from=me" : path;
  if (path !== "/schedule" && path !== "/feedback" && path !== "/prefs") return;
  const id = search.get("meetingId");
  return id && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
    ? `${path}?meetingId=${id}`
    : path;
}

// Provider redirects return to a fixed URL. Keep only the validated destination in this tab.
export function saveNotificationReturn(flow: string, path?: string) {
  try {
    const key = `after.notification-return.${flow}`;
    if (path)
      sessionStorage.setItem(key, JSON.stringify({ path, until: Date.now() + 30 * 60_000 }));
    else sessionStorage.removeItem(key);
  } catch {
    /* Login still works when browser storage is unavailable. */
  }
}

export function takeNotificationReturn(flow: string) {
  try {
    const key = `after.notification-return.${flow}`;
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    const entry = raw && JSON.parse(raw);
    if (entry?.until > Date.now())
      return flow === "oauth" && entry.path === "/invite"
        ? "/invite"
        : notificationReturnPath(entry.path);
  } catch {
    /* An absent or stale destination falls back to home. */
  }
}
