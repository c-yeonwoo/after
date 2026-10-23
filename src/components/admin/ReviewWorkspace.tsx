import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReviewHeader({
  title,
  description,
  loading,
  onRefresh,
  disabled = false,
}: {
  title: string;
  description: string;
  loading: boolean;
  onRefresh: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="min-w-0">
        <h1 tabIndex={-1} className="text-xl font-semibold tracking-tight focus:outline-none">
          {title}
        </h1>
        <p className="mt-1 break-keep text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={loading || disabled} onClick={onRefresh}>
        <RefreshCw aria-hidden="true" className="mr-2 size-4" />
        새로고침
      </Button>
    </header>
  );
}

export function ReviewError({ retry, loading }: { retry: () => void; loading: boolean }) {
  return (
    <div
      role="alert"
      className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-surface bg-destructive/8 p-4 text-sm"
    >
      <p>최신 목록을 확인하지 못했어요. 표시된 내용은 마지막 조회 결과입니다.</p>
      <Button size="sm" variant="outline" disabled={loading} onClick={retry}>
        다시 시도
      </Button>
    </div>
  );
}
