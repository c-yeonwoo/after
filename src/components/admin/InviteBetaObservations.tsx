import { InviteWave } from "./InviteWave";
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
          {data.wave_one && <InviteWave seats={data.wave_one} />}
          {data.pool && data.followup && (
            <section
              className="rounded-control bg-muted/60 p-4 lg:col-span-2"
              aria-label="모집 현황"
            >
              <h3 className="font-medium">이번 주 소개 가능</h3>
              <p className="text-xs text-muted-foreground">
                {data.pool.week_start.slice(5).replace("-", ".")}–
                {data.pool.week_end.slice(5).replace("-", ".")} · 한국 시간 · 현재 기준
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
                {(
                  [
                    ["여성", data.pool.women, data.pool.women_with_slot],
                    ["남성", data.pool.men, data.pool.men_with_slot],
                  ] as const
                ).map(([label, count, scheduled]) => (
                  <div key={label}>
                    <dt className="text-sm">{label}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{count}명</dd>
                    <dd className="text-xs text-muted-foreground">
                      이번 주 시간도 겹침 {scheduled}명
                    </dd>
                  </div>
                ))}
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-sm">후기가 반영된 두 번째 소개</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {data.followup.reflected}명
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    누적 · 후기 선호 선택 {data.followup.reviewed}명 · 다음 소개 확인{" "}
                    {data.followup.shown}명
                  </dd>
                </div>
              </dl>
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="w-fit cursor-pointer py-2">집계 기준</summary>
                <p className="max-w-prose leading-relaxed">
                  여성은 결정할 상대가 있는 분, 남성은 받은 호감 중 카드를 전달하거나 열 수 있는
                  분이에요. 후보가 여럿이어도 한 명으로 세요. 시간은 두 분이 등록한 요일이 이번 주
                  남은 추천 일정에서 겹칠 때만 표시해요.
                </p>
                <p className="mt-2 max-w-prose leading-relaxed">
                  두 번째 소개는 집계 시작 후 첫 만남 후기에서 선호를 고르고, 처음 보는 다음 상대의
                  카드에서 그 선호가 소개 이유로 전달된 회원 수예요.
                </p>
              </details>
            </section>
          )}
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
