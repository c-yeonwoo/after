import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Tag } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HUBS, OPEN_HUBS } from "@/lib/brand";
import {
  fetchMeetPlaces,
  upsertMeetPlace,
  type MeetPlaceInput,
  type MeetPlaceRow,
} from "@/lib/admin";
import { stationsFor } from "@/lib/meet";

export const Route = createFileRoute("/admin/places")({
  component: PlacesTab,
});

const KINDS = [
  { v: "cafe", label: "카페" },
  { v: "restaurant", label: "식당" },
  { v: "bar", label: "바" },
  { v: "etc", label: "기타" },
] as const;

const EMPTY: MeetPlaceInput = {
  id: null,
  hubId: OPEN_HUBS[0]?.id ?? HUBS[0].id,
  name: "",
  station: "",
  kind: "cafe",
  address: "",
  mapUrl: "",
  note: "",
  active: true,
};

/**
 * 약속 장소 목록 (s51, D1-B).
 *
 * 남성이 만남을 요청할 때 고르는 "퇴근길에 들르기 좋은 곳". 예약하지 않는다 — 추천일
 * 뿐이다. 목록이 비어 있으면 회원 화면은 장소를 직접 적게 한다. 그래서 이 목록을 채우는
 * 것이 "약속까지 잡아 드린다" 를 실제로 지키는 운영 일이다.
 *
 * 숨기기만 하고 지우지 않는다. 지난 약속이 이 장소를 가리키고 있을 수 있다.
 */
function PlacesTab() {
  const [rows, setRows] = useState<MeetPlaceRow[] | null>(null);
  const [form, setForm] = useState<MeetPlaceInput>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchMeetPlaces());
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (patch: Partial<MeetPlaceInput>) => setForm((f) => ({ ...f, ...patch }));
  const valid =
    form.name.trim() && form.station.trim() && (!form.mapUrl || form.mapUrl.startsWith("https://"));

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
      <section className="min-w-0">
        <h2 className="text-lg font-semibold">약속 장소</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          회원은 자기 권역의 "사용" 장소만 봅니다. 예약은 하지 않습니다.
        </p>
        {rows === null ? (
          <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-surface border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            아직 장소가 없습니다. 비어 있으면 회원이 장소를 직접 적습니다.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-surface border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">역</th>
                  <th className="px-3 py-2 font-medium">종류</th>
                  <th className="px-3 py-2 font-medium">권역</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-medium">{r.name}</span>
                      {r.note ? (
                        <span className="block text-xs text-muted-foreground">{r.note}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{r.station}</td>
                    <td className="px-3 py-2">
                      {KINDS.find((k) => k.v === r.kind)?.label ?? r.kind}
                    </td>
                    <td className="px-3 py-2">
                      {HUBS.find((h) => h.id === r.hub_id)?.label ?? r.hub_id}
                    </td>
                    <td className="px-3 py-2">
                      {r.active ? <Tag tone="alert">사용</Tag> : <Tag tone="muted">숨김</Tag>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setForm({
                            id: r.id,
                            hubId: r.hub_id,
                            name: r.name,
                            station: r.station,
                            kind: r.kind,
                            address: r.address ?? "",
                            mapUrl: r.map_url ?? "",
                            note: r.note ?? "",
                            active: r.active,
                          })
                        }
                      >
                        고치기
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="min-w-0">
        <form
          className="space-y-3 rounded-surface border border-border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            try {
              await upsertMeetPlace(form);
              toast.success(form.id ? "장소를 고쳤습니다." : "장소를 추가했습니다.");
              setForm(EMPTY);
              await load();
            } catch (err) {
              toast.error(
                typeof err === "object" && err && "message" in err
                  ? String((err as { message: unknown }).message)
                  : "저장하지 못했습니다.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="text-sm font-semibold">{form.id ? "장소 고치기" : "장소 추가"}</h3>
          <label className="block text-xs text-muted-foreground" htmlFor="place-hub">
            권역
          </label>
          <select
            id="place-hub"
            className="h-10 w-full rounded-field border border-input bg-card px-3 text-sm"
            value={form.hubId}
            onChange={(e) => set({ hubId: e.target.value, station: "" })}
          >
            {HUBS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
                {h.available ? "" : " (준비 중)"}
              </option>
            ))}
          </select>
          <Input
            aria-label="이름"
            placeholder="이름 (예: ○○ 커피 역삼점)"
            maxLength={60}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <select
            aria-label="가까운 역"
            className="h-10 w-full rounded-field border border-input bg-card px-3 text-sm"
            value={form.station}
            onChange={(e) => set({ station: e.target.value })}
          >
            <option value="">가까운 역</option>
            {stationsFor(form.hubId).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="종류"
            className="h-10 w-full rounded-field border border-input bg-card px-3 text-sm"
            value={form.kind}
            onChange={(e) => set({ kind: e.target.value })}
          >
            {KINDS.map((k) => (
              <option key={k.v} value={k.v}>
                {k.label}
              </option>
            ))}
          </select>
          <Input
            aria-label="주소"
            placeholder="주소 (선택)"
            maxLength={120}
            value={form.address}
            onChange={(e) => set({ address: e.target.value })}
          />
          <Input
            aria-label="지도 링크"
            placeholder="지도 링크 https://… (선택)"
            value={form.mapUrl}
            onChange={(e) => set({ mapUrl: e.target.value })}
          />
          <Input
            aria-label="한마디"
            placeholder="회원에게 보일 한마디 (선택, 예: 조용한 2층)"
            maxLength={120}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.active}
              onChange={(e) => set({ active: e.target.checked })}
            />
            회원에게 보이기
          </label>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={!valid || busy} className="flex-1">
              {busy ? "저장 중…" : form.id ? "고치기" : "추가"}
            </Button>
            {form.id ? (
              <Button type="button" variant="ghost" onClick={() => setForm(EMPTY)}>
                취소
              </Button>
            ) : null}
          </div>
        </form>
      </aside>
    </div>
  );
}
