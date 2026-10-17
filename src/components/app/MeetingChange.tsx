import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MeetingPolicyNote } from "@/components/app/MeetingPolicyNote";
import { getMeeting, type Meeting } from "@/lib/api";
import {
  getMeetingChange,
  requestMeetingChange,
  respondMeetingChange,
  type MeetingChangeState,
} from "@/lib/meetingChanges";
import { WEEKDAY_TIMES } from "@/lib/meet";
import { useMe } from "@/lib/me";

const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function MeetingChange({
  meeting,
  onChange,
}: {
  meeting: Meeting;
  onChange?: (m: Meeting) => void;
}) {
  const { me } = useMe();
  const [state, setState] = useState<MeetingChangeState | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = useRef({ meeting, onChange });
  current.current = { meeting, onChange };
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true,
      loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const next = await getMeetingChange(meeting.id);
        if (!active) return;
        setState(next);
        setError(false);
        if (
          Date.parse(next.scheduledAt) !== Date.parse(current.current.meeting.scheduled_at ?? "")
        ) {
          const updated = await getMeeting(meeting.id);
          if (active && updated) current.current.onChange?.(updated);
        }
      } catch {
        if (active) setError(true);
      } finally {
        loading = false;
      }
    }
    void load();
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(visible, 30_000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [meeting.id, retry]);
  if (meeting.cancelled_at || meeting.completed_at) return null;
  const pending = state?.change?.state === "pending" ? state.change : null;
  if (!error && !pending && !state?.canRequest) return null;

  async function respond(accept: boolean) {
    if (!pending) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await respondMeetingChange(pending.id, accept);
      onChange?.(updated);
      setOpen(false);
      setRetry((v) => v + 1);
      toast.success(accept ? "새 일정으로 약속을 변경했어요." : "기존 약속은 그대로 유지돼요.");
    } catch {
      setMessage("약속 상태가 바뀌었거나 제안 기한이 지났어요. 다시 확인해 주세요.");
      setRetry((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mt-2 shrink-0">
        {error ? (
          <p className="text-xs text-muted-foreground" role="alert">
            일정 변경 상태를 확인하지 못했어요.{" "}
            <Button size="sm" variant="ghost" onClick={() => setRetry((v) => v + 1)}>
              다시 확인
            </Button>
          </p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMessage("");
              setOpen(true);
            }}
          >
            {pending
              ? pending.requestedBy === me?.id
                ? "일정 변경 답변 기다리는 중"
                : "새 일정 제안 확인하기"
              : "약속 시간 바꾸기"}
          </Button>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] overflow-y-auto overscroll-contain rounded-surface">
          <DialogHeader>
            <DialogTitle>약속 시간 바꾸기</DialogTitle>
            <DialogDescription>
              서로 동의하기 전까지 기존 약속은 유지돼요. 장소와 만남 티켓은 그대로예요.
            </DialogDescription>
          </DialogHeader>
          {meeting.scheduled_at ? (
            <p className="text-sm">현재 약속 · {when(meeting.scheduled_at)}</p>
          ) : null}
          {pending ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">제안된 시간 · {when(pending.proposedAt)}</p>
              <p className="text-xs text-muted-foreground">
                {when(pending.expiresAt)}까지 답이 없으면 제안만 종료되고, 기존 약속은 유지돼요.
              </p>
              <MeetingPolicyNote />
              {pending.requestedBy !== me?.id ? (
                <Button className="w-full" disabled={busy} onClick={() => void respond(true)}>
                  이 시간으로 변경할게요
                </Button>
              ) : null}
              <Button
                className="w-full"
                variant="outline"
                disabled={busy}
                onClick={() => void respond(false)}
              >
                {pending.requestedBy === me?.id ? "변경 제안 취소" : "기존 약속 유지하기"}
              </Button>
            </div>
          ) : state?.canRequest ? (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!date) {
                  setMessage("변경할 날짜를 선택해 주세요.");
                  return;
                }
                setBusy(true);
                setMessage("");
                try {
                  const next = await requestMeetingChange(
                    meeting.id,
                    new Date(`${date}T${time}:00+09:00`).toISOString(),
                    state.revision,
                    requestId.current,
                  );
                  setState(next);
                  requestId.current = crypto.randomUUID();
                  toast.success("새 시간을 제안했어요.");
                } catch {
                  setMessage(
                    "평일 저녁, 3시간 뒤부터 3주 안의 시간을 골라 주세요. 이미 제안이 있다면 다시 확인해 주세요.",
                  );
                  setRetry((v) => v + 1);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="min-w-0 text-sm">
                  날짜
                  <input
                    aria-label="변경할 날짜"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      requestId.current = crypto.randomUUID();
                    }}
                    className="mt-1 block min-h-11 w-full min-w-0 rounded-control border border-border bg-background px-2"
                  />
                </label>
                <label className="text-sm">
                  시간
                  <select
                    aria-label="변경할 시간"
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      requestId.current = crypto.randomUUID();
                    }}
                    className="mt-1 block min-h-11 w-full rounded-control border border-border bg-background px-2"
                  >
                    {WEEKDAY_TIMES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                평일 저녁에 만날 수 있어요. 약속이 3시간 이내로 가까워졌다면 운영팀에 조율을 요청해
                주세요.
              </p>
              <MeetingPolicyNote />
              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? "보내는 중…" : "새 시간 제안하기"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              지금은 시간을 변경할 수 없어요. 운영팀에 조율을 요청해 주세요.
            </p>
          )}
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
