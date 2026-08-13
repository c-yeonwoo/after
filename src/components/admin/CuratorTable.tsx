import { useCallback, useEffect, useState } from "react";

import { fetchCuratorStats, type CuratorStats } from "@/lib/admin";

/**
 * 표본이 이만큼은 되어야 비율을 신뢰한다.
 *
 * 임의의 수다 — 통계적 근거가 아니라 "한 자리 수로 비율을 말하지 않는다" 는
 * 규칙이다. 1/1 을 100% 로 읽는 것이 이 화면에서 가장 쉬운 오독이고, 그 오독은
 * 사람을 평가하는 데 쓰이므로 값이 싸지 않다.
 */
const MIN_SAMPLE = 10;

const WINDOWS = [
  { days: 30, label: "최근 30일" },
  { days: 90, label: "최근 90일" },
  { days: null, label: "전체" },
] as const;

/**
 * 큐레이터별 퍼널.
 *
 * 두 비율이 성격이 다르다 — 화면에서도 갈라 놓는다.
 *   · **열람 전환율**(열람/전송) 은 단위 경제다. 큐레이션 노동이 회수되는가.
 *   · **패스율**(패스/결말난 열람) 은 품질이다. 돈 받고 연 카드가 버려지는가.
 *
 * 패스율의 분모에서 미결 건을 뺀다. 아직 결정하지 않은 사람을 "패스하지 않음"
 * 으로 세면 패스율이 실제보다 낮게 나온다.
 */
export function CuratorTable() {
  const [days, setDays] = useState<number | null>(30);
  const [rows, setRows] = useState<CuratorStats[] | null>(null);

  const load = useCallback(async (d: number | null) => {
    const since = d === null ? undefined : new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    setRows(await fetchCuratorStats(since));
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">큐레이터</h2>
        <span className="text-xs text-muted-foreground">
          큐레이션 노동이 회수되는가 · 연 카드가 버려지는가
        </span>
        <div className="ml-auto flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              onClick={() => setDays(w.days)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                days === w.days
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="mt-3 text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">이 기간에 큐레이션한 기록이 없습니다.</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <Th>큐레이터</Th>
                  <Th right>담음</Th>
                  <Th right>대기</Th>
                  <Th right>전송</Th>
                  <Th right>열람</Th>
                  <Th right>만료</Th>
                  <Th right>열람 전환</Th>
                  <Th right>패스율</Th>
                  <Th right>만남</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // 패스율 분모는 **결말이 난** 열람만이다.
                  const decided = r.passed + r.met;
                  return (
                    <tr key={r.curator_id} className="group">
                      <Td>{r.curator_name ?? "(이름 없음)"}</Td>
                      <Td right>{r.curated}</Td>
                      <Td right muted>
                        {r.waiting || "—"}
                      </Td>
                      <Td right muted>
                        {r.delivered}
                      </Td>
                      <Td right>{r.opened}</Td>
                      {/* 만료는 헛돈 노동이다 — 0 이 아니면 눈에 띄어야 한다. */}
                      <Td right alert={r.expired > 0}>
                        {r.expired || "—"}
                      </Td>
                      <Td right>
                        <Rate num={r.opened} den={r.delivered} />
                      </Td>
                      <Td right>
                        <Rate num={r.passed} den={decided} />
                      </Td>
                      <Td right muted>
                        {r.met || "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
            비율은 분모를 함께 적었습니다. 분모가 {MIN_SAMPLE}건 미만이면 흐리게 표시합니다 — 표본이
            작은 비율로 사람을 평가하지 않기 위해서입니다. 패스율의 분모는 결말이 난 열람만이고,
            아직 결정하지 않은 건은 빠집니다.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * 비율 — 분모를 항상 함께 적고, 표본이 작으면 흐리게 낸다.
 *
 * 숨기지는 않는다. 운영자가 "몇 건인지" 를 알고 보는 것과 아예 못 보는 것은
 * 다르고, 후자는 DB 를 열게 만든다.
 */
function Rate({ num, den }: { num: number; den: number }) {
  if (den === 0) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round((num / den) * 100);
  const weak = den < MIN_SAMPLE;
  return (
    <span className={weak ? "text-muted-foreground" : ""} title={weak ? "표본이 작습니다" : ""}>
      <span className="font-semibold tabular-nums">{pct}%</span>
      <span className="ml-1 text-2xs tabular-nums">
        ({num}/{den})
      </span>
    </span>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`border-b border-border px-3 py-2 font-medium ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  muted,
  alert,
}: {
  children?: React.ReactNode;
  right?: boolean;
  muted?: boolean;
  alert?: boolean;
}) {
  return (
    <td
      className={`border-b border-border px-3 py-2 tabular-nums group-hover:bg-muted/40 ${
        right ? "text-right" : ""
      } ${alert ? "font-semibold text-primary-strong" : muted ? "text-muted-foreground" : ""}`}
    >
      {children}
    </td>
  );
}
