import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type Factor = { id: string; friendly_name?: string };
type Pending = { id: string; qr: string; secret: string };

/** Secrets live only in this component until verified/cancelled. Never logged or persisted. */
export function AdminSecurity() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [selected, setSelected] = useState("");
  const [required, setRequired] = useState<boolean | null>(null);
  const [aal2, setAal2] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = useRef<{ required: boolean | null; id: string }>({
    required: null,
    id: crypto.randomUUID(),
  });
  const load = useCallback(async () => {
    const [list, level, settings] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.from("app_settings").select("admin_mfa_required").single(),
    ]);
    if (list.error || level.error || settings.error) throw Error("security unavailable");
    setFactors(list.data.totp);
    setSelected((id) =>
      list.data.totp.some((f) => f.id === id) ? id : (list.data.totp[0]?.id ?? ""),
    );
    setAal2(level.data.currentLevel === "aal2");
    setRequired(settings.data.admin_mfa_required);
  }, []);
  useEffect(() => {
    void load()
      .catch(() => setError("보안 상태를 불러오지 못했습니다. 다시 확인해 주세요."))
      .finally(() => setLoading(false));
  }, [load]);

  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      setError(
        code === "mfa_totp_enroll_not_enabled" || code === "mfa_totp_verify_not_enabled"
          ? "인증 서비스의 TOTP 등록·확인이 꺼져 있습니다. 프로젝트 소유자가 Supabase 인증 설정을 확인해 주세요."
          : "요청을 마치지 못했습니다. 인증앱 코드와 현재 상태를 다시 확인해 주세요.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="관리자 보안"
      className="mt-7 rounded-surface border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">관리자 보안</h2>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(load)}>
          보안 상태 새로고침
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        인증앱{" "}
        {required === null ? "확인 필요" : factors.length ? `${factors.length}개 등록` : "미등록"} ·
        현재 세션 {aal2 ? "2단계 인증 완료" : "추가 인증 필요"} · 중요 조치 MFA{" "}
        {required === null ? "확인 중" : required ? "필수" : "아직 선택"}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        전체 운영자의 연락처 조회·이용 제한 등 중요 조치에 적용됩니다. 먼저 인증앱을 등록하고, 별도
        안전한 백업이나 예비 인증앱을 확인한 뒤 필수로 켜세요. QR·설정키·인증코드를 채팅이나 운영
        메모에 남기지 마세요.
      </p>
      {pending ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">본인 인증앱으로 QR을 스캔한 뒤 6자리 코드를 입력하세요.</p>
          <img
            src={pending.qr}
            width={220}
            height={220}
            alt="본인 인증앱 등록용 QR. 외부에 공유하지 마세요."
            className="max-w-full rounded-control bg-white p-2"
          />
          <details className="text-xs">
            <summary className="min-h-11 cursor-pointer py-3">QR 대신 설정키 입력</summary>
            <code data-selectable className="block break-all rounded-control bg-muted p-3">
              {pending.secret}
            </code>
          </details>
        </div>
      ) : null}
      {pending || (!aal2 && factors.length > 0) ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const factorId = pending?.id ?? selected;
              if (!factorId || !/^\d{6}$/.test(code)) throw Error("code required");
              const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
              if (result.error) throw result.error;
              setCode("");
              setPending(null);
              await load();
              toast.success("현재 세션의 2단계 인증을 확인했습니다.");
            });
          }}
        >
          {!pending && factors.length > 1 ? (
            <label className="block text-sm">
              인증앱
              <select
                aria-label="사용할 인증앱"
                value={selected}
                disabled={busy}
                onChange={(event) => setSelected(event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-control border border-border bg-background px-3"
              >
                {factors.map((factor, i) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name ?? `인증앱 ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block max-w-xs text-sm">
            인증앱 6자리 코드
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={busy}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy || code.length !== 6}>
              2단계 인증 확인
            </Button>
            {pending ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const result = await supabase.auth.mfa.unenroll({ factorId: pending.id });
                    if (result.error) throw result.error;
                    setPending(null);
                    setCode("");
                    await load();
                  })
                }
              >
                인증앱 등록 취소
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      {!pending ? (
        <Button
          className="mt-4"
          size="sm"
          variant="outline"
          disabled={busy || loading || required === null || (factors.length > 0 && !aal2)}
          onClick={() =>
            void act(async () => {
              // Only incomplete enrollments belonging to this UI are discarded.
              const list = await supabase.auth.mfa.listFactors();
              if (list.error) throw list.error;
              for (const factor of list.data.all.filter(
                (f) =>
                  f.status === "unverified" &&
                  f.factor_type === "totp" &&
                  f.friendly_name?.startsWith("After 운영 "),
              )) {
                const result = await supabase.auth.mfa.unenroll({ factorId: factor.id });
                if (result.error) throw result.error;
              }
              const result = await supabase.auth.mfa.enroll({
                factorType: "totp",
                friendlyName: `After 운영 ${crypto.randomUUID().slice(0, 8)}`,
                issuer: "After 운영",
              });
              if (result.error) throw result.error;
              setPending({
                id: result.data.id,
                qr: result.data.totp.qr_code,
                secret: result.data.totp.secret,
              });
              setCode("");
            })
          }
        >
          {factors.length ? "예비 인증앱 추가" : "인증앱 등록 시작"}
        </Button>
      ) : null}
      {!pending && !loading && required !== null ? (
        <div className="mt-5 border-t border-border pt-4">
          {!required ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={recovery}
                disabled={busy || !aal2}
                onChange={(event) => setRecovery(event.target.checked)}
                className="size-5 shrink-0 accent-selection"
              />
              본인 복구수단을 별도로 확인했어요
            </label>
          ) : null}
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            강제를 켠 뒤에는 로그인할 때 이 화면에서 다시 인증할 수 있어요. 유일한 인증앱을 삭제하지
            마세요. 분실 시 프로젝트 소유자의 본인 확인 후 별도 복구가 필요합니다.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            disabled={busy || !aal2 || (!required && !recovery)}
            onClick={() =>
              void act(async () => {
                const desired = !required;
                if (request.current.required !== desired)
                  request.current = { required: desired, id: crypto.randomUUID() };
                const result = await supabase.rpc("admin_set_mfa_requirement", {
                  p_required: desired,
                  p_expected_required: required,
                  p_recovery_confirmed: recovery,
                  p_request_id: request.current.id,
                });
                if (result.error) {
                  await load();
                  throw result.error;
                }
                request.current = { required: null, id: crypto.randomUUID() };
                setRecovery(false);
                await load();
                toast.success(
                  result.data
                    ? "중요 조치에 2단계 인증을 필수로 적용했습니다."
                    : "중요 조치의 2단계 인증 필수를 해제했습니다.",
                );
              })
            }
          >
            {required ? "MFA 필수 해제" : "중요 조치 MFA 필수로 켜기"}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
