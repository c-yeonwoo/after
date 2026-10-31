import {
  PROFILE_CHOICES,
  publicProfileSignals,
  type PublicProfileSignals,
} from "../../../supabase/functions/_shared/profile-signals";
import { Chip } from "./Chip";
import { Button } from "@/components/ui/button";

/** Optional, concrete preferences. Private coordination answers never enter this form. */
export function PublicSignalEditor({
  value,
  previous,
  onChange,
}: {
  value: PublicProfileSignals;
  previous?: unknown;
  onChange: (value: PublicProfileSignals) => void;
}) {
  const selected = publicProfileSignals(value);
  const prior = publicProfileSignals(previous);
  const ids = [
    "relationship_goal",
    "care",
    "rhythm",
    "first_date",
    ...["closeness", "topics"].filter((id) => selected[id]?.length || prior[id]?.length),
  ];
  return (
    <section aria-labelledby="profile-style-title" className="space-y-5">
      <div>
        <h2 id="profile-style-title" className="text-base font-semibold">
          만남 스타일
        </h2>
        <p className="mt-1 break-keep text-sm leading-relaxed text-muted-foreground">
          선택한 답은 프로필과 매니저의 소개에 쓰여요. 모두 건너뛰어도 괜찮아요.
        </p>
      </div>
      {Object.keys(prior).some((id) => !selected[id]?.length) ? (
        <Button size="sm" variant="ghost" onClick={() => onChange({ ...prior, ...selected })}>
          이전에 고른 답 불러오기
        </Button>
      ) : null}
      {ids.map((id) => {
        const q = PROFILE_CHOICES.find((question) => question.id === id)!;
        return (
          <fieldset key={id} className="min-w-0">
            <legend className="break-keep text-sm font-medium">{q.title}</legend>
            <p className="mt-1 text-xs text-muted-foreground">
              선택 · {q.max === 1 ? "한 가지" : `최대 ${q.max}가지`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((option) => (
                <Chip
                  key={option}
                  selected={selected[id]?.includes(option) ?? false}
                  onClick={() => {
                    const values = selected[id] ?? [];
                    onChange({
                      ...value,
                      [id]: values.includes(option)
                        ? values.filter((item) => item !== option)
                        : [...values, option].slice(-q.max),
                    });
                  }}
                >
                  {option}
                </Chip>
              ))}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
