import { createFileRoute, Link } from "@tanstack/react-router";

import { AppScreen } from "@/components/app/AppScreen";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/payment/fail")({
  validateSearch: (q: Record<string, unknown>) => ({
    code: typeof q.code === "string" ? q.code : "",
  }),
  head: () => ({ meta: [{ title: `결제 중단 — ${BRAND.name}` }] }),
  component: PaymentFailPage,
});

function PaymentFailPage() {
  const { code } = Route.useSearch();
  return (
    <AppScreen title="결제 중단" hideTabs back="/store">
      <div className="mt-16 text-center">
        <h1 className="headline text-xl">결제를 완료하지 못했습니다</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {code === "USER_CANCEL"
            ? "결제가 취소되었습니다."
            : "카드 정보와 결제수단을 확인한 뒤 다시 시도해 주세요."}
        </p>
        <Link to="/store" className="mt-6 inline-block text-sm font-semibold underline">
          티켓 화면으로
        </Link>
      </div>
    </AppScreen>
  );
}
