import { MessageCircleHeart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/me";
import femaleAvatar from "@/assets/concierge/female.webp";
import maleAvatar from "@/assets/concierge/male.webp";

/** 매니저의 발화에만 쓴다. 상대 메시지와 혼동하지 않는 고정된 시각 서명. */
export function AssistantMark({ className }: { className?: string }) {
  const { me } = useMe();
  const avatar = me?.gender === "female" ? "male" : me?.gender === "male" ? "female" : null;
  return (
    <span className={cn("assistant-mark", className)} aria-hidden="true">
      {avatar ? (
        <img
          src={avatar === "male" ? maleAvatar : femaleAvatar}
          data-assistant-avatar={avatar}
          alt=""
          width="512"
          height="512"
        />
      ) : (
        <MessageCircleHeart className="size-5" strokeWidth={1.8} />
      )}
    </span>
  );
}
