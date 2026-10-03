import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { InfoSection, PublicInfoPage } from "@/components/app/PublicInfoPage";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/policy";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: `계정 삭제 안내 — ${BRAND.name}` },
      {
        name: "description",
        content: "이클립스 앱 안에서 계정을 삭제하는 방법과 삭제되는 데이터를 안내합니다.",
      },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const subject = encodeURIComponent("[이클립스 계정 삭제 요청]");
  return (
    <PublicInfoPage title="계정 삭제 안내">
      <InfoSection title="앱에서 바로 삭제하기">
        <ol className="list-decimal space-y-2 pl-5">
          <li>가입한 이메일과 비밀번호로 로그인합니다.</li>
          <li>아래 탭에서 나를 누르고 환경설정으로 이동합니다.</li>
          <li>화면 맨 아래 탈퇴하기를 누른 뒤 한 번 더 확인합니다.</li>
        </ol>
        <Link
          to="/login"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-4 font-semibold text-primary-foreground"
        >
          로그인해서 삭제하기
        </Link>
      </InfoSection>

      <InfoSection title="로그인할 수 없는 경우">
        <p>
          가입한 회사 이메일 주소와 함께 삭제 요청을 보내주세요. 본인 확인을 위해 해당 주소로 확인
          메일을 드릴 수 있습니다.
        </p>
        <a
          href={`mailto:${BUSINESS.contactEmail}?subject=${subject}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-border px-4 font-semibold text-foreground"
        >
          <Mail className="size-4" aria-hidden="true" />
          이메일로 삭제 요청
        </a>
      </InfoSection>

      <InfoSection title="삭제되는 정보">
        <p>탈퇴가 완료되면 프로필 신원 정보와 사진, 직접 작성한 대화·피드백·평가를 삭제합니다.</p>
        <p>진행 중인 약속은 취소되고 상대가 사용한 티켓은 돌아갑니다.</p>
      </InfoSection>

      <InfoSection title="법령과 안전을 위해 남는 정보">
        <p>
          관계 법령상 보존 의무가 있는 거래 기록, 아직 처리되지 않은 신고 근거, 재소개 방지를 위한
          비식별 차단 기록은 정해진 목적과 기간 동안만 보관합니다.
        </p>
        <p>
          자세한 내용은{" "}
          <Link to="/privacy" className="font-medium text-foreground underline">
            개인정보 처리방침
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </InfoSection>
    </PublicInfoPage>
  );
}
