import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Ticket } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { getCandidate } from "@/lib/candidates";
import { demoPrefs } from "@/lib/meet";
import { saveFlow, useFlow } from "@/lib/store";

export const Route = createFileRoute("/ticket")({
  head: () => ({
    meta: [
      { title: `만남 티켓 — ${BRAND.name}` },
      { name: "description", content: "만남 티켓을 쓰면 세라가 약속 조율을 시작합니다." },
      { property: "og:title", content: `만남 티켓 — ${BRAND.name}` },
      { property: "og:description", content: "티켓 한 장으로 한 번의 만남을 준비합니다." },
    ],
  }),
  component: TicketPage,
});

function TicketPage() {
  const { flow } = useFlow();
  const navigate = useNavigate();
  const candidate = flow.introId ? getCandidate(flow.introId) : null;

  const waiting = Boolean(flow.ticketUsedAt) && !flow.prefs;

  return (
    <AppScreen title="만남 티켓" hideTabs>
      <div className="mt-3">
        <GuideNote>
          {waiting
            ? "선호를 여쭤보았습니다. 답이 오면 대화를 열어드리겠습니다."
            : "티켓을 사용하시면 제가 상대에게 가능한 날과 취향을 먼저 여쭤봅니다."}
        </GuideNote>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="bg-gradient-brand px-6 py-6">
          <Ticket className="size-5 text-primary-foreground" aria-hidden="true" />
          <p className="mt-3 text-lg font-semibold text-primary-foreground">만남 티켓 1장</p>
          <p className="mt-1 text-xs text-primary-foreground/85">
            한 번의 만남을 세라가 처음부터 끝까지 조율합니다.
          </p>
        </div>
        <ul className="space-y-2.5 px-6 py-5 text-sm">
          {[
            "상대의 가능한 날짜·지역·음식 확인",
            "확인되면 대화방 오픈",
            "예약 가능한 장소 제안과 확정",
          ].map((t) => (
            <li key={t} className="flex gap-2.5 text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
              <span className="leading-relaxed">{t}</span>
            </li>
          ))}
        </ul>
      </div>

      {waiting ? (
        <div className="mt-7 rounded-2xl border border-dashed border-border px-6 py-8 text-center">
          <p className="text-sm font-medium">답변을 기다리는 중입니다</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            보통 하루 안에 도착합니다. 도착하면 대화방이 열립니다.
          </p>
          <Button
            variant="outline"
            className="mt-5 w-full"
            onClick={() => {
              saveFlow({ prefs: demoPrefs(), chatOpen: true });
              toast.success("답변이 도착했습니다. 대화가 열렸어요.");
              if (candidate) navigate({ to: "/chat/$id", params: { id: candidate.id } });
            }}
          >
            데모: 답변 도착시키기
          </Button>
        </div>
      ) : (
        <>
          <Button
            className="mt-7 w-full"
            size="lg"
            onClick={() => {
              saveFlow({
                tickets: Math.max(flow.tickets - 1, 0),
                myAnswer: "yes",
                ticketUsedAt: new Date().toISOString(),
                prefsAskedAt: new Date().toISOString(),
              });
              toast.success("티켓을 사용했습니다. 세라가 상대에게 물어볼게요.");
            }}
          >
            {flow.tickets > 0 ? "티켓 사용하기" : "티켓 구매하고 사용하기"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            보유 티켓 {flow.tickets}장 · 상대 답변이 오지 않으면 티켓은 돌려드립니다.
          </p>
        </>
      )}
    </AppScreen>
  );
}
