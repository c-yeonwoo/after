import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type Checkin = {
  enrolled: boolean;
  confirmed: boolean;
  partnerConfirmed: boolean;
  dueAt: string;
  opensAt: string;
  asOf: string;
  scheduledAt: string;
  cancelled: boolean;
  completed: boolean;
  operatorConfirmed: boolean;
};

export function MeetingCheckin({
  meetingId,
  embedded = false,
}: {
  meetingId: string;
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<Checkin | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const r = await supabase.rpc("my_meeting_checkin", { p_meeting_id: meetingId });
        if (r.error || !r.data || typeof r.data !== "object" || !("enrolled" in r.data))
          throw new Error("unavailable");
        if (alive) {
          setState(r.data as unknown as Checkin);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [meetingId, retry]);

  if (error)
    return (
      <div role="alert" className="mt-4 text-sm text-muted-foreground">
        참석 확인 상태를 불러오지 못했어요.
        <Button variant="ghost" size="sm" onClick={() => setRetry((v) => v + 1)}>
          다시 확인
        </Button>
      </div>
    );
  if (!state || (!state.enrolled && !state.operatorConfirmed) || state.completed) return null;
  if (state.cancelled)
    return (
      <div className="mt-4 text-sm">
        <p>이번 약속은 취소됐어요. 현재 상태를 확인해 주세요.</p>
        <Button
          variant="outline"
          className="mt-2"
          onClick={async () => {
            await navigate({ to: "/home" });
            window.location.reload();
          }}
        >
          홈에서 확인
        </Button>
      </div>
    );
  if (Date.parse(state.asOf) >= Date.parse(state.scheduledAt)) return null;
  const opens = Date.parse(state.asOf) >= Date.parse(state.opensAt);
  const due = new Date(state.dueAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <section
      aria-label="약속 참석 확인"
      className={
        embedded
          ? "mb-4 border-b border-border pb-4"
          : "mt-4 rounded-control border border-border bg-background p-4"
      }
    >
      <p className="text-sm font-semibold">
        {state.operatorConfirmed
          ? "운영팀과 참석을 확인했어요"
          : state.confirmed && state.partnerConfirmed
            ? "두 분 모두 참석을 확인했어요"
            : state.confirmed
              ? "참석 의사를 전달했어요"
              : "약속, 그대로 괜찮으세요?"}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {state.operatorConfirmed
          ? "운영팀이 두 분의 참석 의사를 확인했어요. 정해진 시간과 장소에서 만나요."
          : state.confirmed
            ? state.partnerConfirmed
              ? "정해진 시간과 장소에서 만나요."
              : "상대의 확인을 기다리고 있어요. 필요하면 운영팀에 도움을 요청해 주세요."
            : opens
              ? `${due}까지 참석을 확인해 주세요.`
              : "약속 24시간 전부터 참석을 한 번 더 확인할게요."}
      </p>
      {!state.confirmed && !state.operatorConfirmed ? (
        <>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            안내를 읽은 뒤에도 약속 2시간 전까지 두 분 모두 확인하지 않으면 자동취소되고 만남 티켓은
            돌아와요. 미응답이 반복되면 운영팀이 확인해요.
          </p>
          {opens ? (
            <Button
              className="mt-3 w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await supabase.rpc("confirm_meeting_attendance", {
                    p_meeting_id: meetingId,
                  });
                  if (r.error) throw r.error;
                  setState(r.data as unknown as Checkin);
                  toast.success("참석 의사를 전달했어요.");
                } catch {
                  toast.error("참석 확인을 마치지 못했어요. 약속 상태를 다시 확인해 주세요.");
                  setRetry((v) => v + 1);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "확인 중…" : "이 약속에 참석할게요"}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
