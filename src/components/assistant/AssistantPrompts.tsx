import { assistantSuggestions } from "@/lib/assistantSuggestions";

export function AssistantPrompts({
  input,
  onChoose,
  disabled,
}: {
  input: string;
  onChoose: (text: string) => void;
  disabled?: boolean;
}) {
  const suggestions = assistantSuggestions(input);
  if (!suggestions.length) return null;
  return (
    <div className="assistant-prompts" role="group" aria-label="입력에 맞는 추천 질문">
      {suggestions.map((text) => (
        <button
          key={text}
          type="button"
          className="assistant-prompt pressable"
          disabled={disabled}
          onClick={() => onChoose(text)}
        >
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
