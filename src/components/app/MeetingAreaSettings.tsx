import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MeetingAreaPicker } from "@/components/onboarding/MeetingAreaPicker";
import { myMeetingAreas, saveMeetingAreas } from "@/lib/meetingAreas";
import type { Profile } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useQueryClient } from "@tanstack/react-query";

export function MeetingAreaSettings({ member }: { member: Profile }) {
  const { setMe } = useMe();
  const query = useQueryClient();
  const [primary, setPrimary] = useState(member.hub_id === "undecided" ? "" : member.hub_id);
  const [areas, setAreas] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = useRef(false);
  const lock = useRef(false);
  useEffect(() => {
    active.current = true;
    let alive = true;
    setError(false);
    void myMeetingAreas()
      .then((value) => {
        if (alive) {
          setAreas(value);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
      active.current = false;
    };
  }, [retry]);
  return (
    <section className="mt-6 rounded-surface bg-card p-4" aria-labelledby="meeting-area-title">
      <h2 id="meeting-area-title" className="text-base font-semibold">
        만나기 편한 곳
      </h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        직장 위치와 달라도 괜찮아요. 범위는 직접 정해요.
      </p>
      {!loaded ? (
        error ? (
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            지역 설정 다시 불러오기
          </Button>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            지역 설정을 불러오고 있어요.
          </p>
        )
      ) : (
        <>
          <MeetingAreaPicker
            primary={primary}
            areas={areas}
            disabled={busy}
            onChange={(next, selected) => {
              setPrimary(next);
              setAreas(selected);
              setMessage("");
            }}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            변경하면 새 소개에 적용해요. 이미 열린 소개와 약속은 유지돼요.
          </p>
          <Button
            className="mt-4"
            disabled={busy || !primary || !areas.length}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setMessage("");
              try {
                const profile = await saveMeetingAreas(primary, areas);
                if (!active.current) return;
                setMe(profile);
                await query.invalidateQueries({
                  queryKey: ["member-home", member.id],
                  exact: true,
                });
                if (active.current) {
                  setMessage("만남 지역을 저장했어요.");
                  setError(false);
                }
              } catch {
                if (active.current) {
                  setMessage("저장하지 못했어요. 다시 시도해 주세요.");
                  setError(true);
                }
              } finally {
                lock.current = false;
                if (active.current) setBusy(false);
              }
            }}
          >
            {busy ? "저장 중…" : "지역 저장"}
          </Button>
          {message ? (
            <p role={error ? "alert" : "status"} className="mt-2 text-sm">
              {message}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
