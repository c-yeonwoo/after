import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";

import { StepShell } from "@/components/onboarding/StepShell";
import { Chip } from "@/components/onboarding/Chip";
import {
  DRINKING_OPTIONS,
  MBTI_AXES,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,

  ageFrom,
  basicsValid,
  emptyBasics,
  type Basics,
} from "@/components/onboarding/basics";
import {
  INTEREST_PLACEHOLDERS,
  MATCH_TAGS,
  TOPIC_TAGS,
  buildIntro,
  emptyProfile,
  type ProfileDraft,
} from "@/components/onboarding/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BRAND, HUBS, isCompanyEmail } from "@/lib/brand";
import { saveMe } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: `가입 · 지역·직장 인증 — ${BRAND.name}` },
      {
        name: "description",
        content:
          "활동 지역 선택, 회사 이메일 직장 인증, 취향에 따라 달라지는 프로필 작성까지 몇 분이면 끝나는 가입 절차입니다.",
      },
      { property: "og:title", content: `가입 · 지역·직장 인증 — ${BRAND.name}` },
      {
        property: "og:description",
        content: "활동 지역 선택 · 회사 이메일 인증 · 적응형 프로필 작성",
      },
    ],
  }),
  component: Onboarding,
});

const TOTAL = 8;
const MIN_INTERESTS = 3;
const MAX_INTERESTS = 5;
type Gender = "female" | "male";

