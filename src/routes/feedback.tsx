import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Circle, Flag, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Chip } from "@/components/onboarding/Chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
      { title: `만남 후기 — ${BRAND.name}` },
      {
        name: "description",
        content:
          "만남이 어땠는지 남기면 약속이 지켜졌는지 확인하는 데 쓰며, 상대에게는 공개되지 않습니다.",
      },
      { property: "og:title", content: `만남 후기 — ${BRAND.name}` },
      { property: "og:description", content: "선택 사항이며 상대에게 공개되지 않습니다." },
    ],
  }),
  component: FeedbackPage,
});

const RESULTS = [
  { id: "again", label: "또 만나고 싶어요" },
  { id: "friend", label: "좋았지만 인연은 아니에요" },
  { id: "no", label: "잘 맞지 않았어요" },
];

const NOTES = [
  "대화가 편했어요",
  "예의 있었어요",
  "약속을 잘 지켰어요",
  "프로필과 달랐어요",
  "불편한 순간이 있었어요",
];

const NEXT_MEETING = [
  ["walk", "함께 산책"],
  ["coffee", "가볍게 커피"],
  ["meal", "식사하며 대화"],
  ["activity", "함께하는 활동"],
] as const;

function FeedbackPage() {
  const { me } = useMe();
  const { meetingId } = Route.useSearch();
  return <MeetingFeedback key={`${me?.id ?? ""}:${meetingId ?? ""}`} meetingId={meetingId} />;
}

function MeetingFeedback({ meetingId }: { meetingId?: string }) {
  const { me } = useMe();
  const flags = useMemberLiveQuery("assistant-capabilities", me?.id, getAssistantFlags);
  const navigate = useNavigate();
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [preference, setPreference] = useState<(typeof NEXT_MEETING)[number][0]>();
  const [text, setText] = useState("");
  const [reportText, setReportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<"loading" | "ready" | "submitted" | "unavailable" | "error">(
    "loading",
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!meetingId || !me?.id) return;
    let alive = true;
    setGate("loading");
    const authorId = me.id;
    void (async () => {
      try {
        const [status, feedback] = await Promise.all([
          supabase.rpc("my_meeting_checkin", { p_meeting_id: meetingId }),
          supabase
            .from("feedbacks")
            .select("id")
            .eq("meeting_id", meetingId)
            .eq("author_id", authorId)
            .maybeSingle(),
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
  }, [meetingId, me?.id, retry]);

  if (!meetingId) {
    return (
      <AppScreen title="만남 후기" hideTabs back="/chats">
        <p className="mt-16 text-center text-sm text-muted-foreground">
          피드백을 남길 만남을 찾을 수 없습니다.
        </p>
      </AppScreen>
    );
  }

  if (gate !== "ready")
    return (
      <AppScreen title="만남 후기" hideTabs back="/home">
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
              <h2 className="font-medium">다음 만남에 기억하고 싶은 점은?</h2>
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

  const noShow = result === "noshow";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!meetingId || !result || busy) return;
    setBusy(true);
    try {
      const body =
        [noShow ? "" : notes.join(" · "), (noShow ? reportText : text).trim()]
          .filter(Boolean)
          .join("\n") || undefined;
      await submitFeedback(meetingId, !noShow, result, body, noShow ? undefined : preference);
      if (noShow) toast.success("신고를 접수했어요. 상대에게 사실 확인을 요청했어요.");
      else toast.success("후기를 남겼어요.");
      if (!noShow && flags.data?.memory && !flags.isError && !flags.isPaused) setGate("submitted");
      else void navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen
      title="만남 후기"
      hideTabs
      keyboardAware
      back="/chats"
      footer={
        <div className="meeting-response-actions flex items-center gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => void navigate({ to: "/home" })}>
            건너뛰기
          </Button>
          <Button
            type="submit"
            form="meeting-feedback"
            className="flex-1"
            size="lg"
            disabled={!result || busy}
          >
            {busy ? "보내는 중…" : noShow ? "노쇼 신고 접수하기" : "후기 남기기"}
          </Button>
        </div>
      }
    >
      <form id="meeting-feedback" onSubmit={submit} className="space-y-6">
        <section aria-labelledby="meeting-impression">
          <h2 id="meeting-impression" className="text-xl font-medium tracking-tight">
            만남은 어땠나요?
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3.5" />
            후기는 상대에게 보이지 않아요.
          </p>
          <div
            role="group"
            aria-labelledby="meeting-impression"
            className="mt-4 grid gap-1 rounded-surface bg-muted p-2"
          >
            {RESULTS.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={result === r.id}
                onClick={() => setResult(r.id)}
                className={cn(
                  "pressable flex min-h-11 items-center justify-between gap-2 rounded-control px-3 text-left text-base leading-snug focus-visible:ring-2 focus-visible:ring-ring",
                  result === r.id && "bg-card shadow-sm",
                )}
              >
                {r.label}
                {result === r.id ? (
                  <Check className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={noShow}
            onClick={() => setResult("noshow")}
            className={cn(
              "pressable mt-1 flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring",
              noShow ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            <Flag aria-hidden="true" className="size-4" />
            만나지 못했어요 (노쇼 신고)
            {noShow ? <Check aria-hidden="true" className="ml-auto size-4" /> : null}
          </button>
        </section>
        {noShow ? (
          <p role="status" className="rounded-control bg-muted p-3 text-sm leading-relaxed">
            신고를 보내면 상대에게 사실 확인을 요청해요. 운영팀이 양쪽의 이야기를 확인해요.
          </p>
        ) : null}
        {result && !noShow ? (
          <>
            <fieldset className="min-w-0">
              <legend className="font-medium">기억에 남은 점</legend>
              <p className="mt-1 text-sm text-muted-foreground">여러 개 골라도 좋아요.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {NOTES.map((n) => (
                  <Chip
                    className="font-medium"
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
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="font-medium">다음엔 어떤 만남이 좋을까요?</legend>
              <p className="mt-1 text-sm text-muted-foreground">
                고르면 다음 소개 순서에 참고해요.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {NEXT_MEETING.map(([value, label]) => (
                  <Chip
                    className="font-medium"
                    key={value}
                    selected={preference === value}
                    onClick={() => setPreference(preference === value ? undefined : value)}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}
        {result ? (
          <div>
            <label className="font-medium" htmlFor="fb">
              {noShow ? "어떤 일이 있었나요?" : "더 하고 싶은 말"}{" "}
              <span className="text-sm font-normal text-muted-foreground">(선택)</span>
            </label>
            <Textarea
              id="fb"
              rows={3}
              maxLength={1500}
              className="mt-2"
              value={noShow ? reportText : text}
              onChange={(e) => (noShow ? setReportText : setText)(e.target.value)}
            />
          </div>
        ) : null}
      </form>
    </AppScreen>
  );
}
