import { Link } from "@tanstack/react-router";

/** The same explicit notice is shown at signup and to existing members once. */
export function ManagerConsentNotice({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="py-4">
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label="AI 맞춤 상담 동의 (선택)"
          className="mt-0.5 size-5 shrink-0 accent-selection"
        />
        <span>
          <span className="font-semibold">AI 맞춤 상담</span>{" "}
          <span className="text-muted-foreground">(선택)</span>
        </span>
      </label>
      <p className="mt-2 pl-8 text-xs leading-relaxed text-muted-foreground">
        내 공개 프로필(나이·직업·활동 지역·MBTI·소개글), 상담과 관련 이전 대화를 Anthropic AI에 보내
        맞춤 조언을 받아요. 대화는 초기화·동의 철회·탈퇴 전까지 보관해요. 연락처·건강 등 민감한
        내용은 입력하지 마세요.
      </p>
      <p className="mt-2 pl-8 text-xs leading-relaxed text-muted-foreground">
        동의하지 않아도 가입·소개·약속 기능은 이용할 수 있어요. 상담 동의는 대화 설정에서 철회할 수
        있어요.
      </p>
      <Link
        to="/privacy"
        target="_blank"
        className="ml-8 inline-flex min-h-11 items-center text-xs font-semibold text-primary-strong underline underline-offset-4"
      >
        개인정보 처리 안내
      </Link>
    </div>
  );
}
