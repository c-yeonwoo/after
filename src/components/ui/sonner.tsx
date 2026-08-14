import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      /*
        상단 안전영역을 비켜 준다.

        iOS 검증에서 "인증 코드를 보냈습니다" 토스트가 **상태바와 다이내믹
        아일랜드를 덮었다** — 시계 위에 글자가 겹쳐 둘 다 못 읽는다. 웹에서는
        상단이 비어 있어 드러나지 않던 차이다.

        --safe-top 은 각 화면의 헤더가 쓰는 값과 같다(styles.css). 토스트만
        따로 계산하면 기기가 바뀔 때 어긋난다.
      */
      style={{ top: "var(--safe-top)" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
