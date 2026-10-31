import { useMemo, type ReactNode } from "react";
import { AssistantMark } from "./AssistantMark";
import { managerParagraphs } from "@/lib/managerParagraphs";
import { cn } from "@/lib/utils";

export function ManagerMessage({
  text,
  label = "내 매니저",
  children,
  footer,
  className,
  role,
}: {
  text: string;
  label?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  role?: "status";
}) {
  const paragraphs = useMemo(() => managerParagraphs(text), [text]);
  return (
    <div className={cn("manager-message", className)} role={role}>
      <AssistantMark className="manager-message-avatar" />
      <div className="manager-message-content">
        <p className="manager-message-name">{label}</p>
        <div className="assistant-reply manager-message-bubble">
          <div className="manager-message-text">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}
