import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, UserRound, ZoomIn, ZoomOut } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { photoUrl } from "@/lib/photo";

function useProfilePhoto(path: string) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    photoUrl(path)
      .then((url) => {
        if (cancelled) return;
        setSrc(url);
        setFailed(!url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { src, failed, onError: () => setFailed(true) };
}

function PhotoTile({
  path,
  name,
  index,
  onOpen,
}: {
  path: string;
  name: string;
  index: number;
  onOpen: (button: HTMLButtonElement) => void;
}) {
  const { src, failed, onError } = useProfilePhoto(path);
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      disabled={!src || failed}
      aria-label={`${name} 프로필 사진 ${index + 1} 크게 보기`}
      className="relative aspect-[3/4] w-[56%] shrink-0 snap-start overflow-hidden rounded-surface bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none active:opacity-80 disabled:cursor-default"
    >
      {src && !failed ? (
        <>
          <img
            src={src}
            alt={`${name} 프로필 사진 ${index + 1}`}
            loading={index > 1 ? "lazy" : "eager"}
            onError={onError}
            className="size-full object-cover"
          />
          <span
            className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-control bg-background/90 text-foreground"
            aria-hidden="true"
          >
            <Expand className="size-4" />
          </span>
        </>
      ) : (
        <span className="grid size-full place-content-center justify-items-center gap-2 text-xs text-muted-foreground">
          <UserRound className="size-8" aria-hidden="true" />
          {failed ? "사진을 불러오지 못했어요" : "사진 불러오는 중"}
        </span>
      )}
    </button>
  );
}

function FullPhoto({ path, name, index }: { path: string; name: string; index: number }) {
  // A keyed instance prevents the previous person's/photo's signed URL flashing on navigation.
  const { src, failed, onError } = useProfilePhoto(path);
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <div
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-control bg-muted"
        tabIndex={zoomed ? 0 : undefined}
        aria-label={zoomed ? "확대한 사진 스크롤 영역" : undefined}
      >
        {src && !failed ? (
          <div
            className={
              zoomed
                ? "grid h-[200%] w-[200%] place-items-center"
                : "grid h-full w-full place-items-center"
            }
          >
            <img
              src={src}
              alt={`${name} 프로필 사진 ${index + 1} 확대`}
              onError={onError}
              className="h-full w-full min-h-0 object-contain"
            />
          </div>
        ) : (
          <p
            role="status"
            className="grid h-full place-items-center px-4 text-center text-sm text-muted-foreground"
          >
            {failed
              ? "사진을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요."
              : "사진을 불러오는 중이에요."}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={!src || failed}
        onClick={() => setZoomed((value) => !value)}
        aria-pressed={zoomed}
        className="self-center"
      >
        {zoomed ? <ZoomOut aria-hidden="true" /> : <ZoomIn aria-hidden="true" />}
        {zoomed ? "원래 크기로" : "더 크게 보기"}
      </Button>
    </>
  );
}

export function ProfilePhotos({ paths, name }: { paths: string[]; name: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const index = selected ?? 0;
  if (!paths.length) return null;
  return (
    <>
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none]"
        role="region"
        aria-label={`${name} 사진 ${paths.length}장`}
      >
        {paths.map((path, i) => (
          <PhotoTile
            key={path}
            path={path}
            name={name}
            index={i}
            onOpen={(button) => {
              opener.current = button;
              setSelected(i);
            }}
          />
        ))}
      </div>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="flex h-[min(90dvh,900px)] max-h-[90dvh] max-w-3xl flex-col gap-3 overflow-hidden p-3 pt-4 sm:p-5"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          onKeyDown={(event) => {
            // When zoomed, arrow keys belong to the scrollable image.
            if (
              (event.target as HTMLElement).getAttribute("aria-label") === "확대한 사진 스크롤 영역"
            )
              return;
            if (event.key === "ArrowRight" && index < paths.length - 1) {
              event.preventDefault();
              setSelected(index + 1);
            }
            if (event.key === "ArrowLeft" && index > 0) {
              event.preventDefault();
              setSelected(index - 1);
            }
          }}
        >
          <DialogTitle className="pr-10 text-base">{name}님의 사진</DialogTitle>
          <DialogDescription className="sr-only">
            사진을 크게 보고 이전·다음 사진으로 이동할 수 있어요.
          </DialogDescription>
          {selected !== null && paths[index] ? (
            <FullPhoto key={paths[index]} path={paths[index]} name={name} index={index} />
          ) : null}
          <div className="flex items-center justify-center gap-5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="이전 사진"
              disabled={index === 0}
              onClick={() => setSelected(index - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <p
              role="status"
              className="min-w-12 text-center text-sm tabular-nums text-muted-foreground"
            >
              {index + 1} / {paths.length}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="다음 사진"
              disabled={index === paths.length - 1}
              onClick={() => setSelected(index + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
