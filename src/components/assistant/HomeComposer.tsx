import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Both the help form and private chat use the footer above the home tabs. */
export function HomeComposer({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById("assistant-home-composer"));
  }, []);
  return target ? createPortal(children, target) : <div className="mt-4">{children}</div>;
}
