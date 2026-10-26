import { ArrowUpLeft } from "lucide-react";
import { assistantSuggestions } from "@/lib/assistantSuggestions";

export function AssistantPrompts({
  input,
  onChoose,
  disabled,
  canCoach = true,
}: {
  input: string;
  onChoose: (text: string) => void;
  disabled?: boolean;
  canCoach?: boolean;
}) {
  const suggestions = assistantSuggestions(input, canCoach);
  if (!suggestions.length) return null;
  return (
    <div
      className="assistant-prompts"
      role="group"
      aria-label={input.trim() ? "입력에 맞는 추천 질문" : "질문 예시"}
    >
      {suggestions.map((text) => (
        <button
          key={text}
          type="button"
          className="assistant-prompt pressable"
          disabled={disabled}
          onClick={() => onChoose(text)}
        >
          <span>{text}</span>
          <ArrowUpLeft className="size-4 shrink-0" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
