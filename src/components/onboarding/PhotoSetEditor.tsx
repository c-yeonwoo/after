import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import { MAX_PHOTOS, MIN_PHOTOS } from "@/components/onboarding/basics";
import { uploadProfilePhoto, usePhotoUrl } from "@/lib/photo";
import { cn } from "@/lib/utils";

/**
 * 프로필 사진 묶음 편집 (s53, 2026-10-10).
 *
 * 3~6장. 첫 장이 대표 사진이고, 다른 사진을 누르면 대표로 올라간다. 순서를 끌어서
 * 바꾸는 UI 는 두지 않는다 — 모바일에서 끌기는 스크롤과 다투고, 실제로 사람들이
 * 정하고 싶은 건 "어느 걸 맨 앞에" 하나다.
 *
 * 올리는 즉시 Storage 에 올라가고(경로만 돌려받는다) 묶음 저장은 부모가 한다.
 */
export function PhotoSetEditor({
  photos,
  onChange,
}: {
  photos: string[];
  onChange: (next: string[]) => void;
}) {
  /* 경로 → 방금 고른 파일의 blob URL. 서명 URL 을 받기 전에도 바로 보이게. */
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(0);
  const room = MAX_PHOTOS - photos.length;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) toast(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);
    let next = [...photos];
    setBusy(picked.length);
    for (const file of picked) {
      try {
        const path = await uploadProfilePhoto(file);
        setPreviews((m) => ({ ...m, [path]: URL.createObjectURL(file) }));
        next = [...next, path];
        onChange(next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "사진을 올리지 못했어요.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((path, i) => (
          <Tile
            key={path}
            path={path}
            preview={previews[path]}
            index={i}
            onMakeCover={() => onChange([path, ...photos.filter((p) => p !== path)])}
            onRemove={() => onChange(photos.filter((p) => p !== path))}
          />
        ))}
        {Array.from({ length: busy }).map((_, i) => (
          <div
            key={`busy-${i}`}
            className="grid aspect-[3/4] place-items-center rounded-control bg-muted text-xs text-muted-foreground"
          >
            올리는 중…
          </div>
        ))}
        {room - busy > 0 ? (
          <label
            className={cn(
              "flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-input text-xs text-muted-foreground transition-colors hover:bg-muted",
              "focus-within:ring-2 focus-within:ring-ring",
            )}
          >
            <ImagePlus className="size-5" aria-hidden="true" />
            사진 추가
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label="프로필 사진 추가"
              onChange={(e) => {
                void add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
        {photos.length < MIN_PHOTOS
          ? `${MIN_PHOTOS}장 이상 올려 주세요 (${photos.length}/${MAX_PHOTOS})`
          : `${photos.length}/${MAX_PHOTOS}장 · 사진을 누르면 대표 사진이 돼요`}
      </p>
    </div>
  );
}

function Tile({
  path,
  preview,
  index,
  onMakeCover,
  onRemove,
}: {
  path: string;
  preview?: string;
  index: number;
  onMakeCover: () => void;
  onRemove: () => void;
}) {
  const signed = usePhotoUrl(preview ? null : path);
  const src = preview ?? signed;
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-control bg-muted">
      <button
        type="button"
        onClick={onMakeCover}
        aria-label={index === 0 ? "대표 사진" : `${index + 1}번째 사진을 대표로`}
        className="size-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {src ? <img src={src} alt="" className="size-full object-cover" /> : null}
      </button>
      {index === 0 ? (
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-foreground/80 px-1.5 py-0.5 text-2xs font-semibold text-background">
          대표
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${index + 1}번째 사진 빼기`}
        className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-foreground/70 text-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
