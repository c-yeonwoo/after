import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/app/PolicyPage";
import { BRAND } from "@/lib/brand";
import { PRIVACY_SECTIONS } from "@/lib/policy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `개인정보 처리방침 — ${BRAND.short}` },
      { name: "description", content: "수집 항목, 이용 목적, 보유 기간과 이용자의 권리." },
    ],
  }),
  component: () => <PolicyPage title="개인정보 처리방침" sections={PRIVACY_SECTIONS} />,
});