function toggle(list: string[], id: string, max?: number) {
  if (list.includes(id)) return list.filter((v) => v !== id);
  if (max && list.length >= max) return list;
  return [...list, id];
}

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [gender, setGender] = useState<Gender | null>(null);
  const [hubId, setHubId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const [basics, setBasics] = useState<Basics>(emptyBasics);
  const [profile, setProfile] = useState<ProfileDraft>(emptyProfile);
  const [intro, setIntro] = useState("");


  const emailValid = email.includes("@") && isCompanyEmail(email);

  const selectedInterests = useMemo(
    () => profile.interests.map((v) => v.trim()).filter(Boolean),
    [profile.interests],
  );

  const draft = useMemo(() => buildIntro(profile), [profile]);

  function patch(next: Partial<ProfileDraft>) {
    setProfile((prev) => ({ ...prev, ...next }));
  }

  if (step === 1) {
    return (
      <StepShell step={1} total={TOTAL} eyebrow="가입" title="성별을 알려주세요" description="가입 후 변경할 수 없습니다.">
        <div className="grid gap-3">
          <ChoiceCard selected={gender === "female"} onClick={() => setGender("female")} title="여성" />
          <ChoiceCard selected={gender === "male"} onClick={() => setGender("male")} title="남성" />
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
    const age = ageFrom(basics.birth);
    const setB = (n: Partial<Basics>) => setBasics((prev) => ({ ...prev, ...n }));
    return (
      <StepShell
        step={2}
        total={TOTAL}
        eyebrow="기본 정보"
        title="기본적인 것부터"
        description="이름과 나이는 소개가 열린 상대에게만 보입니다."
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-foreground">프로필 사진 (1장)</p>
            <div className="mt-3 flex items-center gap-4">
              <div className="size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
                {basics.photo ? (
                  <img src={basics.photo} alt="선택한 프로필 사진 미리보기" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    미등록
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="photo"
                  className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-medium focus-within:ring-2 focus-within:ring-ring"
                >
                  {basics.photo ? "사진 변경" : "사진 선택"}
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setB({ photo: String(reader.result) });
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  얼굴이 잘 보이는 사진 한 장이면 충분합니다.
                </p>
              </div>
            </div>
          </div>

          <div>

            <label className="text-sm font-semibold text-foreground" htmlFor="name">
              이름
            </label>
            <Input
              id="name"
              className="mt-2"
              placeholder="실명 또는 불리고 싶은 이름"
              value={basics.name}
              onChange={(e) => setB({ name: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground" htmlFor="birth">
              생년월일
            </label>
            <Input
              id="birth"
              type="date"
              className="mt-2"
              value={basics.birth}
              onChange={(e) => setB({ birth: e.target.value })}
              aria-invalid={Boolean(basics.birth) && (age === null || age < 19)}
              aria-describedby="birth-help"
            />
            <p
              id="birth-help"
              aria-live="polite"
              className={cn(
                "mt-2 text-sm",
                basics.birth && (age === null || age < 19)
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {basics.birth
                ? age !== null && age >= 19
                  ? `만 ${age}세`
                  : "만 19세 이상만 가입할 수 있습니다."
                : "만 나이로 표시됩니다."}
            </p>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground" htmlFor="job">
              직업
            </label>
            <Input
              id="job"
              className="mt-2"
              placeholder="예: IT 기획, 회계사, 디자이너"
              value={basics.job}
              onChange={(e) => setB({ job: e.target.value })}
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">MBTI (선택)</p>
            <div className="mt-3 space-y-2">
              {MBTI_AXES.map((axis, i) => {
                const current = basics.mbti.length === 4 ? basics.mbti[i] : "";
                const pick = (letter: string) => {
                  const parts = basics.mbti.length === 4 ? basics.mbti.split("") : ["", "", "", ""];
                  parts[i] = parts[i] === letter ? "" : letter;
                  setB({ mbti: parts.every(Boolean) ? parts.join("") : "" });
                };
                return (
                  <div key={axis.key} className="grid grid-cols-2 gap-2">
                    {[
                      { letter: axis.left, hint: axis.leftHint },
                      { letter: axis.right, hint: axis.rightHint },
                    ].map((o) => (
                      <Chip key={o.letter} selected={current === o.letter} onClick={() => pick(o.letter)}>
                        {o.letter} · {o.hint}
                      </Chip>
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {basics.mbti ? `선택한 유형 ${basics.mbti}` : "네 줄 모두 고르면 유형이 완성됩니다."}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">흡연</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SMOKING_OPTIONS.map((o) => (
                <Chip key={o.id} selected={basics.smoking === o.id} onClick={() => setB({ smoking: o.id })}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">음주</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DRINKING_OPTIONS.map((o) => (
                <Chip key={o.id} selected={basics.drinking === o.id} onClick={() => setB({ drinking: o.id })}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">종교 (선택)</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {RELIGION_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  selected={basics.religion === o.id}
                  onClick={() => setB({ religion: basics.religion === o.id ? "" : o.id })}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

        </div>

        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(1)}>
            이전
          </Button>
          <Button className="flex-1" size="lg" disabled={!basicsValid(basics)} onClick={() => setStep(3)}>
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
        eyebrow="활동 지역"
        title="주로 어디서 만나시겠어요?"
        description="같은 지역 안에서만 소개됩니다."
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
          <Button variant="ghost" onClick={() => setStep(2)}>
            이전
          </Button>
          <Button className="flex-1" size="lg" disabled={!hubId} onClick={() => setStep(4)}>
            다음
          </Button>
        </div>
      </StepShell>
    );
  }

  if (step === 4) {
    return (
      <StepShell
        step={4}
        total={TOTAL}
        eyebrow="직장 인증"
        title="회사 이메일로 인증해 주세요"
        description="주소는 프로필에 노출되지 않습니다."
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
          <p id="work-email-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>회사 도메인 이메일만 인증할 수 있습니다.</span>
          </p>
        ) : (
          <p id="work-email-hint" className="mt-2 text-sm text-muted-foreground">
            개인 메일은 사용할 수 없습니다.
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
              <p id="code-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>숫자 6자리를 입력해 주세요.</span>
              </p>
            ) : (
              <p id="code-hint" className="mt-2 text-sm text-muted-foreground">
                메일로 받은 6자리를 입력해 주세요.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(3)}>
            이전
          </Button>
          {codeSent ? (
            <Button className="flex-1" size="lg" disabled={code.length !== 6} onClick={() => setStep(5)}>
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

  // 4 — 한 줄 소개
  if (step === 5) {
    const ok = profile.headline.trim().length >= 8;
    return (
      <StepShell
        step={5}
        total={TOTAL}
        eyebrow="프로필"
        title="나를 한 문장으로 소개한다면"
        description="직업이나 스펙 말고, 지금의 나를 설명하는 한 줄."
      >
        <label className="text-sm font-semibold text-foreground" htmlFor="headline">
          한 줄 소개
        </label>
        <Textarea
          id="headline"
          rows={3}
          className="mt-2"
          placeholder="예: 평일엔 조용히 일하고, 주말엔 새로운 동네를 걷는 사람."
          value={profile.headline}
          onChange={(e) => patch({ headline: e.target.value })}
          aria-invalid={profile.headline.length > 0 && !ok}
          aria-describedby="headline-help"
        />
        <p
          id="headline-help"
          aria-live="polite"
          className={cn(
            "mt-2 text-sm",
            profile.headline.length > 0 && !ok ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          최소 8자 ({profile.headline.trim().length}자)
        </p>
        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(4)}>
            이전
          </Button>
          <Button className="flex-1" size="lg" disabled={!ok} onClick={() => setStep(6)}>
            다음
          </Button>
        </div>
      </StepShell>
    );
  }

  // 5 — 관심사 직접 입력 (이후 질문이 여기에 따라 달라짐)
  if (step === 6) {
    const rows =
      profile.interests.length < MAX_INTERESTS ? [...profile.interests, ""] : profile.interests;
    const filled = profile.interests.map((v) => v.trim()).filter(Boolean).length;
    const ok = filled >= MIN_INTERESTS;
    const setRow = (index: number, value: string) => {
      const next = [...profile.interests];
      next[index] = value;
      patch({ interests: next.filter((v, i) => v.trim() || i < next.length - 1) });
    };
    return (
      <StepShell
        step={6}
        total={TOTAL}
        eyebrow="프로필"
        title="요즘 시간을 쓰는 것들"
        description={`${MIN_INTERESTS}~${MAX_INTERESTS}가지를 직접 적어주세요. 적은 것에 대해서만 물어봅니다.`}
      >
        <div className="space-y-2">
          {rows.map((value, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={value}
                aria-label={`관심사 ${i + 1}`}
                placeholder={INTEREST_PLACEHOLDERS[i] ?? "직접 적기"}
                onChange={(e) => setRow(i, e.target.value)}
              />
              {value.trim() ? (
                <button
                  type="button"
                  aria-label={`${value} 삭제`}
                  className="min-h-11 shrink-0 rounded-full px-3 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => patch({ interests: profile.interests.filter((_, idx) => idx !== i) })}
                >
                  삭제
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {filled} / {MAX_INTERESTS} 작성
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(5)}>
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!ok}
            onClick={() => {
              patch({ interests: profile.interests.map((v) => v.trim()).filter(Boolean) });
              setStep(8);
            }}
          >
            다음
          </Button>
        </div>
      </StepShell>
    );
  }



  // 6 — 잘 맞는 사람 + 이번 만남 대화 주제
  if (step === 8) {
    const ok = profile.matchTags.length >= 2 && profile.topics.length >= 2;
    return (
      <StepShell
        step={7}
        total={TOTAL}
        eyebrow="프로필"
        title="어떤 사람과, 무슨 이야기를"
        description="상대를 고르는 기준과, 만나면 꺼내고 싶은 주제."
      >
        <div>
          <p className="text-sm font-semibold text-foreground">잘 맞았던 사람 (2개 이상)</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MATCH_TAGS.map((tag) => (
              <Chip
                key={tag}
                selected={profile.matchTags.includes(tag)}
                onClick={() => patch({ matchTags: toggle(profile.matchTags, tag, 4) })}
              >
                {tag}
              </Chip>
            ))}
          </div>
          <Textarea
            rows={3}
            className="mt-3"
            aria-label="이상형 자유 입력"
            placeholder="덧붙이고 싶은 말이 있다면 (선택)"
            value={profile.matchNote}
            onChange={(e) => patch({ matchNote: e.target.value })}
          />
        </div>

        <div className="mt-8">
          <p className="text-sm font-semibold text-foreground">이번 만남에서 이야기하고 싶은 주제 (2개 이상)</p>
          <p className="mt-1 text-sm text-muted-foreground">상대에게도 그대로 보여집니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPIC_TAGS.map((tag) => (
              <Chip
                key={tag}
                selected={profile.topics.includes(tag)}
                onClick={() => patch({ topics: toggle(profile.topics, tag, 4) })}
              >
                {tag}
              </Chip>
            ))}
          </div>
          <Input
            className="mt-3"
            aria-label="직접 적는 대화 주제"
            placeholder="직접 적기 (선택)"
            value={profile.topicNote}
            onChange={(e) => patch({ topicNote: e.target.value })}
          />
        </div>

        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(6)}>
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!ok}
            onClick={() => {
              setIntro(draft);
              setStep(9);
            }}
          >
            프로필 만들기
          </Button>
        </div>
      </StepShell>
    );
  }

  const topics = [...profile.topics, ...(profile.topicNote.trim() ? [profile.topicNote.trim()] : [])];

  return (
    <StepShell step={8} total={TOTAL} eyebrow="프로필 확인" title="이렇게 소개해도 될까요?" description="적은 내용으로 만든 초안입니다.">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {basics.photo ? (
          <img src={basics.photo} alt="내 프로필 사진" className="aspect-[4/5] w-full object-cover" />
        ) : null}
        <div className="p-5">
        <p className="text-base font-semibold">
          {basics.name}
          {ageFrom(basics.birth) !== null ? ` · ${ageFrom(basics.birth)}세` : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {[
            basics.job,
            basics.mbti,
            SMOKING_OPTIONS.find((o) => o.id === basics.smoking)?.label,
            `음주 ${DRINKING_OPTIONS.find((o) => o.id === basics.drinking)?.label ?? ""}`.trim(),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <p className="mt-5 text-xs font-semibold tracking-wide text-primary-strong">관심사</p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedInterests.map((i) => (
            <span key={i} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
              {i}
            </span>
          ))}
        </div>
        <p className="mt-5 text-xs font-semibold tracking-wide text-primary-strong">이번 만남에서 나누고 싶은 이야기</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <span key={t} className="rounded-full bg-accent/40 px-3 py-1 text-xs text-foreground">
              {t}
            </span>
          ))}
        </div>
        </div>
      </div>

      <label className="mt-6 block text-sm font-semibold text-foreground" htmlFor="intro">
        소개글
      </label>
      <Textarea
        id="intro"
        rows={9}
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
          "mt-2 text-sm",
          intro.trim().length > 0 && intro.trim().length < 20 ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        최소 20자 ({intro.trim().length}자)
      </p>

      <div className="mt-8 flex gap-2">
        <Button variant="ghost" onClick={() => setStep(8)}>
          이전
        </Button>
        <Button
          className="flex-1"
          size="lg"
          disabled={intro.trim().length < 20}
          onClick={() => {
            saveMe({
              gender: gender ?? "female",
              hubId: hubId ?? "gangnam",
              email,
              basics,
              profile,
              intro: intro.trim(),
            });
            toast.success("프로필이 저장되었습니다");
            navigate({ to: "/me" });
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
      {body ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p> : null}
    </button>
  );
}
