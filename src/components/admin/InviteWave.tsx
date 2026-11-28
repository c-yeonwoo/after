import { useState } from "react";
import { Copy } from "lucide-react";
import { waveInviteUrl } from "@/lib/waveInvite";
import type { InviteBetaObservationsData, WaveSeat } from "@/lib/betaObservations";

const stageLabels = {
  issued: "링크 열기 전",
  opened: "초대장 확인 · 시작 전",
  signup: "가입·로그인 중",
  verification: "가입 인증 중",
  profile: "프로필 작성 중",
  revision: "사진 보완 필요",
  review: "프로필 심사 대기",
  requirements: "필수 정보 확인 필요",
  first_wait: "첫 소개 대기",
  first_intro: "첫 소개 전달 · 만남 전",
  coordination: "약속 조율 중",
  scheduled: "약속 확정 · 만남 전",
  feedback: "만남 후기 대기",
  no_meeting: "만남 불발 후기 접수",
  prior_unobserved: "기존 후기 · 다음 소개 반영 미확인",
  no_preference: "후기 완료 · 선호 미선택",
  second_wait: "후기 접수 · 다음 소개 대기",
  not_reflected: "두 번째 소개 · 후기 미반영",
  reflected: "두 번째 소개 · 후기 반영",
  prior_reflected: "참여 전 후기 반영 완료",
  paused: "소개 중지",
  ended: "참여 종료",
} as const;

export function InviteWave({
  seats,
  attendance,
}: {
  seats: WaveSeat[];
  attendance?: InviteBetaObservationsData["wave_attendance"];
}) {
  const [notice, setNotice] = useState("");
  const [manual, setManual] = useState("");
  async function copy(code: string, label: string) {
    const link = waveInviteUrl(code);
    try {
      await navigator.clipboard.writeText(link);
      setManual("");
      setNotice(label + " 링크를 복사했어요.");
    } catch {
      setManual(link);
      setNotice(label + " 링크를 선택해 복사해 주세요.");
    }
  }
  return (
    <section className="lg:col-span-2" aria-label="1차 초대 진행">
      <h3 className="text-base font-semibold">1차 초대 진행</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        참여 {seats.filter((s) => s.code === null && s.stage !== "ended").length}/{seats.length}명 ·
        참여 후 후기 반영 {seats.filter((s) => s.stage === "reflected").length}명
      </p>
      {attendance && (
        <div className="mt-3 rounded-control bg-surface-subtle p-3 text-sm">
          <p className="font-semibold">첫 14일 · 두 사람이 확인한 만남</p>
          <p className="mt-1">
            {attendance.matured
              ? `${attendance.meetings}건 · 참여 ${attendance.attendees}/${attendance.matured}명`
              : "14일 관찰을 마친 참여자가 아직 없어요."}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            초대 참여와 프로필 준비를 모두 확인한 날부터 14일을 봐요. 이 기간에 요청한 약속에 두
            사람 모두 만났다고 후기를 남기면 1건이에요. 관찰 중 {attendance.observing}명 · 준비 시점
            미확인 {attendance.no_clock}명 · 참여 종료로 집계 제외 {attendance.unlinked}명
          </p>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(["female", "male"] as const).map((gender) => {
          const label = gender === "female" ? "여성" : "남성";
          return (
            <ul
              key={gender}
              aria-label={label + " 초대"}
              className="rounded-control bg-muted/60 px-3 py-1"
            >
              {seats
                .filter((s) => s.gender === gender)
                .map((s) => (
                  <li key={s.seat} className="flex min-h-12 items-center gap-3 py-1 text-sm">
                    <span className="shrink-0 font-medium">
                      {label} {s.seat}
                    </span>
                    <span>
                      {stageLabels[s.stage as keyof typeof stageLabels] ?? "상태 확인 필요"}
                    </span>
                    {s.code && (
                      <button
                        type="button"
                        aria-label={label + " " + s.seat + " 링크 복사"}
                        className="ml-auto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground"
                        onClick={() => void copy(s.code!, label + " " + s.seat)}
                      >
                        <Copy size={16} />
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          );
        })}
      </div>
      <p role="status" className="mt-1 text-xs text-muted-foreground">
        {notice}
      </p>
      {manual && (
        <input
          aria-label="복사할 초대 링크"
          className="w-full rounded-control bg-muted p-2 text-sm"
          value={manual}
          readOnly
          onFocus={(e) => e.target.select()}
        />
      )}
    </section>
  );
}
