import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { myPolicyStatus, recordConsent, type MyPolicyStatus } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";
import { POLICY_VERSION } from "@/lib/policy";

export const Route = createFileRoute("/consent")({
  head: () => ({ meta: [{ title: `약관 동의 — ${BRAND.name}` }] }),
  component: ConsentPage,
});

function ConsentPage() {
  const navigate = useNavigate();
  const { me, ready, refresh } = useMe();
  const [status, setStatus] = useState<MyPolicyStatus | null>(null);
  const [error, setError] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login" });
  }, [ready, me, navigate]);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    void myPolicyStatus()
      .then((value) => {
        if (alive) {
          setStatus(value);
          setError(false);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [me]);

  async function submit() {
    if (!terms || !privacy || !status || status.signup_version !== POLICY_VERSION) return;
    setBusy(true);
    try {
      await recordConsent();
      await refresh();
      toast.success("동의를 기록했습니다.");
      void navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "동의를 기록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title="약관 확인" back="/home">
      <div className="mt-8">
        <p className="text-xs font-medium text-muted-foreground">서비스 이용 전</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">바뀐 내용을 확인해 주세요.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          새 소개와 구매를 계속하려면 현재 이용약관과 개인정보 처리방침에 동의해야 합니다. 진행 중인
          약속, 문의, 탈퇴는 계속 이용할 수 있어요.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-7 rounded-surface border border-destructive/30 p-4 text-sm">
          동의 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
      {!status && !error ? (
        <p className="mt-7 text-sm text-muted-foreground">불러오는 중…</p>
      ) : null}
      {status && status.signup_version !== POLICY_VERSION ? (
        <p role="alert" className="mt-7 rounded-surface border border-destructive/30 p-4 text-sm">
          정책 버전이 달라 동의를 받을 수 없습니다. 앱을 새로고침하거나 업데이트해 주세요.
        </p>
      ) : null}
      {status && status.signup_version === POLICY_VERSION && !status.reconsent_required ? (
        <div className="mt-7 rounded-surface border border-border bg-card p-5 text-sm">
          현재 필요한 추가 동의가 없습니다.{" "}
          <Link to="/home" className="underline">
            홈으로 돌아가기
          </Link>
        </div>
      ) : null}
      {status && status.signup_version === POLICY_VERSION && status.reconsent_required ? (
        <section className="mt-7 space-y-3">
          <p className="text-xs text-muted-foreground">적용 버전 {status.signup_version}</p>
          <label className="flex min-h-16 items-center gap-3 rounded-surface border border-border bg-card px-4">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="size-5 accent-primary"
            />
            <span className="flex-1 text-sm">이용약관에 동의합니다.</span>
            <Link to="/terms" className="text-xs underline">
              전문
            </Link>
          </label>
          <label className="flex min-h-16 items-center gap-3 rounded-surface border border-border bg-card px-4">
            <input
              type="checkbox"
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              className="size-5 accent-primary"
            />
            <span className="flex-1 text-sm">개인정보 수집·이용에 동의합니다.</span>
            <Link to="/privacy" className="text-xs underline">
              전문
            </Link>
          </label>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!terms || !privacy || busy}
            className="mt-3 min-h-12 w-full rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            동의하고 계속하기
          </button>
          <p className="text-center text-xs text-muted-foreground">
            동의하지 않아도 기존 약속 확인과 문의, 탈퇴는 가능합니다.
          </p>
        </section>
      ) : null}
    </AppScreen>
  );
}
