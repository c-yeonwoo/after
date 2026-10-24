import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, ArrowRight } from "lucide-react";
import { AppScreen } from "@/components/app/AppScreen";
import { MeetingPolicyNote } from "@/components/app/MeetingPolicyNote";
import { AssistantMark } from "@/components/assistant/AssistantMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/me";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import { assistantRpc } from "@/lib/privateAssistant";
import { formatMeetTime } from "@/lib/meet";
import {
  scheduleKind,
  scheduleInputIssue,
  scheduleLabels,
  seoulAppointment,
  type ScheduleState,
  type ScheduleAction,
  type ScheduleMeeting,
} from "@/lib/assistantSchedule";

export const Route = createFileRoute("/assistant-schedule")({
  head: () => ({
    meta: [{ title: "비서와 약속 준비 — 애프터" }, { name: "robots", content: "noindex" }],
  }),
  component: SchedulePage,
});
const readSchedule = () => assistantRpc<ScheduleState>("my_assistant_schedule");
function SchedulePage() {
  const { me } = useMe();
  return (
    <AppScreen title="비서와 약속 준비" back="/home" hideTabs keyboardAware>
      {me && me.onboarding_step >= 7 ? (
        <Schedule key={me.id} owner={me.id} />
      ) : (
        <Link to="/login" className="flex min-h-11 items-center">
          로그인하고 이어가기
        </Link>
      )}
    </AppScreen>
  );
}
function Schedule({ owner }: { owner: string }) {
  const client = useQueryClient();
  const live = useMemberLiveQuery("assistant-schedule", owner, readSchedule);
  const data = !live.isError && !live.isPaused ? live.data : undefined;
  const [selected, setSelected] = useState("");
  const [editingAction, setEditingAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      client.removeQueries({ queryKey: ["assistant-schedule", owner], exact: true });
    };
  }, [owner, client]);
  async function run(action: () => Promise<ScheduleState>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const release = live.beginInteraction();
    try {
      const result = await action();
      if (alive.current) live.update(() => result);
      await client.invalidateQueries({ queryKey: ["home"] });
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error && cause.message === "changed"
            ? "약속 상태가 바뀌었거나 초안이 만료됐어요. 최신 내용을 확인한 뒤 새 초안을 만들어 주세요."
            : "결과를 확인하지 못했어요. 먼저 상태를 다시 확인해 주세요. 같은 승인을 반복해도 한 번만 처리해요.",
        );
      await live.refetch();
    } finally {
      release();
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const meeting = data?.meetings.find((m) => m.id === selected) ?? data?.meetings[0];
  const latest =
    data?.actions.filter((a) => !meeting || a.meeting_id === meeting.id).slice(0, 1) ?? [];
  const hasDraft = latest.some(
    (a) => a.state === "awaiting_approval" && Date.parse(a.expires_at) > Date.now(),
  );
  const receiptFirst = latest[0]?.state === "succeeded" && editingAction !== latest[0].id;
  return (
    <>
      <div className="assistant-status">
        <AssistantMark />
        <h2 className="mt-4 text-2xl font-bold break-keep">
          시간은 정리하고,
          <br />
          결정은 함께.
        </h2>
        <p className="mt-3 text-sm leading-relaxed">
          초안을 먼저 보여드려요. 승인하기 전에는 상대에게 전달하지 않아요.
        </p>
      </div>
      {!data ? (
        <div className="mt-6" role="status">
          <p>{live.isPending ? "약속을 확인하고 있어요…" : "약속 정보를 불러오지 못했어요."}</p>
          <Button variant="outline" className="mt-3" onClick={() => void live.refetch()}>
            상태 다시 확인
          </Button>
        </div>
      ) : (
        <>
          {!data.enabled ? (
            <p className="mt-6 text-sm leading-relaxed">
              일정 비서는 아직 준비 중이에요. 기존 약속 화면은 그대로 이용할 수 있어요.
            </p>
          ) : !meeting ? (
            <p className="mt-6 text-sm">함께 조율할 약속이 생기면 여기서 준비해 드릴게요.</p>
          ) : (
            <>
              {data.meetings.length > 1 ? (
                <label className="mt-6 block text-sm font-semibold">
                  어떤 약속인가요?
                  <select
                    className="mt-2 h-12 w-full rounded-control border bg-card px-3 text-base"
                    value={meeting.id}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={busy}
                  >
                    {data.meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? "상대"}님과의 약속
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!hasDraft && !receiptFirst ? (
                <ScheduleForm
                  key={meeting.id + JSON.stringify(meeting)}
                  meeting={meeting}
                  busy={busy}
                  run={run}
                />
              ) : null}
            </>
          )}
          {latest.map((action) => (
            <Action key={action.id} action={action} enabled={data.enabled} busy={busy} run={run} />
          ))}
          {data.enabled && meeting && receiptFirst && scheduleKind(meeting) ? (
            <Button
              className="mt-4"
              variant="outline"
              disabled={busy}
              onClick={() => setEditingAction(latest[0].id)}
            >
              일정 다시 준비하기
            </Button>
          ) : null}
          <Button
            className="mt-5"
            variant="outline"
            disabled={busy}
            onClick={() => void live.refetch()}
          >
            상태 다시 확인
          </Button>
        </>
      )}
      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Link to="/chats" className="mt-5 flex min-h-11 items-center gap-2 text-sm font-semibold">
        기존 약속·대화 화면으로
        <ArrowRight className="size-4" />
      </Link>
    </>
  );
}
type Runner = (action: () => Promise<ScheduleState>) => Promise<void>;
function ScheduleForm({
  meeting: m,
  busy,
  run,
}: {
  meeting: ScheduleMeeting;
  busy: boolean;
  run: Runner;
}) {
  const kind = scheduleKind(m);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [choice, setChoice] = useState("");
  const [place, setPlace] = useState("");
  const [placeKind, setPlaceKind] = useState("카페");
  const pending = useRef<{ key: string; id: string } | null>(null);
  const at = seoulAppointment(date, time);
  if (!kind)
    return (
      <p className="mt-6 text-sm leading-relaxed">
        상대가 시간을 고르는 중이에요. 답변이 오면 다음 단계를 안내할게요.
      </p>
    );
  const options = kind === "accept_slot" ? m.slots : kind === "confirm" ? m.dates : null;
  const selectedAt = options
    ? choice === ""
      ? null
      : kind === "accept_slot"
        ? options[Number(choice)]
        : choice
    : at;
  const issue = scheduleInputIssue(m, kind, selectedAt, place);
  const valid = issue === null;
  function draft() {
    if (!valid || !kind) return;
    const args =
      kind === "accept_slot"
        ? { slot: Number(choice) }
        : kind === "confirm"
          ? { at: choice, place: place.trim(), placeKind }
          : kind === "change"
            ? { at }
            : { dates: [at], stations: [], anywhere: true };
    const key = JSON.stringify({ meeting: m.id, kind, args });
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    void run(async () => {
      const result = await assistantRpc<ScheduleState>("assistant_draft_schedule", {
        p_id: pending.current!.id,
        p_meeting: m.id,
        p_kind: kind,
        p_args: args,
      });
      pending.current = null;
      return result;
    });
  }
  return (
    <section className="mt-7" aria-label="일정 초안 만들기">
      <h3 className="text-xl font-bold">{scheduleLabels[kind]}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{m.name ?? "상대"}님과의 약속</p>
      {m.confirmed && m.scheduledAt ? (
        <p className="mt-2 text-sm">현재 {formatMeetTime(m.scheduledAt)}</p>
      ) : null}
      {options ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-2 text-sm">상대가 제안한 시간</legend>
          {options.map((value, index) => (
            <label
              key={value}
              className="flex min-h-12 items-center gap-3 rounded-control bg-card p-3"
            >
              <input
                type="radio"
                name="schedule-choice"
                value={kind === "accept_slot" ? index : value}
                checked={choice === (kind === "accept_slot" ? String(index) : value)}
                onChange={(e) => setChoice(e.target.value)}
                disabled={busy}
              />
              <span className="text-sm">{formatMeetTime(value)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="min-w-0 text-sm">
            날짜
            <Input
              type="date"
              className="mt-2 w-full min-w-0"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="min-w-0 text-sm">
            시간 · 한국 기준
            <Input
              type="time"
              className="mt-2 w-full min-w-0"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
      )}
      {kind === "confirm" ? (
        <>
          <label className="mt-4 block text-sm">
            만날 장소
            <Input
              className="mt-2"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              maxLength={100}
              placeholder="서로 찾아갈 수 있는 장소명"
              disabled={busy}
            />
          </label>
          <label className="mt-3 block text-sm">
            어떤 만남인가요?
            <select
              className="mt-2 h-11 w-full rounded-control border bg-card px-3 text-base"
              value={placeKind}
              onChange={(e) => setPlaceKind(e.target.value)}
              disabled={busy}
            >
              {["카페", "저녁", "가벼운 술", "기타"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {kind === "change"
          ? "3시간 이후부터 21일 이내, 평일 18~22시 중 골라주세요. 상대가 동의해야 변경돼요."
          : kind === "preferences"
            ? "3시간 이후부터 21일 이내로 골라주세요. 장소는 상대가 정하도록 가능한 시간만 전달해요."
            : "장소 예약이나 결제는 하지 않아요."}
      </p>
      {!valid ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {issue}
        </p>
      ) : null}
      <Button className="mt-4 w-full" disabled={!valid || busy} onClick={draft}>
        전달 전 초안 보기
      </Button>
    </section>
  );
}
function Action({
  action: a,
  enabled,
  busy,
  run,
}: {
  action: ScheduleAction;
  enabled: boolean;
  busy: boolean;
  run: Runner;
}) {
  const [agree, setAgree] = useState(false);
  const awaiting = a.state === "awaiting_approval" && Date.parse(a.expires_at) > Date.now();
  return (
    <section className="assistant-reply mt-6" aria-label="일정 초안">
      <div className="flex items-center gap-2">
        <CalendarCheck className="size-5 shrink-0" />
        <h3 className="font-semibold">{scheduleLabels[a.kind]}</h3>
      </div>
      <p className="mt-2 text-sm">{a.preview.name ?? "상대"}님에게</p>
      {a.preview.dates.map((when) => (
        <p key={when} className="mt-1 text-sm">
          {formatMeetTime(when)}
        </p>
      ))}
      {a.preview.place ? <p className="mt-1 text-sm">{a.preview.place}</p> : null}
      {a.state === "succeeded" ? (
        <p className="mt-3 text-sm" role="status">
          {a.kind === "change" || a.kind === "preferences"
            ? "요청을 전달했어요. 상대의 답변을 기다려 주세요."
            : "약속을 확정했어요. 기존 약속 화면에서도 확인할 수 있어요."}
        </p>
      ) : awaiting ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            15분 안에 승인해 주세요. 승인 후에는 기존 약속 알림으로 안내돼요.
          </p>
          <MeetingPolicyNote />
          <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
            <input
              className="mt-1 size-5 shrink-0 accent-primary"
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              disabled={busy || !enabled}
            />
            <span>
              위 날짜·시간과 참석 확인 안내를 읽었고, 이 내용으로{" "}
              {a.kind === "change" || a.kind === "preferences" ? "상대에게 요청" : "약속을 확정"}
              할게요.
            </span>
          </label>
          <Button
            className="mt-3 w-full"
            disabled={!agree || busy || !enabled}
            onClick={() =>
              void run(() =>
                assistantRpc<ScheduleState>("assistant_approve_schedule", {
                  p_id: a.id,
                  p_token: a.approval_token,
                  p_policy_ack: true,
                }),
              )
            }
          >
            승인하고 {a.kind === "change" || a.kind === "preferences" ? "요청하기" : "확정하기"}
          </Button>
          <Button
            variant="ghost"
            className="mt-1 w-full"
            disabled={busy}
            onClick={() =>
              void run(() =>
                assistantRpc<ScheduleState>("assistant_revoke_schedule", { p_id: a.id }),
              )
            }
          >
            초안 취소
          </Button>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {a.state === "revoked"
            ? "취소한 초안이에요."
            : "승인 시간이 지났어요. 새 초안을 만들어 주세요."}
        </p>
      )}
    </section>
  );
}
