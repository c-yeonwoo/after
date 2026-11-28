const KEY = "after.wave-one.invite";
const CODE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function waveInviteCode(fragment = "") {
  const value = fragment ? fragment.slice(1) : sessionStorage.getItem(KEY);
  return value && CODE.test(value) ? value : null;
}

export function rememberWaveInvite(code: string) {
  sessionStorage.setItem(KEY, code);
}

export function forgetWaveInvite() {
  sessionStorage.removeItem(KEY);
}

export function waveInviteUrl(code: string) {
  return new URL("/invite#" + code, window.location.origin).href;
}
