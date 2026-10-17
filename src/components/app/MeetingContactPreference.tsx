import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export function MeetingContactPreference() {
  const id = useId();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc("my_meeting_contact_preference").then((r) => {
      if (!active) return;
      setError(Boolean(r.error));
      if (!r.error) setAllowed(r.data);
    });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <section className="mt-6 border-t border-border pt-5" aria-label="운영팀 약속 확인 연락">
      <h2 className="text-sm font-semibold">운영팀의 약속 확인 연락</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground" id={`${id}-help`}>
        동의하시면 운영팀이 이름·휴대폰 번호를 약속 확인과 일정 조율에만 사용해요. 상대에게 번호를
        공개하거나 마케팅에 사용하지 않아요. 탈퇴·철회 시 이 목적으로 사용을 중단합니다. 동의하지
        않아도 앱 문의로 조율할 수 있어요.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm">
          설정을 불러오지 못했어요.{" "}
          <Button variant="ghost" size="sm" onClick={() => setRetry((v) => v + 1)}>
            다시 확인
          </Button>
        </p>
      ) : null}
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={allowed === true}
          disabled={allowed === null || busy || error}
          aria-describedby={`${id}-help`}
          onChange={(e) => setAllowed(e.target.checked)}
          className="size-5 shrink-0 accent-primary"
        />
        약속 확인을 위한 운영팀 연락에 동의해요 (선택)
      </label>
      <Button
        className="mt-2"
        variant="outline"
        size="sm"
        disabled={allowed === null || busy || error}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await supabase.rpc("set_meeting_contact_preference", {
              p_allowed: allowed!,
              p_version: "meeting-contact-v1",
            });
            if (r.error) throw r.error;
            toast.success(
              allowed ? "운영 연락 동의를 저장했어요." : "운영 연락 동의를 해제했어요.",
            );
          } catch {
            toast.error("설정을 저장하지 못했어요. 다시 시도해 주세요.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "저장 중…" : "운영 연락 설정 저장"}
      </Button>
    </section>
  );
}
