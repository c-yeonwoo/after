import { Check, Clock3, CreditCard, CircleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PaymentState({
  tone = "notice",
  title,
  children,
}: {
  tone?: "success" | "checking" | "notice" | "error";
  title: string;
  children: ReactNode;
}) {
  const Icon: LucideIcon = {
    success: Check,
    checking: Clock3,
    notice: CreditCard,
    error: CircleAlert,
  }[tone];
  return (
    <section className="app-elevated mt-3 rounded-surface bg-card px-5 py-8 text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-surface-subtle text-primary">
        <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h2 className="text-xl font-semibold text-balance break-keep tracking-[-0.025em]">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-pretty break-keep text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
