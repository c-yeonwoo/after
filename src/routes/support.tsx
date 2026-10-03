import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Mail } from "lucide-react";

import { InfoSection, PublicInfoPage } from "@/components/app/PublicInfoPage";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/policy";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: `고객 지원 — ${BRAND.name}` },
      {
        name: "description",
        content: "이클립스 이용 문의, 신고와 차단, 계정 삭제 방법을 안내합니다.",
      },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const subject = encodeURIComponent("[이클립스 문의]");
  return (
    <PublicInfoPage title="어떻게 도와드릴까요?">
      <InfoSection title="이메일 문의">
        <p>가입·프로필·소개·일정·신고와 관련된 문제를 보내주세요.</p>
        <a
          href={`mailto:${BUSINESS.contactEmail}?subject=${subject}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 font-semibold text-primary-foreground"
        >
          <Mail className="size-4" aria-hidden="true" />
          {BUSINESS.contactEmail}
        </a>
        <p>영업일 기준 3일 안에 답변드리며, 신고는 접수 후 24시간 안에 먼저 확인합니다.</p>
      </InfoSection>

      <InfoSection title="신고와 차단">
        <p>
          소개 또는 대화 화면 오른쪽 위 ⋯ 메뉴에서 바로 신고하거나 차단할 수 있습니다. 차단한 상대는
          다시 소개되지 않습니다.
        </p>
        <p>
          신체 위협이나 스토킹처럼 즉시 도움이 필요한 상황은 앱의 답변을 기다리지 말고 112에 신고해
          주세요.
        </p>
      </InfoSection>

      <InfoSection title="계정과 개인정보">
        <div className="grid gap-2">
          <Link
            to="/delete-account"
            className="flex min-h-12 items-center justify-between rounded-control border border-border px-4 font-medium text-foreground"
          >
            계정 삭제 방법
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
          <Link
            to="/privacy"
            className="flex min-h-12 items-center justify-between rounded-control border border-border px-4 font-medium text-foreground"
          >
            개인정보 처리방침
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
          <Link
            to="/terms"
            className="flex min-h-12 items-center justify-between rounded-control border border-border px-4 font-medium text-foreground"
          >
            이용약관
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </InfoSection>
    </PublicInfoPage>
  );
}
