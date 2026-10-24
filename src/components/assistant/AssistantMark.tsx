import { MessageCircleHeart } from "lucide-react";
import { cn } from "@/lib/utils";

/** 비서의 발화에만 쓴다. 상대 메시지와 혼동하지 않는 고정된 시각 서명. */
export function AssistantMark({ className }: { className?: string }) {
  return (
    <span className={cn("assistant-mark", className)} aria-hidden="true">
      <MessageCircleHeart className="size-5" strokeWidth={1.8} />
    </span>
  );
}
