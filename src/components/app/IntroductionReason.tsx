import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, NotebookPen } from "lucide-react";
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
import { useMe } from "@/lib/me";
import { supabase } from "@/lib/supabase";

type ReasonProps = {
  reason: string;
  evidence?: IntroEvidence | null;
  priority?: IntroPriority | null;
  onSaved?: (choice: IntroPriority) => void;
  embedded?: boolean;
  preview?: boolean;
  portrait?: boolean;
};

export function IntroductionReason({
  reason,
  evidence,
  priority,
  onSaved,
  embedded,
  preview,
  portrait,
}: ReasonProps) {
  const { me } = useMe();
  const client = useQueryClient();
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
  const label = portrait ? "매니저가 본 이분" : "매니저의 소개 이유";
  const words = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <NotebookPen className="size-4 shrink-0" aria-hidden="true" />
        {label}
        {evidence && (
          <ChevronRight
            className="ml-auto size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
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
              aria-label={label + " 근거 보기"}
            >
              {words}
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-surface pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            <SheetTitle>
              {evidence.source === "curated"
                ? "매니저가 남긴 소개 이유"
                : evidence.source === "selection"
                  ? "이번 소개"
                  : "소개에서 눈여겨본 점"}
            </SheetTitle>
            <SheetDescription className="mt-2 break-keep">{reason}</SheetDescription>
            <div className="mt-4 rounded-control bg-muted px-4 py-3 text-sm">
              <p>{evidence.label}</p>
              {evidence.quote && (
                <blockquote className="mt-1 font-medium">“{evidence.quote}”</blockquote>
              )}
              {evidence.source === "shared" && evidence.quote && (
                <button
                  type="button"
                  disabled={saving}
                  aria-pressed={discounted}
                  className="mt-1 min-h-11 text-sm font-semibold underline underline-offset-4"
                  onClick={() => void changeWeight()}
                >
                  {discounted ? "다시 공통점으로 고려하기" : "이 공통점은 덜 중요해요"}
                </button>
              )}
            </div>
            <fieldset className="mt-6" disabled={saving}>
              <legend className="text-base font-semibold">다음엔 어떤 첫 만남이 좋으세요?</legend>
              <p className="mt-1 text-sm text-muted-foreground">
                지금 소개는 그대로예요. 다음 후보를 고를 때 우선해요.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.entries(introPriorityLabels) as [IntroPriority, string][]).map(
                  ([value, text]) => (
                    <label
                      key={value}
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control bg-muted px-3 text-sm has-checked:bg-selection has-checked:font-semibold"
                    >
                      <input
                        type="radio"
                        name="intro-priority"
                        value={value}
                        checked={choice === value}
                        onChange={() => setChoice(value)}
                        className="accent-primary"
                      />
                      {text}
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
            <Button
              className="mt-5 w-full"
              disabled={!choice || choice === priority || saving}
              onClick={() => void save()}
            >
              {saving ? "저장 중…" : "다음 소개에 반영"}
            </Button>
          </SheetContent>
        </Sheet>
      ) : (
        <div>{words}</div>
      )}
    </aside>
  );
}
