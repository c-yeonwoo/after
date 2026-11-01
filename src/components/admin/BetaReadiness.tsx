import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

type Status = {
  daily_used_krw: number;
  monthly_used_krw: number;
  daily_limit_krw: number;
  monthly_limit_krw: number;
  photo_overdue: number;
  contact_pending: number;
  mfa_required: boolean;
};
export function BetaReadiness() {
  const status = useQuery({
    queryKey: ["admin-beta-readiness"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_beta_readiness");
      if (error) throw error;
      return data as unknown as Status;
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const d = status.data;
  return (
    <section className="rounded-surface bg-muted p-5" aria-label="베타 운영 점검">
      <h2 className="text-base font-semibold">베타 운영 점검</h2>
      {status.isError ? (
        <button
          type="button"
          onClick={() => void status.refetch()}
          className="mt-2 text-sm font-semibold"
        >
          최신 상태를 확인하지 못했어요 · 다시 확인
        </button>
      ) : null}
      {d ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            AI 예산 · 오늘 {d.daily_used_krw.toLocaleString()} /{" "}
            {d.daily_limit_krw.toLocaleString()}원 · 이번 달 {d.monthly_used_krw.toLocaleString()} /{" "}
            {d.monthly_limit_krw.toLocaleString()}원
          </p>
          <p className="text-muted-foreground">
            응답 미확인 요청의 예약액을 포함한 보수적 환산액이에요. 실제 청구액과 다를 수 있어요.
          </p>
          <div className="flex flex-wrap gap-3 font-semibold">
            <Link to="/admin/photos">24시간 넘은 사진 검토 {d.photo_overdue}건</Link>
            <Link to="/admin/meetings">약속 확인 연락 {d.contact_pending}건</Link>
          </div>
          {!d.mfa_required ? (
            <Link to="/admin/settings" className="block font-semibold">
              관리자 MFA 강제가 꺼져 있어요 · 보안 설정 확인
            </Link>
          ) : null}
        </div>
      ) : !status.isError ? (
        <p className="mt-2 text-sm" role="status">
          운영 상태를 확인하고 있어요.
        </p>
      ) : null}
      <p className="mt-3 text-sm text-muted-foreground">
        웹 밖 알림은 아직 개통 전이에요. 약속 확인 작업함을 매일 확인하고, 별도 연락에 동의한
        회원에게만 연락해 주세요. 앱 알림 생성은 실제 전달을 뜻하지 않아요.
      </p>
    </section>
  );
}
