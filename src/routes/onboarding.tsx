import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Check, Coffee, Wine } from "lucide-react";
import { toast } from "sonner";

import { StepShell } from "@/components/onboarding/StepShell";
import { INTERVIEW_QUESTIONS, buildDraftIntro } from "@/components/onboarding/interview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BRAND, FIRST_MEETING_PROTOCOL, HUBS, isCompanyEmail } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: `가입 · 퇴근존 인증 — ${BRAND.name}` },
      {
        name: "description",
        content:
          "퇴근존 선택, 회사 이메일 직장 인증, AI 인터뷰 프로필까지 1분이면 끝나는 가입 절차입니다.",
      },
      { property: "og:title", content: `가입 · 퇴근존 인증 — ${BRAND.name}` },
      {
        property: "og:description",
        content: "퇴근존 선택 · 회사 이메일 인증 · AI 인터뷰 프로필",
      },
    ],
  }),
  component: Onboarding,
});

const TOTAL = 5;
type Gender = "female" | "male";
type DrinkPref = "cafe_only" | "open_to_drink";

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [gender, setGender] = useState<Gender | null>(null);
  const [hubId, setHubId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [intro, setIntro] = useState("");
  const [drinkPref, setDrinkPref] = useState<DrinkPref>("cafe_only");

  const question = INTERVIEW_QUESTIONS[qIndex];
  const answered = (answers[question?.id ?? ""] ?? "").trim().length >= 10;
  const emailValid = email.includes("@") && isCompanyEmail(email);

  const draft = useMemo(() => buildDraftIntro(answers), [answers]);

  function goProfile() {
    setIntro(draft);
    setStep(5);
  }

  if (step === 1) {
    return (
      <StepShell
        step={1}
        total={TOTAL}
        eyebrow="가입"
        title="성별을 알려주세요"
        description="프로필과 매칭에 사용되며, 가입 후에는 바꿀 수 없습니다."
      >
        <div className="grid gap-3">
          <ChoiceCard
            selected={gender === "female"}
            onClick={() => setGender("female")}
            title="여성"
          />
          <ChoiceCard
            selected={gender === "male"}
            onClick={() => setGender("male")}
            title="남성"
          />
        </div>

        <div className="mt-8">
          <Button className="w-full" size="lg" disabled={!gender} onClick={() => setStep(2)}>
            다음
          </Button>
        </div>
      </StepShell>
    );
  }

  if (step === 2) {
    return (
      <StepShell
        step={2}
        total={TOTAL}
        eyebrow="퇴근존"
        title="어느 퇴근존에서 만나시겠어요?"
        description="같은 존 또는 인접 존에서만 소개가 이뤄집니다. 지금은 테헤란로·역삼권 한 곳만 열려 있습니다."
      >
        <div className="grid gap-3">
          {HUBS.map((hub) => (
            <ChoiceCard
              key={hub.id}
              selected={hubId === hub.id}
              disabled={!hub.available}
              onClick={() => setHubId(hub.id)}
              title={hub.label}
              body={hub.available ? hub.detail : `${hub.detail} · 준비 중`}
            />
          ))}
        </div>
        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(1)}>
            이전
          </Button>
          <Button className="flex-1" size="lg" disabled={!hubId} onClick={() => setStep(3)}>
            다음
          </Button>
        </div>
      </StepShell>
    );
  }

  if (step === 3) {
    return (
      <StepShell
        step={3}
        total={TOTAL}
        eyebrow="직장 인증"
        title="회사 이메일로 재직을 확인합니다"
        description="인증 코드 확인 외에 이메일 주소는 프로필에 노출되지 않습니다. 개인 메일(gmail, naver 등)은 사용할 수 없습니다."
      >
        <label className="text-sm font-semibold text-foreground" htmlFor="work-email">
          회사 이메일
        </label>
        <Input
          id="work-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="name@company.co.kr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={email.length > 3 && !emailValid}
          aria-describedby={email.length > 3 && !emailValid ? "work-email-error" : "work-email-hint"}
          className="mt-2"
        />
        {email.length > 3 && !emailValid ? (
          <p
            id="work-email-error"
            role="alert"
            className="mt-2 flex items-start gap-1.5 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>회사 도메인 이메일만 인증할 수 있습니다. (예: name@company.co.kr)</span>
          </p>
        ) : (
          <p id="work-email-hint" className="mt-2 text-sm text-muted-foreground">
            개인 메일(gmail, naver 등)은 사용할 수 없습니다.
          </p>
        )}

        {codeSent ? (
          <div className="mt-6">
            <label className="text-sm font-semibold text-foreground" htmlFor="code">
              인증 코드 6자리
            </label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={code.length > 0 && code.length !== 6}
              aria-describedby={code.length > 0 && code.length !== 6 ? "code-error" : "code-hint"}
              className="mt-2 tracking-[0.4em]"
            />
            {code.length > 0 && code.length !== 6 ? (
              <p
                id="code-error"
                role="alert"
                className="mt-2 flex items-start gap-1.5 text-sm font-medium text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>숫자 6자리를 모두 입력해 주세요. (현재 {code.length}자리)</span>
              </p>
            ) : (
              <p id="code-hint" className="mt-2 text-sm text-muted-foreground">
                지금은 화면 흐름만 연결된 상태입니다. 실제 코드 발송은 다음 단계에서 붙습니다.
              </p>
            )}
          </div>
        ) : null}


        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(2)}>
            이전
          </Button>
          {codeSent ? (
            <Button
              className="flex-1"
              size="lg"
              disabled={code.length !== 6}
              onClick={() => setStep(4)}
            >
              인증하고 계속
            </Button>
          ) : (
            <Button
              className="flex-1"
              size="lg"
              disabled={!emailValid}
              onClick={() => {
                setCodeSent(true);
                toast.success("인증 코드를 보냈습니다 (데모)");
              }}
            >
              인증 코드 받기
            </Button>
          )}
        </div>
      </StepShell>
    );
  }

  if (step === 4) {
    return (
      <StepShell
        step={4}
        total={TOTAL}
        eyebrow={`AI 인터뷰 ${qIndex + 1}/${INTERVIEW_QUESTIONS.length}`}
        title={question.prompt}
        description="스펙 나열 대신, 결과 가치관으로 소개합니다. 두세 문장이면 충분합니다."
      >
        <label className="text-sm font-semibold text-foreground" htmlFor={`answer-${question.id}`}>
          답변
        </label>
        <Textarea
          key={question.id}
          id={`answer-${question.id}`}
          rows={5}
          className="mt-2"
          placeholder={question.placeholder}
          value={answers[question.id] ?? ""}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
          aria-invalid={(answers[question.id] ?? "").length > 0 && !answered}
          aria-describedby={`answer-${question.id}-help`}
        />
        <p
          id={`answer-${question.id}-help`}
          aria-live="polite"
          className={cn(
            "mt-2 flex items-start gap-1.5 text-sm",
            (answers[question.id] ?? "").length > 0 && !answered
              ? "font-medium text-destructive"
              : "text-muted-foreground",
          )}
        >
          {(answers[question.id] ?? "").length > 0 && !answered ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : null}
          <span>
            최소 10자 이상 입력해 주세요. (현재 {(answers[question.id] ?? "").trim().length}자)
          </span>
        </p>

        <div className="mt-8 flex gap-2">
          <Button
            variant="ghost"
            onClick={() => (qIndex === 0 ? setStep(3) : setQIndex(qIndex - 1))}
          >
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!answered}
            onClick={() =>
              qIndex === INTERVIEW_QUESTIONS.length - 1 ? goProfile() : setQIndex(qIndex + 1)
            }
          >
            {qIndex === INTERVIEW_QUESTIONS.length - 1 ? "프로필 초안 만들기" : "다음"}
          </Button>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      step={5}
      total={TOTAL}
      eyebrow="프로필 확인"
      title="이렇게 소개해도 될까요?"
      description="인터뷰 답변으로 만든 초안입니다. 직접 다듬은 뒤 확정하세요."
    >
      <label className="text-sm font-semibold text-foreground" htmlFor="intro">
        내 소개 초안
      </label>
      <Textarea
        id="intro"
        rows={7}
        className="mt-2"
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
        aria-invalid={intro.trim().length > 0 && intro.trim().length < 20}
        aria-describedby="intro-help"
      />
      <p
        id="intro-help"
        aria-live="polite"
        className={cn(
          "mt-2 flex items-start gap-1.5 text-sm",
          intro.trim().length > 0 && intro.trim().length < 20
            ? "font-medium text-destructive"
            : "text-muted-foreground",
        )}
      >
        {intro.trim().length > 0 && intro.trim().length < 20 ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : null}
        <span>최소 20자 이상 입력해 주세요. (현재 {intro.trim().length}자)</span>
      </p>


      <div className="mt-8">
        <p className="text-sm font-bold">1차 만남 선호</p>
        <div className="mt-3 grid gap-3">
          <ChoiceCard
            selected={drinkPref === "cafe_only"}
            onClick={() => setDrinkPref("cafe_only")}
            title="카페만"
            body="퇴근길 카페 한 잔, 45~60분."
            icon={<Coffee className="size-4" />}
          />
          <ChoiceCard
            selected={drinkPref === "open_to_drink"}
            onClick={() => setDrinkPref("open_to_drink")}
            title="술도 괜찮아요"
            body="상대도 같은 선호일 때만 술자리가 열립니다."
            icon={<Wine className="size-4" />}
          />
        </div>
      </div>

      <ul className="mt-8 space-y-3 rounded-xl border border-border bg-card p-5">
        {FIRST_MEETING_PROTOCOL.map((rule) => (
          <li key={rule.title} className="flex gap-3">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-bold">{rule.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{rule.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex gap-2">
        <Button variant="ghost" onClick={() => setStep(4)}>
          이전
        </Button>
        <Button
          className="flex-1"
          size="lg"
          disabled={intro.trim().length < 20}
          onClick={() => {
            toast.success("프로필 초안이 저장되었습니다 (데모)");
            navigate({ to: "/" });
          }}
        >
          프로필 확정
        </Button>
      </div>
    </StepShell>
  );
}

function ChoiceCard({
  selected,
  disabled,
  onClick,
  title,
  body,
  icon,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  body?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-xl border border-border bg-card p-5 text-left transition-colors",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        selected && "border-primary-strong bg-primary/10 ring-1 ring-primary-strong",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary-strong/60",
      )}
    >
      <div className="flex items-center gap-2">
        {icon ? <span className="text-primary-strong">{icon}</span> : null}
        <p className="font-bold">{title}</p>
        {selected ? (
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary-strong">
            <Check className="size-4" aria-hidden="true" />
            선택됨
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </button>

  );
}
