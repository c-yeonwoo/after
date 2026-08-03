import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Ticket } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { Button } from "@/components/ui/button";
import { BRAND, MEETING_TICKET_PRICE_LABEL } from "@/lib/brand";
import {
  getOpenIntroWithCandidate,
  getMeetingByIntro,
  myPendingTicketOrder,
  requestTicketOrder,
  unusedTicketCount,
  redeemMeetingTicket,
  type Meeting,
  type TicketOrder,
} from "@/lib/api";

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [introId, setIntroId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [tickets, setTickets] = useState(0);
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const opened = await getOpenIntroWithCandidate();
    setIntroId(opened?.intro.id ?? null);
    setMeeting(opened ? await getMeetingByIntro(opened.intro.id) : null);
    setTickets(await unusedTicketCount());
    setOrder(await myPendingTicketOrder());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const waiting = Boolean(meeting) && !meeting?.prefs_submitted_at;

  if (loading) {
    return (
      <AppScreen title="만남 티켓" hideTabs back="/intro">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="만남 티켓" hideTabs back="/intro">
      <div className="mt-3">
        <GuideNote introduce>
          {waiting
            ? "선호를 여쭤보았습니다. 답이 오면 대화를 열어드리겠습니다."
            : "티켓을 사용하시면 제가 상대에게 가능한 날과 취향을 먼저 여쭤봅니다."}
        </GuideNote>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="bg-gradient-brand px-6 py-6">
          <Ticket className="size-5 text-primary-foreground" aria-hidden="true" />
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold text-primary-foreground">만남 티켓 1장</p>
            <p className="text-lg font-semibold text-primary-foreground">
              {MEETING_TICKET_PRICE_LABEL}
            </p>
          </div>
          <p className="mt-1 text-xs text-primary-foreground/85">
            한 번의 만남을 세라가 조율을 도와드립니다.
          </p>
        </div>
        <ul className="space-y-2.5 px-6 py-5 text-sm">
          {[
            "답이 없으면 24시간 뒤 전액 돌려드립니다",
            "상대가 답하면 대화가 열립니다",
            "장소와 시간은 두 분이 정합니다",
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
            답이 도착하면 대화방이 열립니다. 24시간 안에 응답이 없으면 티켓은 자동으로 환불됩니다.
          </p>
        </div>
      ) : meeting ? (
        <Button className="mt-7 w-full" size="lg" onClick={() => navigate({ to: "/chats" })}>
          대화방으로 이동
        </Button>
      ) : tickets > 0 ? (
        <>
          <Button
            className="mt-7 w-full"
            size="lg"
            disabled={busy || !introId}
            onClick={async () => {
              if (!introId) return;
              setBusy(true);
              try {
                const created = await redeemMeetingTicket(introId);
                setMeeting(created);
                toast.success("티켓을 사용했습니다. 세라가 상대에게 물어볼게요.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "티켓 사용에 실패했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          >
            티켓 사용하기
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">보유 티켓 {tickets}장</p>
        </>
      ) : order ? (
        <div className="mt-7 rounded-2xl border border-primary/30 bg-primary/8 px-6 py-7 text-center">
          <p className="text-sm font-semibold text-primary-strong">신청을 받았습니다</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            티켓이 준비되면 이 화면에서 바로 사용하실 수 있습니다. 그때까지 소개는 그대로 열려 있고,
            넘어가지 않습니다.
          </p>
        </div>
      ) : (
        <>
          {/*
            결제 연동 전에도 누를 수 있는 것이 있어야 한다. 예전에는 비활성 버튼
            하나("보유한 티켓이 없습니다")가 전부여서 사이클이 여기서 끊겼다 —
            가격만 보여주고 살 방법을 주지 않는 화면이었다(진단 UX-7).
            보낼 수 없는 알림을 약속하지 않는다. 확인 가능한 사실만 적는다.
          */}
          <Button
            className="mt-7 w-full"
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setOrder(await requestTicketOrder());
                toast.success("신청을 받았습니다.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "신청에 실패했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "신청하는 중…" : "티켓 신청하기"}
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            티켓 한 장 {MEETING_TICKET_PRICE_LABEL}. 결제 수단을 여는 중이라 지금은 신청만 받고
            있습니다. 신청해 두시면 이 소개는 넘어가지 않고 기다립니다.
          </p>
        </>
      )}
    </AppScreen>
  );
}
