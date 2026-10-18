import { useEffect, type RefObject } from "react";

export function useContentArrival(
  ref: RefObject<HTMLElement | null>,
  contentKey: string,
  enabled = true,
) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element?.animate) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const animation = element.animate(
      [
        { opacity: 0.92, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
    const stop = () => animation.cancel();
    preference.addEventListener("change", stop);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", stop);
    };
  }, [ref, contentKey, enabled]);
}
