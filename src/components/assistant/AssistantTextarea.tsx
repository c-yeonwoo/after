import { useLayoutEffect, type ComponentProps, type RefObject } from "react";

function fitContent(field: HTMLTextAreaElement) {
  const style = getComputedStyle(field);
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight + borders}px`;
}

/** Content grows upward with the footer; CSS caps height before it hides the conversation. */
export function AssistantTextarea({
  inputRef,
  ...props
}: ComponentProps<"textarea"> & { inputRef: RefObject<HTMLTextAreaElement | null> }) {
  useLayoutEffect(() => {
    if (inputRef.current) fitContent(inputRef.current);
  }, [inputRef, props.value]);

  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (width === nextWidth) return;
      width = nextWidth;
      fitContent(field);
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [inputRef]);

  return <textarea {...props} ref={inputRef} rows={1} />;
}
