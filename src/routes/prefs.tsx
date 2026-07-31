import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";
import { getCandidate } from "@/lib/candidates";
import { PREF_AREAS, PREF_FOODS, formatEvening, upcomingEvenings } from "@/lib/meet";
import { saveFlow, useFlow } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/prefs")({
  head: () => ({
    meta: [
      { title: `만남 선호 답하기 — ${BRAND.name}` },
      { name: "description", content: "가능한 날짜와 선호 지역·음식만 고르면 대화가 열립니다." },
      { property: "og:title", content: `만남 선호 답하기 — ${BRAND.name}` },
      { property: "og:description", content: "짧게 세 가지만 고르면 됩니다." },
    ],
  }),
  component: PrefsPage,
});

function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected
          ? "border-primary bg-primary/12 font-medium text-primary-strong"
          : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PrefsPage() {
  const { flow, ready } = useFlow();
  const navigate = useNavigate();
  const candidate = flow.introId ? getCandidate(flow.introId) : null;

  const options = useMemo(() => (ready ? upcomingEvenings(5) : []), [ready]);
  const [dates, setDates] = useState<string[]>([]);
  const [area, setArea] = useState<string | null>(null);
  const [food, setFood] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const canSubmit = dates.length > 0 && area && food;

  return (
    <AppScreen title="만남 선호" hideTabs>
      <div className="mt-3">
        <GuideNote>
          두 분 모두 좋다고 하셨습니다. 가능한 날과 취향만 골라 주세요.
        </GuideNote>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">가능한 저녁</h2>
        <p className="mt-1 text-xs text-muted-foreground">여러 개 골라도 됩니다.</p>
        <div className="mt-3 space-y-2">
          {options.map((iso) => {
            const on = dates.includes(iso);
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={on}
                onClick={() => setDates((d) => (on ? d.filter((x) => x !== iso) : [...d, iso]))}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between rounded-xl border px-4 text-sm transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on
                    ? "border-primary bg-primary/10 font-medium text-primary-strong"
                    : "border-border bg-card",
                )}
              >
                {formatEvening(iso)}
                <span aria-hidden="true" className="text-xs">
                  {on ? "선택됨" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-sm font-semibold">편한 지역</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PREF_AREAS.map((a) => (
            <Chip key={a} selected={area === a} onClick={() => setArea(a)}>
              {a}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-sm font-semibold">선호하는 음식</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {PREF_FOODS.map((f) => (
            <Chip key={f} selected={food === f} onClick={() => setFood(f)}>
              {f}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <label htmlFor="note" className="text-sm font-semibold">
          덧붙일 말 (선택)
        </label>
        <Input
          id="note"
          className="mt-3"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예) 7시 반쯤이면 더 편해요"
        />
      </section>

      <Button
        className="mt-8 w-full"
        size="lg"
        disabled={!canSubmit}
        onClick={() => {
          if (!canSubmit) return;
          saveFlow({
            prefs: { dates, area: area!, food: food!, note: note.trim() || undefined },
            chatOpen: true,
          });
          toast.success("전달했습니다. 대화가 열렸어요.");
          if (candidate) navigate({ to: "/chat/$id", params: { id: candidate.id } });
          else navigate({ to: "/chats" });
        }}
      >
        세라에게 보내기
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        고른 내용은 상대에게 그대로 전달되고, 날짜와 장소는 상대가 먼저 제안합니다.
      </p>
    </AppScreen>
  );
}
