import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestNotificationEmail, verifyNotificationEmail } from "@/lib/api";
import { useMe } from "@/lib/me";

/**
 * 알림 받을 개인 메일 — 주소 입력 → 6자리 코드 확인.
 *
 * 환경설정과 가입 마지막 단계가 같이 쓴다. 예전에는 환경설정 안에만 있어서, 이걸
 * 찾아 들어가지 않은 회원은 소개가 도착해도 메일을 한 통도 받지 못했다
 * (send-notifications 가 확인된 알림 메일이 없으면 조용히 건너뛴다).
 */
export function NotificationEmailForm({ onVerified }: { onVerified?: () => void }) {
  const { me, refresh } = useMe();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(me?.notification_email ?? "");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    if (me?.notification_email && !codeSent) setEmail(me.notification_email);
  }, [me?.notification_email, codeSent]);

  if (!me) return null;

  return (
    <div className="rounded-surface border border-border bg-card p-5">
      <label htmlFor="notification-email" className="text-sm font-medium">
        알림 받을 이메일
      </label>
      {me.notification_email_verified_at ? (
        <p className="mt-1 text-xs text-muted-foreground">{me.notification_email} · 확인됨</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          소개와 약속 진행 알림을 받을 주소입니다.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Input
          id="notification-email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={busy || !email.includes("@")}
          onClick={async () => {
            setBusy(true);
            try {
              await requestNotificationEmail(email);
              setCodeSent(true);
              setCode("");
              toast.success("확인 코드를 보냈습니다.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "코드를 보내지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {me.notification_email_verified_at ? "변경" : "코드 받기"}
        </Button>
      </div>

      {codeSent ? (
        <div className="mt-3 flex gap-2">
          <Input
            aria-label="이메일 확인 코드"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6자리 코드"
            value={code}
            disabled={busy}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <Button
            type="button"
            className="shrink-0"
            disabled={busy || code.length !== 6}
            onClick={async () => {
              setBusy(true);
              try {
                await verifyNotificationEmail(code);
                await refresh();
                setCodeSent(false);
                setCode("");
                toast.success("알림 받을 이메일을 확인했습니다.");
                onVerified?.();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "코드를 확인하지 못했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          >
            확인
          </Button>
        </div>
      ) : null}
    </div>
  );
}
