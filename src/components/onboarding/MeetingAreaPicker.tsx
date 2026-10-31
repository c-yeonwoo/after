import { HUBS } from "@/lib/brand";
import { CAPITAL_AREAS } from "@/lib/meetingAreas";
import { Chip } from "./Chip";

export function MeetingAreaPicker({
  primary,
  areas,
  onChange,
  disabled = false,
}: {
  primary: string;
  areas: string[];
  onChange: (primary: string, areas: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-5">
      <div>
        <label htmlFor="meeting-primary-area" className="text-sm font-semibold">
          가장 편한 지역
        </label>
        <select
          id="meeting-primary-area"
          className="mt-2 h-12 w-full rounded-field bg-muted px-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
          value={primary}
          onChange={(event) => {
            const value = event.target.value;
            onChange(value, [...new Set([value, ...areas])]);
          }}
        >
          <option value="" disabled>
            지역을 골라 주세요
          </option>
          {HUBS.map((area) => (
            <option key={area.id} value={area.id}>
              {area.label}
            </option>
          ))}
        </select>
      </div>
      {primary ? (
        <div>
          <p className="text-sm font-semibold">
            이곳에서도 만날 수 있어요{" "}
            <span className="font-normal text-muted-foreground">(선택)</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            선택한 지역이 겹치는 분을 소개해요. 가장 편한 지역을 우선해요.
          </p>
          {CAPITAL_AREAS.includes(primary) ? (
            <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-foreground"
                checked={CAPITAL_AREAS.every((id) => areas.includes(id))}
                onChange={(event) =>
                  onChange(
                    primary,
                    event.target.checked
                      ? [...new Set([...areas, ...CAPITAL_AREAS])]
                      : areas.filter((id) => id === primary || !CAPITAL_AREAS.includes(id)),
                  )
                }
              />
              서울·경기·인천 모두 괜찮아요
            </label>
          ) : null}
          <label className="mt-3 block text-sm" htmlFor="meeting-extra-area">
            다른 지역 추가
          </label>
          <select
            id="meeting-extra-area"
            value=""
            className="mt-2 h-12 w-full rounded-field bg-muted px-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
            onChange={(event) => {
              if (event.target.value) onChange(primary, [...areas, event.target.value]);
            }}
          >
            <option value="">원하는 지역을 더 골라 주세요</option>
            {HUBS.filter((area) => !areas.includes(area.id)).map((area) => (
              <option key={area.id} value={area.id}>
                {area.label}
              </option>
            ))}
          </select>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="추가 만남 지역">
            {HUBS.filter((area) => area.id !== primary && areas.includes(area.id)).map((area) => (
              <Chip
                key={area.id}
                selected
                onClick={() =>
                  onChange(
                    primary,
                    areas.filter((id) => id !== area.id),
                  )
                }
              >
                {area.label} 해제
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
