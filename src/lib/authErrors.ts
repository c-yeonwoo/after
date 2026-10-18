const FALLBACK = "인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";

// Only local, deliberately written UI copy may pass through unchanged. Provider
// messages can contain SQL, email addresses or serialized objects, even in Korean.
const LOCAL_MESSAGES = new Set([
  "인증에 실패했습니다.",
  "로그인에 실패했습니다.",
  "카카오 로그인 주소를 받지 못했습니다.",
  "마지막 로그인 수단은 끊을 수 없습니다.",
  "동의 상태를 확인할 수 없습니다.",
  "로컬 개발 환경에서만 사용할 수 있습니다.",
  "로컬 개발 세션을 만들지 못했습니다. 다른 테스트 주소로 다시 시작해 주세요.",
  "이 주소는 이전 로컬 인증 흐름에 남아 있습니다. 다른 테스트 주소를 사용해 주세요.",
]);

/** Normalize Auth, PostgREST and JSON-encoded errors without showing raw payloads. */
export function authErrorMessage(error: unknown): string {
  let value = error;
  let code = "";
  let message = "";
  // Some transports wrap an error object in Error.message or JSON once more.
  // Bounded traversal also makes cyclic/malformed payloads harmless.
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof value === "object" && value !== null) {
      const fields = value as { code?: unknown; message?: unknown };
      if (typeof fields.code === "string" && !code) code = fields.code.toLowerCase();
      value = fields.message;
    }
    if (typeof value !== "string") break;
    message = value.trim();
    if (!message.startsWith("{") && !message.startsWith('"')) break;
    try {
      value = JSON.parse(message);
    } catch {
      break;
    }
  }
  const m = message.toLowerCase();
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    /(?:account|user) already registered|email (?:already (?:exists|in use)|address is already registered)/.test(
      m,
    )
  ) {
    return "이미 가입된 계정이 있어요. 기존 계정으로 로그인해 주세요.";
  }
  if (code === "23505" || code === "phone_exists" || code === "identity_already_exists") {
    return "이미 등록된 정보가 있어요. 기존 계정으로 로그인하거나 고객센터에 문의해 주세요.";
  }
  if (m.includes("personal email")) {
    return "개인 메일은 사용할 수 없습니다. 회사 이메일로 인증해 주세요.";
  }
  if (code === "invalid_credentials" || m.includes("invalid login credentials")) {
    return "이메일이나 비밀번호를 다시 확인해 주세요. 비밀번호를 잊었다면 코드로 로그인할 수 있어요.";
  }
  if (code.includes("rate_limit") || /rate limit|too many/.test(m)) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (m === "signup expired" || m === "verification expired") {
    return "가입 확인 시간이 지났어요. 약관부터 다시 확인해 주세요.";
  }
  if (code === "otp_expired" || /(?:token|code).*(?:expired|invalid)|wrong code/.test(m)) {
    return "코드가 맞지 않거나 만료되었습니다. 코드를 다시 받아 주세요.";
  }
  if (code === "email_not_confirmed" || /email.*not.*confirm/.test(m)) {
    return "이메일 인증이 완료되지 않았습니다. 메일로 받은 코드를 확인해 주세요.";
  }
  if (code === "weak_password" || /password.*(?:at least|too short|weak)/.test(m)) {
    return "비밀번호가 보안 기준에 맞지 않아요. 더 긴 비밀번호로 다시 설정해 주세요.";
  }
  if (code === "same_password") {
    return "현재 비밀번호와 다른 비밀번호를 입력해 주세요.";
  }
  if (/failed to fetch|fetch failed|network|load failed/.test(m)) {
    return "연결을 확인하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return LOCAL_MESSAGES.has(message) ? message : FALLBACK;
}
