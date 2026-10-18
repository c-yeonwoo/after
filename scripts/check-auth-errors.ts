import assert from "node:assert/strict";
import { authErrorMessage } from "../src/lib/authErrors";

const duplicate = "이미 가입된 계정이 있어요. 기존 계정으로 로그인해 주세요.";
const fallback = "인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
const cases: [unknown, string][] = [
  [{ code: "user_already_exists", message: "{}" }, duplicate],
  [{ code: "email_exists" }, duplicate],
  [Object.assign(new Error("{}"), { code: "user_already_exists" }), duplicate],
  [new Error(' {"code":"email_exists","message":"{}"} '), duplicate],
  [JSON.stringify({ code: "user_already_exists" }), duplicate],
  [new Error("User already registered"), duplicate],
  [{ code: "23505", message: "account already registered" }, duplicate],
  [
    { code: "23505", message: "duplicate key (phone)=(private)" },
    "이미 등록된 정보가 있어요. 기존 계정으로 로그인하거나 고객센터에 문의해 주세요.",
  ],
  [
    { code: "phone_exists" },
    "이미 등록된 정보가 있어요. 기존 계정으로 로그인하거나 고객센터에 문의해 주세요.",
  ],
  [
    { code: "invalid_credentials", message: "Invalid login credentials" },
    "이메일이나 비밀번호를 다시 확인해 주세요. 비밀번호를 잊었다면 코드로 로그인할 수 있어요.",
  ],
  [
    new Error("Token has expired or is invalid"),
    "코드가 맞지 않거나 만료되었습니다. 코드를 다시 받아 주세요.",
  ],
  [
    { code: "otp_expired", message: "{}" },
    "코드가 맞지 않거나 만료되었습니다. 코드를 다시 받아 주세요.",
  ],
  [new Error("signup expired"), "가입 확인 시간이 지났어요. 약관부터 다시 확인해 주세요."],
  [{ code: "over_email_send_rate_limit" }, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."],
  [
    new Error("personal email not allowed"),
    "개인 메일은 사용할 수 없습니다. 회사 이메일로 인증해 주세요.",
  ],
  [
    { code: "email_not_confirmed" },
    "이메일 인증이 완료되지 않았습니다. 메일로 받은 코드를 확인해 주세요.",
  ],
  [
    { code: "weak_password" },
    "비밀번호가 보안 기준에 맞지 않아요. 더 긴 비밀번호로 다시 설정해 주세요.",
  ],
  [
    new TypeError("Failed to fetch"),
    "연결을 확인하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  ],
  [new Error("동의 상태를 확인할 수 없습니다."), "동의 상태를 확인할 수 없습니다."],
];
const cycle: { message?: unknown } = {};
cycle.message = cycle;
for (const input of [
  null,
  undefined,
  "",
  "   ",
  {},
  [],
  0,
  false,
  cycle,
  "{}",
  "[]",
  "[object Object]",
  '{"message":',
  new Error("{}"),
  { message: {} },
  { message: "SQL 가입오류 private@example.com" },
]) {
  cases.push([input, fallback]);
}
for (const [input, expected] of cases) assert.equal(authErrorMessage(input), expected);
console.log(`Auth errors: ${cases.length} duplicate, recovery and safe fallback cases PASS`);
