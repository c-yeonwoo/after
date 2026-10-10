/**
 * "/schedule?meetingId=…" 같은 앱 안 경로를 라우터가 받는 모양으로 나눈다.
 * 알림 문구(notification-copy.ts)는 경로를 문자열 하나로 들고 있다 — 푸시 데이터에도
 * 그대로 실리기 때문이다.
 */
export function splitAppPath(path: string): { to: string; search: Record<string, string> } {
  const url = new URL(path, "https://app.invalid");
  return { to: url.pathname, search: Object.fromEntries(url.searchParams) };
}
