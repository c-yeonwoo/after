import { Button } from "@/components/ui/button";

export function LiveRefreshNotice({ retry }: { retry: () => void }) {
  return (
    <div role="status" className="mt-4 rounded-control border border-border px-4 py-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        최신 상태를 확인하지 못했어요. 마지막으로 확인한 내용을 보여드려요.
      </p>
      <Button variant="ghost" className="mt-1 min-h-11 px-0 text-xs" onClick={retry}>
        상태 다시 확인
      </Button>
    </div>
  );
}
