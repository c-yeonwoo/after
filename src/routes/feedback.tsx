import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Chip } from "@/components/onboarding/Chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BRAND } from "@/lib/brand";
import { markMet, reportNoShow, submitFeedback } from "@/lib/api";

export const Route = createFileRoute("/feedback")({
  validateSearch: (search: Record<string, unknown>): { meetingId?: string } => ({
    meetingId: typeof search.meetingId === "string" ? search.meetingId : undefined,
  }),
  head: () => ({
    meta: [
      { title: `만남 후 피드백 — ${BRAND.name}` },
      {
        name: "description",
        content:
          "만남이 어땠는지 남기면 다음 소개가 더 정확해집니다. 상대에게는 공개되지 않습니다.",
      },
      { property: "og:title", content: `만남 후 피드백 — ${BRAND.name}` },
      { property: "og:description", content: "선택 사항이며 상대에게 공개되지 않습니다." },
    ],
  }),
  component: FeedbackPage,
});

const RESULTS = [
  { id: "again", label: "또 만나고 싶어요" },
  { id: "friend", label: "좋았지만 인연은 아니에요" },
  { id: "no", label: "잘 맞지 않았어요" },
  { id: "noshow", label: "만나지 못했어요 (노쇼 신고)" },
];

const NOTES = [
  "대화가 편했어요",
  "예의 있었어요",
  "약속을 잘 지켰어요",
  "프로필과 달랐어요",
  "불편한 순간이 있었어요",
];

function FeedbackPage() {
  const navigate = useNavigate();
  const { meetingId } = Route.useSearch();
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!meetingId) {
    return (
      <AppScreen title="만남 후 피드백" hideTabs back="/chats">
        <p className="mt-16 text-center text-sm text-muted-foreground">
          피드백을 남길 만남을 찾을 수 없습니다.
        </p>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="만남 후 피드백" hideTabs back="/chats">
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        선택 사항입니다. 남겨 주시면 다음 소개가 더 정확해지고, 내용은 상대에게 공개되지 않습니다.
      </p>

      <section className="mt-7">
        <h2 className="text-sm font-semibold">만남은 어땠나요</h2>
        <div className="mt-3 grid gap-2">
          {RESULTS.map((r) => (
            <Chip key={r.id} selected={result === r.id} onClick={() => setResult(r.id)}>
              {r.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-sm font-semibold">기억에 남은 점 (복수 선택)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {NOTES.map((n) => (
            <Chip
              key={n}
              selected={notes.includes(n)}
              onClick={() =>
                setNotes((prev) => (prev.includes(n) ? prev.filter((v) => v !== n) : [...prev, n]))
              }
            >
              {n}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <label className="text-sm font-semibold" htmlFor="fb">
          더 하고 싶은 말 (선택)
        </label>
        <Textarea
          id="fb"
          rows={5}
          className="mt-2"
          placeholder="안전과 관련된 일은 반드시 알려주세요."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </section>

      <div className="mt-8 flex gap-2">
        <Button variant="ghost" onClick={() => navigate({ to: "/home" })}>
          건너뛰기
        </Button>
        <Button
          className="flex-1"
          size="lg"
          disabled={!result || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const met = result !== "noshow";
              const body = [notes.join(" · "), text.trim()].filter(Boolean).join("\n") || undefined;
              await submitFeedback(meetingId, met, result, body);
              if (met) {
                await markMet(meetingId);
                toast.success("피드백이 저장되었습니다.");
              } else {
                // "만나지 못했어요" = 노쇼 신고. 신고만으로는 제재가 없고
                // 상대 확인(24시간)을 거친다 — P4.
                await reportNoShow(meetingId);
                toast.success("신고가 접수되었습니다. 상대 확인을 요청했습니다.");
              }
              navigate({ to: "/home" });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "저장하는 중…" : "보내기"}
        </Button>
      </div>
    </AppScreen>
  );
}
