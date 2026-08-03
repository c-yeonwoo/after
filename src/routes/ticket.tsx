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
  unusedTicketCount,
  redeemMeetingTicket,
  type Meeting,
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
  const [busy, setBusy] = useState(false);

  async function load() {
    const opened = await getOpenIntroWithCandidate();
    setIntroId(opened?.intro.id ?? null);
    setMeeting(opened ? await getMeetingByIntro(opened.intro.id) : null);
    setTickets(await unusedTicketCount());
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
            "상대의 가능한 날짜·지역 확인",
            "확인되면 대화방 오픈",
            "장소·시간은 두 분이 정합니다",
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
      ) : (
        <>
          <Button
            className="mt-7 w-full"
            size="lg"
            disabled={busy || !introId || tickets <= 0}
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
            {tickets > 0 ? "티켓 사용하기" : "보유한 티켓이 없습니다"}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            보유 티켓 {tickets}장 · 티켓 한 장 {MEETING_TICKET_PRICE_LABEL} · 상대 답변이 24시간
            내에 오지 않으면 티켓은 자동으로 돌려드립니다.
          </p>
        </>
      )}
    </AppScreen>
  );
}
