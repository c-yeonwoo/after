import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { FirstIntroReviewStep, FirstIntroWait } from "@/lib/api";
import { useMe } from "@/lib/me";

type Row = {
  id: string;
  name: string;
  gender: string;
  wait: FirstIntroWait;
  ready_at: string | null;
  photo_case_id: string | null;
};
const stages = {
  photo: "사진 검수",
  curation: "소개 전달 대기",
  supply: "후보 대기",
  reply: "호감 후 응답 대기",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const reviewLabels = {
  profile: "공개 프로필",
  preferences: "만남 선호",
};

function ReviewForm({
  busy,
  onRecord,
}: {
  busy: boolean;
  onRecord: (step: FirstIntroReviewStep, hours: number) => Promise<void>;
}) {
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void onRecord(form.get("step") as FirstIntroReviewStep, Number(form.get("hours")));
      }}
    >
      <label className="grid gap-1 text-xs">
        확인한 내용
        <select
          name="step"
          required
          defaultValue=""
          className="min-h-11 rounded-control bg-card px-2 text-sm"
        >
          <option value="" disabled>
            항목 선택
          </option>
          <option value="profile">공개 프로필</option>
          <option value="preferences">만남 선호</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        다음 확인
        <select
          name="hours"
          defaultValue="1"
          className="min-h-11 rounded-control bg-card px-2 text-sm"
        >
          <option value="1">1시간 뒤</option>
          <option value="3">3시간 뒤</option>
          <option value="24">24시간 뒤</option>
        </select>
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        회원 홈에 반영
      </Button>
    </form>
  );
}

export function FirstIntroWaitlist() {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["first-intro-waits", me?.id, offset],
    enabled: Boolean(me),
    retry: false,
    staleTime: 30000,
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("admin_first_intro_waits", { p_limit: 20, p_offset: offset })
        .abortSignal(signal);
      if (error) throw error;
      return data as unknown as { items: Row[]; total: number };
    },
  });
  async function schedule(row: Row, hours: number | null, step?: FirstIntroReviewStep) {
    setBusy(true);
    setError("");
    try {
      const target = {
        p_member: row.id,
        p_stage: row.wait.stage,
        p_previous: row.wait.next_check_at,
      };
      const { error } =
        step && hours !== null
          ? await supabase.rpc("admin_review_first_intro_wait", {
              ...target,
              p_step: step,
              p_hours: hours,
            })
          : await supabase.rpc("admin_set_first_intro_check", {
              ...target,
              p_next: hours === null ? null : new Date(Date.now() + hours * 3600000).toISOString(),
            });
      if (error) throw error;
    } catch {
      setError("저장하지 못했어요. 최신 대기 상태를 확인해 주세요.");
    } finally {
      await q.refetch();
      setBusy(false);
    }
  }
  return (
    <section className="rounded-surface bg-card px-4 py-2 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setOffset(0);
        }}
        className="flex min-h-12 w-full items-center justify-between text-left font-semibold"
      >
        <span>첫 소개 대기{q.data ? ` · ${q.data.total}명` : ""}</span>
        <span className="text-sm font-normal text-muted-foreground">{open ? "접기" : "보기"}</span>
      </button>
      {open && (
        <div className="pb-3">
          {q.isError ? (
            <Button variant="outline" onClick={() => void q.refetch()}>
              다시 불러오기
            </Button>
          ) : !q.data ? (
            <p role="status">불러오는 중…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                총 {q.data.total}명 · 확인 시각이 지난 회원부터
              </p>
              <ul className="mt-2 space-y-2">
                {q.data.items.map((row) => (
                  <li key={row.id} className="rounded-control bg-muted p-3 text-sm">
                    <p className="font-semibold">
                      <Link
                        to="/admin/members/$id"
                        params={{ id: row.id }}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.name}
                      </Link>{" "}
                      · {stages[row.wait.stage]}
                    </p>
                    {row.ready_at && <p>소개 준비 완료 {date(row.ready_at)}</p>}
                    {row.wait.review_step && row.wait.reviewed_at && (
                      <p>
                        최근 확인 · {reviewLabels[row.wait.review_step]} ·{" "}
                        {date(row.wait.reviewed_at)}
                      </p>
                    )}
                    {row.wait.next_check_at && (
                      <p>
                        재확인{" "}
                        <time dateTime={row.wait.next_check_at}>
                          {date(row.wait.next_check_at)}
                        </time>
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3">
                      {row.wait.stage === "photo" ? (
                        row.photo_case_id ? (
                          <Link
                            className="inline-flex min-h-11 items-center underline"
                            to="/admin/tasks"
                            search={{ caseId: row.photo_case_id }}
                            onClick={() => setOpen(false)}
                          >
                            사진 검수 작업 보기
                          </Link>
                        ) : (
                          <Link to="/admin/photos" className="py-3 underline">
                            사진 검수 보기
                          </Link>
                        )
                      ) : (
                        <>
                          {row.wait.stage === "curation" && (
                            <Link
                              to="/admin/curation"
                              search={{ male: row.id }}
                              className="py-3 underline"
                            >
                              소개 준비하기
                            </Link>
                          )}
                          {row.wait.stage === "reply" ? (
                            <button
                              type="button"
                              className="min-h-11"
                              disabled={busy}
                              onClick={() => void schedule(row, 1)}
                            >
                              1시간 뒤 재확인
                            </button>
                          ) : (
                            <ReviewForm
                              key={`${row.wait.stage}:${row.wait.next_check_at}:${row.wait.reviewed_at}`}
                              busy={busy}
                              onRecord={(step, hours) => schedule(row, hours, step)}
                            />
                          )}
                          {row.wait.next_check_at && (
                            <button
                              type="button"
                              className="min-h-11"
                              disabled={busy}
                              onClick={() => void schedule(row, null)}
                            >
                              예약 해제
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {q.data.total === 0 && (
                <p className="py-3 text-sm">첫 소개를 기다리는 회원이 없어요.</p>
              )}
              <div className="flex gap-3">
                {offset > 0 && (
                  <Button variant="ghost" onClick={() => setOffset(offset - 20)}>
                    이전
                  </Button>
                )}
                {offset + 20 < q.data.total && (
                  <Button variant="ghost" onClick={() => setOffset(offset + 20)}>
                    다음
                  </Button>
                )}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
