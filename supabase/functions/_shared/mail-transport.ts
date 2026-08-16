// S9 — 메일 발송 어댑터.
//
// SMTP 가 아니라 HTTP 를 쓴다. 이유:
//   · 운영에서 쓸 발송 서비스(Resend·Postmark·SES 등)는 전부 HTTP API 다.
//   · Edge Runtime 에서 SMTP 는 장수명 소켓·STARTTLS·AUTH 협상까지 직접
//     다뤄야 하고, 실제로 denomailer 로는 "Error while in datamode -
//     connection not recoverable" 이 재현됐다(Mailpit·한글 인코딩 자체는
//     Python smtplib 로 성공하는 것을 확인해 라이브러리 문제로 좁혔다).
//   · Mailpit 도 /api/v1/send 를 제공하므로 로컬에서 같은 코드 경로로
//     실제 발송까지 검증할 수 있다 — 운영과 다른 경로를 테스트하지 않는다.

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export type MailTransport = (mail: Mail) => Promise<void>;

function parseFrom(raw: string): { email: string; name?: string } {
  // "이클립스 <no-reply@eclps.local>" 또는 "no-reply@eclps.local"
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: raw.trim() };
}

/** 로컬 Mailpit. 발송된 메일을 웹 UI/API 로 그대로 확인할 수 있다. */
function mailpitTransport(baseUrl: string, from: string): MailTransport {
  const sender = parseFrom(from);
  return async (mail) => {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: sender.email, Name: sender.name },
        To: [{ Email: mail.to }],
        Subject: mail.subject,
        Text: mail.text,
      }),
    });
    if (!res.ok) throw new Error(`mailpit ${res.status}: ${await res.text()}`);
  };
}

/** 운영. https://resend.com/docs/api-reference/emails/send-email */
function resendTransport(apiKey: string, from: string): MailTransport {
  return async (mail) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
  };
}

/**
 * 환경에서 발송 경로를 고른다.
 *
 * 설정이 없으면 **조용히 성공하지 않는다** — 아무 데도 안 가는데 sent_at 이
 * 찍히면 아웃박스가 거짓말을 하게 된다. 설정 누락은 에러로 드러낸다.
 */
export function transportFromEnv(env: (k: string) => string | undefined): MailTransport {
  // 발신 표시명은 사용자가 아는 이름(이클립스)을 쓴다. 도메인이 eclps.kr
  // 이라 표시명과 도메인이 같은 브랜드로 읽히고, 그게 기업 메일에서 신뢰를
  // 얻는 조건이다 — 표시명과 도메인이 어긋나면 피싱 신호로 읽힌다.
  // .local 기본값은 로컬 전용이다. 운영에서는 MAIL_FROM 을 반드시 넣는다.
  const from = env("MAIL_FROM") ?? "이클립스 <no-reply@eclps.local>";
  const kind = env("MAIL_TRANSPORT") ?? (env("RESEND_API_KEY") ? "resend" : "mailpit");

  if (kind === "resend") {
    const key = env("RESEND_API_KEY");
    if (!key) throw new Error("MAIL_TRANSPORT=resend 인데 RESEND_API_KEY 가 없습니다");
    return resendTransport(key, from);
  }
  if (kind === "mailpit") {
    const url = env("MAILPIT_URL");
    if (!url) throw new Error("MAIL_TRANSPORT=mailpit 인데 MAILPIT_URL 이 없습니다");
    return mailpitTransport(url, from);
  }
  throw new Error(`알 수 없는 MAIL_TRANSPORT: ${kind}`);
}
