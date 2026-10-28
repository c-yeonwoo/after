import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Chip } from "@/components/onboarding/Chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BRAND } from "@/lib/brand";
import { submitFeedback } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useMe } from "@/lib/me";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import { getAssistantFlags } from "@/lib/privateAssistant";

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
          "만남이 어땠는지 남기면 약속이 지켜졌는지 확인하는 데 쓰며, 상대에게는 공개되지 않습니다.",
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
  const { me } = useMe();
  const flags = useMemberLiveQuery("assistant-capabilities", me?.id, getAssistantFlags);
  const navigate = useNavigate();
  const { meetingId } = Route.useSearch();
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<"loading" | "ready" | "submitted" | "unavailable" | "error">(
    "loading",
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!meetingId) return;
    let alive = true;
    setGate("loading");
    void (async () => {
      try {
        const [status, feedback] = await Promise.all([
          supabase.rpc("my_meeting_checkin", { p_meeting_id: meetingId }),
          supabase.from("feedbacks").select("id").eq("meeting_id", meetingId).maybeSingle(),
        ]);
        if (status.error || feedback.error) throw new Error("unavailable");
        const m = status.data as unknown as {
          scheduledAt: string | null;
          asOf: string;
          cancelled: boolean;
        };
        const next = feedback.data
          ? "submitted"
          : m?.scheduledAt && !m.cancelled && Date.parse(m.scheduledAt) <= Date.parse(m.asOf)
            ? "ready"
            : "unavailable";
        if (alive) setGate(next);
      } catch {
        if (alive) setGate("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [meetingId, retry]);

  if (!meetingId) {
    return (
      <AppScreen title="만남 후 피드백" hideTabs back="/chats">
        <p className="mt-16 text-center text-sm text-muted-foreground">
          피드백을 남길 만남을 찾을 수 없습니다.
        </p>
      </AppScreen>
    );
  }

  if (gate !== "ready")
    return (
      <AppScreen title="만남 후 피드백" hideTabs back="/home">
        <div className="mt-16 text-center">
          <p
            role={gate === "error" ? "alert" : undefined}
            className="text-sm text-muted-foreground"
          >
            {gate === "loading"
              ? "만남을 확인하고 있어요…"
              : gate === "submitted"
                ? "후기를 남겨주셨어요. 고마워요."
                : gate === "unavailable"
                  ? "예정된 만남이 지난 뒤 후기를 남길 수 있어요. 취소된 약속에는 후기를 받지 않아요."
                  : "만남 정보를 불러오지 못했어요."}
          </p>
          {gate === "error" ? (
            <Button variant="outline" className="mt-4" onClick={() => setRetry((v) => v + 1)}>
              다시 확인하기
            </Button>
          ) : gate !== "loading" ? (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void navigate({ to: "/home" })}
            >
              홈으로
            </Button>
          ) : null}
          {gate === "submitted" && flags.data?.memory && !flags.isError && !flags.isPaused ? (
            <div className="assistant-reply mt-6 text-left">
              <h2 className="font-semibold">다음 만남에 기억하고 싶은 점은?</h2>
              <p className="mt-2 text-sm leading-relaxed">
                편했던 대화 속도나 장소처럼, 내 선호만 따로 남길 수 있어요. 방금 쓴 후기는
                매니저에게 자동으로 보내지 않아요.
              </p>
              <Link
                to="/assistant"
                search={{ panel: "memory" }}
                className="mt-3 flex min-h-11 items-center font-semibold text-sm"
              >
                내 선호 직접 남기기
              </Link>
            </div>
          ) : null}
        </div>
      </AppScreen>
    );

  return (
    <AppScreen title="만남 후 피드백" hideTabs back="/chats">
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        선택 사항입니다. 약속이 지켜졌는지 확인하는 데 쓰며, 내용은 상대에게 공개되지 않습니다.
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

      {result === "noshow" ? (
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          상대에게 사실 확인을 요청하고 운영팀이 검토해요. 신고만으로 바로 제재하지 않습니다.
        </p>
      ) : (
        <section className="mt-7">
          <h2 className="text-sm font-semibold">기억에 남은 점 (복수 선택)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {NOTES.map((n) => (
              <Chip
                key={n}
                selected={notes.includes(n)}
                onClick={() =>
                  setNotes((prev) =>
                    prev.includes(n) ? prev.filter((v) => v !== n) : [...prev, n],
                  )
                }
              >
                {n}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <section className="mt-7">
        <label className="text-sm font-semibold" htmlFor="fb">
          더 하고 싶은 말 (선택)
        </label>
        <Textarea
          id="fb"
          rows={5}
          maxLength={1500}
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
              const body =
                [met ? notes.join(" · ") : "", text.trim()].filter(Boolean).join("\n") || undefined;
              await submitFeedback(meetingId, met, result, body);
              if (met) {
                toast.success("피드백이 저장되었습니다.");
              } else {
                // "만나지 못했어요" = 노쇼 신고. 신고만으로는 제재가 없고
                // 상대 확인(24시간)을 거친다 — P4.
                toast.success("신고가 접수되었습니다. 상대 확인을 요청했습니다.");
              }
              if (met && flags.data?.memory && !flags.isError && !flags.isPaused)
                setGate("submitted");
              else navigate({ to: "/home" });
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
