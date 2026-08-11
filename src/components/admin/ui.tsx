/** 운영 화면 공용 표시 조각. 저장값 → 라벨 변환은 labels.ts 에 있다. */
export function Tag({ children, tone }: { children: React.ReactNode; tone: "muted" | "alert" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-2xs ${
        tone === "alert" ? "bg-primary/10 text-primary-strong" : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}
