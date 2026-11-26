import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { introPriorityLabels, type IntroEvidence, type IntroPriority } from "@/lib/api";
import { introReasonCopy, type ReadablePair } from "@/lib/introReasonCopy";
import { useMe } from "@/lib/me";
import { supabase } from "@/lib/supabase";

type ReasonProps = {
  reason: string;
  pair?: ReadablePair;
  evidence?: IntroEvidence | null;
  priority?: IntroPriority | null;
  onSaved?: (choice: IntroPriority) => void;
  embedded?: boolean;
  preview?: boolean;
  portrait?: boolean;
};

export function IntroductionReason({
  reason: original,
  pair,
  evidence,
  priority,
  onSaved,
  embedded,
  preview,
  portrait,
}: ReasonProps) {
  const { me } = useMe();
  const client = useQueryClient();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<IntroPriority | null>(null);
  const [saving, setSaving] = useState(false);
  const [weightOverride, setWeightOverride] = useState<{
    key: string;
    value: boolean;
    initial: boolean;
  } | null>(null);
  const weightKey = JSON.stringify([me?.id, evidence?.quote]);
  const discounted =
    weightOverride?.key === weightKey && weightOverride.initial === Boolean(evidence?.discounted)
      ? weightOverride.value
      : Boolean(evidence?.discounted);
  const [error, setError] = useState("");
  const reason = introReasonCopy(original, evidence && { ...evidence, discounted }, pair);
  const label = portrait ? "매니저가 본 이분" : "매니저의 소개 이유";
  const words = (
    <>
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-muted-foreground">
        <NotebookPen className="size-4 shrink-0" strokeWidth={1.7} aria-hidden="true" />
        {label}
        {evidence && me && (
          <span className="ml-auto inline-flex items-center gap-0.5 font-medium">
            근거 보기 <ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
      <span
        className={
          preview
            ? "mt-1.5 line-clamp-3 break-keep text-sm leading-relaxed"
            : "mt-2 block break-keep text-base leading-relaxed"
        }
      >
        {reason}
      </span>
    </>
  );
  async function changeWeight() {
    if (!me || !evidence?.quote || saving) return;
    setSaving(true);
    setError("");
    try {
      const { error } = await supabase.rpc("save_intro_signal_weight", {
        p_owner: me.id,
        p_signal: evidence.quote,
        p_less: !discounted,
      });
      if (error) throw error;
      setWeightOverride({
        key: weightKey,
        value: !discounted,
        initial: Boolean(evidence.discounted),
      });
      void client.invalidateQueries({ queryKey: ["member-home", me.id], exact: true });
      toast.success(
        discounted ? "다시 공통점으로 볼게요." : "다음 소개에서는 다른 공통점을 먼저 볼게요.",
      );
    } catch {
      setError("변경하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }
  async function save() {
    if (!choice || !me || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("save_intro_priority", {
        p_owner: me.id,
        p_choice: choice,
      });
      if (error) throw error;
      onSaved?.(choice);
      void client.invalidateQueries({ queryKey: ["member-home", me.id], exact: true });
      setOpen(false);
      toast.success("다음 소개에 반영할게요.");
    } catch {
      setError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <aside
      className={embedded ? "border-t border-border pt-4" : "intro-manager-note"}
      aria-label={portrait ? label : "소개 이유"}
    >
      {evidence && me ? (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (saving) return;
            if (next) {
              setChoice(priority ?? null);
              setError("");
            }
            setOpen(next);
          }}
        >
          <SheetTrigger asChild>
            <button
              type="button"
              className="block min-h-11 w-full rounded-control text-left focus-visible:outline-2"
            >
              {words}
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="reason-sheet"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              titleRef.current?.focus({ preventScroll: true });
            }}
          >
            <div className="reason-sheet-body">
              <SheetTitle
                ref={titleRef}
                tabIndex={-1}
                className="pr-9 text-xl leading-snug tracking-tight outline-none"
              >
                {evidence.source === "curated"
                  ? "매니저가 남긴 소개 이유"
                  : evidence.source === "selection"
                    ? "이번 소개"
                    : "소개에서 눈여겨본 점"}
              </SheetTitle>
              <SheetDescription className="mt-2 break-keep text-base leading-relaxed text-foreground [overflow-wrap:anywhere]">
                {reason}
              </SheetDescription>
              <div className="reason-source">
                <p className="text-xs font-medium text-muted-foreground">{evidence.label}</p>
                {evidence.quote && (
                  <blockquote className="mt-1.5 break-keep text-base leading-snug [overflow-wrap:anywhere]">
                    <span>“{evidence.quote}”</span>
                  </blockquote>
                )}
                {evidence.source === "shared" && evidence.quote && (
                  <button
                    type="button"
                    disabled={saving}
                    aria-pressed={discounted}
                    className="mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground focus-visible:outline-2"
                    onClick={() => void changeWeight()}
                  >
                    {discounted ? "다시 공통점으로 고려하기" : "이 공통점은 덜 중요해요"}
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <fieldset className="mt-5 min-w-0" disabled={saving}>
                <legend className="text-base font-semibold">다음엔 어떤 첫 만남이 좋으세요?</legend>
                <p className="mt-1 text-sm text-muted-foreground">다음 소개부터 우선해서 볼게요.</p>
                <div className="reason-choices">
                  {(Object.entries(introPriorityLabels) as [IntroPriority, string][]).map(
                    ([value, text]) => (
                      <label key={value} className="reason-choice">
                        <input
                          type="radio"
                          name="intro-priority"
                          value={value}
                          checked={choice === value}
                          onChange={() => setChoice(value)}
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                        />
                        <span>{text}</span>
                        <Check
                          size={14}
                          strokeWidth={2}
                          aria-hidden="true"
                          className={choice === value ? undefined : "invisible"}
                        />
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="mt-3 text-sm">
                  {error}
                </p>
              )}
            </div>
            <div className="reason-sheet-action">
              <Button
                className="intro-primary-button w-full"
                disabled={!choice || choice === priority || saving}
                onClick={() => void save()}
              >
                {saving ? "저장 중…" : "다음 소개에 반영"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <div>{words}</div>
      )}
    </aside>
  );
}
