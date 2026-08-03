import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/app/PolicyPage";
import { BRAND } from "@/lib/brand";
import { TERMS_SECTIONS } from "@/lib/policy";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `이용약관 — ${BRAND.name}` },
      { name: "description", content: "서비스 내용, 만남 티켓과 환불, 노쇼 처리 기준." },
    ],
  }),
  component: () => <PolicyPage title="이용약관" sections={TERMS_SECTIONS} />,
});
