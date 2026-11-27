import type { InviteBetaObservationsData, BetaWait } from "@/lib/betaObservations";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const stages = {
  profile: "프로필·심사",
  intro: "소개·호감",
  meeting: "약속 조율",
  feedback: "만남 후기",
  support: "문의·기타",
};
type Stage = keyof typeof stages;
function duration(sec: number | null) {
  if (sec === null) return "—";
  if (sec < 60) return "1분 미만";
  if (sec < 3600) return Math.floor(sec / 60) + "분";
  const h = Math.floor(sec / 3600);
  return h < 24 ? h + "시간" : Math.floor(h / 24) + "일 " + (h % 24) + "시간";
}
const rows: [string, (w: BetaWait) => string][] = [
  ["완성 → 첫 소개", (w) => median(w.total_seconds, w.total_n)],
  ["완성 → 소개 가능", (w) => median(w.review_seconds, w.review_n)],
  ["소개 가능 → 첫 소개", (w) => median(w.intro_seconds, w.intro_n)],
  ["현재 첫 카드 대기", (w) => w.waiting + "명"],
  ["가장 긴 현재 대기", (w) => duration(w.oldest_seconds)],
];
function median(sec: number | null, n: number) {
  return n ? duration(sec) + " · " + n + "명" : "표본 없음";
}
export function InviteBetaObservations({
  data,
  reload,
}: {
  data: InviteBetaObservationsData | null;
  reload: () => void;
}) {
  const [stage, setStage] = useState<Stage>("intro");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef<{ stage: Stage; id: string } | null>(null);
  const sending = useRef(false);
  async function record() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (request.current?.stage !== stage) request.current = { stage, id: crypto.randomUUID() };
      const { error } = await supabase.rpc("admin_log_beta_help", {
        p_stage: stage,
        p_request: request.current.id,
      });
      if (error) throw error;
      request.current = null;
      setNotice(stages[stage] + " 안내 1건을 기록했어요.");
      reload();
    } catch {
      setNotice("기록을 확인하지 못했어요. 같은 단계에서 다시 시도해 주세요.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const reaction = data?.reactions;
  return (
    <section
      className="rounded-surface bg-card p-4 shadow-sm sm:p-5"
      aria-labelledby="beta-observe-title"
    >
      <h2 id="beta-observe-title" className="text-lg font-semibold">
        초대 베타 관찰
      </h2>
      {!data ? (
        <p className="mt-2 text-sm text-muted-foreground">아직 집계 결과가 없습니다.</p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-base font-medium">첫 소개까지</h3>
            <table className="mt-2 w-full text-left text-sm tabular-nums">
              <caption className="sr-only">측정 구간별 여성과 남성의 대기시간</caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col">구간</th>
                  <th scope="col">여성</th>
                  <th scope="col">남성</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fmt]) => (
                  <tr key={label}>
                    <th scope="row" className="py-1.5 pr-1 font-normal">
                      {label}
                    </th>
                    <td className="pr-1">{fmt(data.waits.female)}</td>
                    <td>{fmt(data.waits.male)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              각 구간을 최근 30일에 시작한 회원의 중앙값과 표본 수예요. 여성은 첫 후보 조회, 남성은
              첫 카드 전달을 기준으로 해요. 현재 대기는 전체 기간 기준이에요.
            </p>
            <Link
              to="/admin/tasks"
              className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
            >
              첫 소개 작업함
            </Link>
          </div>
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-medium">소개 이유가 와닿았나요?</h3>
              <p className="mt-1 text-sm">
                {reaction?.total
                  ? `와닿았어요 ${reaction.yes}건 · 잘 모르겠어요 ${reaction.total - reaction.yes}건`
                  : "아직 응답이 없어요."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                최근 30일에 처음 응답한 소개 기준 · 선택 응답
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium">운영자가 도운 단계</h3>
              <table className="mt-2 w-full text-left text-sm tabular-nums">
                <caption className="sr-only">최근 30일 운영 기록과 개별 안내 횟수</caption>
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col">단계</th>
                    <th scope="col">운영 처리</th>
                    <th scope="col">별도 안내</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(stages) as Stage[]).map((k) => (
                    <tr key={k}>
                      <th scope="row" className="py-1 font-normal">
                        {stages[k]}
                      </th>
                      <td>{data.actions[k]?.logged ?? 0}건</td>
                      <td>{data.actions[k]?.manual ?? 0}건</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <details className="mt-2 text-sm">
                <summary className="min-h-11 cursor-pointer py-3 font-medium">
                  별도 안내 기록
                </summary>
                <p className="mb-2 text-xs text-muted-foreground">
                  최근 30일의 처리 횟수예요. 작업함에 남지 않은 설명이나 연락만 한 번 기록해 주세요.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="개별 안내 단계"
                    className="min-h-11 rounded-control bg-muted px-2"
                    value={stage}
                    disabled={busy}
                    onChange={(e) => {
                      setStage(e.target.value as Stage);
                      setNotice("");
                    }}
                  >
                    {(Object.keys(stages) as Stage[]).map((k) => (
                      <option key={k} value={k}>
                        {stages[k]}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void record()}>
                    안내 1건 기록
                  </Button>
                </div>
                <p role="status" className="mt-1 text-xs">
                  {notice}
                </p>
              </details>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
