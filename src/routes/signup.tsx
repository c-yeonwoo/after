import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";

import { PhoneVerifyForm } from "@/components/app/PhoneVerifyForm";
import { CarrierIdentityForm } from "@/components/app/CarrierIdentityForm";
import { PhotoSetEditor } from "@/components/onboarding/PhotoSetEditor";
import { StepShell } from "@/components/onboarding/StepShell";
import { ProfileInterview } from "@/components/onboarding/ProfileInterview";
import { Chip } from "@/components/onboarding/Chip";
import {
  DRINKING_OPTIONS,
  MBTI_AXES,
  MIN_PHOTOS,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
  ageFrom,
  basicsValid,
  conditionsValid,
  emptyBasics,
  type Basics,
} from "@/components/onboarding/basics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND, HUBS, isCompanyEmail, OPEN_HUBS } from "@/lib/brand";
import { carrierIdentityEnabled } from "@/lib/carrierIdentity";
import {
  authErrorMessage,
  loadProfileInterviewDraft,
  LOCAL_DEV_AUTH_BYPASS,
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  requestEmailCode,
  recordConsent,
  recordMyAiDecision,
  publishProfileInterview,
  saveProfileInterviewDraft,
  saveOnboardingStep,
  setPassword,
  startLocalDevSignup,
  verifyEmailCode,
  type Profile,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { isNative } from "@/lib/native";
import { isProfileInterviewData, newProfileInterview } from "@/lib/profileInterview";
import { pruneMyPhotos } from "@/lib/photo";
import { enablePush, pushPermission } from "@/lib/push";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { edit?: true } =>
    search.edit === "1" || search.edit === true ? { edit: true } : {},
  head: () => ({
    meta: [
      { title: `가입 — ${BRAND.name}` },
      {
        name: "description",
        content: "회사 이메일을 확인하고, 세 가지 질문으로 나를 소개하는 글을 함께 써요.",
      },
      { property: "og:title", content: `가입 — ${BRAND.name}` },
      {
        property: "og:description",
        content: "회사 이메일 인증 · 소개장 인터뷰",
      },
    ],
  }),
  component: Onboarding,
});

/*
  권역이 하나뿐이면 고를 것이 없다. 2단계를 건너뛰고 그 권역으로 정한다
  (2026-10-10 진단: 고를 수 있는 값 1개와 비활성 "준비 중" 3개를 보여 주던 단계).
  권역을 하나 더 열면(brand.ts available) 단계가 저절로 돌아온다.
*/
const SKIP_HUB_STEP = OPEN_HUBS.length === 1;

/*
  단계 id 와 보이는 순서는 다르다. id 는 저장·재개 코드가 오래 써 온 번호라 그대로
  두고, 순서는 여기 한 곳에서 정한다(리부팅 C, 2026-10-10).

    성별 → (권역) → 회사 이메일 → 기본 정보 → 인터뷰 ①~③ → 소개장 확인 → 알아 두면 좋은 것

  조건(흡연·음주·종교·MBTI)을 맨 뒤로 뺐다. 예전에는 기본 정보 화면에서 먼저 물어서
  가입이 스펙 비교로 시작했다. 소개장은 "문장이 주인공"이다(D3).
*/
const Q_FIRST = 11;
const CONDITIONS = 15;
/** 휴대폰 인증(s54). 회사 메일 다음, 기본 정보 앞. 프로필 행이 생긴 뒤라야 저장할 곳이 있다. */
const PHONE = 5;
const ORDER = [1, ...(SKIP_HUB_STEP ? [] : [3]), 4, PHONE, 2, Q_FIRST, CONDITIONS];
const TOTAL = ORDER.length;
/** 화면에 보이는 단계 번호. */
const shown = (id: number) => ORDER.indexOf(id) + 1;
type Gender = "female" | "male";

function resumeStep(me: Profile) {
  if (carrierIdentityEnabled ? !me.identity_verified_at : !me.phone_verified_at) return PHONE;
  if (me.onboarding_step < 4) return 2;
  return Q_FIRST;
}

function Onboarding() {
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const editing = Boolean(edit);
  const { me, ready, refresh } = useMe();
  const [step, setStep] = useState(editing ? 2 : 1);
  const [gender, setGender] = useState<Gender | null>(null);
  const [hubId, setHubId] = useState<string | null>(SKIP_HUB_STEP ? OPEN_HUBS[0].id : null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  /*
    다음 로그인에 쓸 비밀번호. 인증 직후 같은 화면에서 받는다 — 회사 메일 확인은
    여기서 딱 한 번 하고, 그 뒤로는 메일함을 오갈 일이 없어야 한다.
  */
  const [pw, setPw] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** 저장된 프로필을 한 번만 불어온다 — me 가 갱신될 때마다 폼을 덮어쓰면 입력이 날아간다. */
  const [resumed, setResumed] = useState(false);
  const [editDraftReady, setEditDraftReady] = useState(!editing);
  const [editDraftLoadError, setEditDraftLoadError] = useState(false);

  const [basics, setBasics] = useState<Basics>(emptyBasics);
  const [interviewRevision, setInterviewRevision] = useState<number | null>(null);
  const [acceptedRunId, setAcceptedRunId] = useState<number | undefined>();
  const [acceptedDecision, setAcceptedDecision] = useState<
    "accepted" | "edited" | "discarded" | undefined
  >();
  /*
    저장할 onboarding_step. **내려가지 않는다.** 완료된 회원(7)이 수정하면서 4·5 를
    쓰면 매칭 자격을 잃는다 — eligible 조건이 step=7 이다. 예전 수정 흐름은 관심사·
    매치 단계에서 5·6 을 써서, 수정 도중에 자격이 빠졌다.
  */
  const savedStep = useRef(0);
  const keepStep = (n: number) => {
    savedStep.current = Math.max(savedStep.current, n);
    return savedStep.current;
  };
  const [mbtiParts, setMbtiParts] = useState<string[]>(["", "", "", ""]);

  /**
   * 저장된 프로필을 불러온다. 두 경로가 여기로 온다:
   *   · 수정 진입 (`?edit=1`, "나" 탭에서)
   *   · **가입 재개** — 인증까지 마치고 중간에 닫은 사람
   *
   * 재개가 예전에는 사실상 재시작이었다. onboarding_step 은 기록만 되고
   * 읽는 곳이 `< 7` 불리언 판정뿐이라, 그 결과가 1단계·빈 폼이었다(진단 UX-2).
   */
  useEffect(() => {
    if (!ready) return;
    if (!me) {
      // 수정 진입인데 세션이 없으면 나간다. 신규 가입은 아직 me 가 없는 게 정상이다.
      if (editing) navigate({ to: "/" });
      return;
    }
    if (resumed) return;
    setResumed(true);
    setUserId(me.id);
    savedStep.current = me.onboarding_step;
    setGender(me.gender);
    setHubId(me.hub_id);
    setEmail(me.company_email);
    const nextBasics: Basics = {
      name: me.name ?? "",
      // 예전 회원(한 장)은 photo_paths 가 [photo_url] 로 옮겨져 있다(s53 백필).
      photos: me.photo_paths ?? (me.photo_url ? [me.photo_url] : []),
      birth: me.birth ?? "",
      job: me.job ?? "",
      mbti: me.mbti ?? "",
      smoking: me.smoking ?? "",
      drinking: me.drinking ?? "",
      religion: me.religion ?? "",
    };
    setBasics(nextBasics);
    if (editing) {
      void loadProfileInterviewDraft(me.id)
        .then((row) => {
          if (row && !isProfileInterviewData(row.data)) throw new Error("invalid draft");
          const restoredBasics =
            row && isProfileInterviewData(row.data) ? row.data.basics : undefined;
          if (restoredBasics) setBasics((current) => ({ ...current, ...restoredBasics }));
          setEditDraftReady(true);
        })
        .catch(() => setEditDraftLoadError(true));
    }
    if (!editing) setStep(resumeStep(me));
    setMbtiParts(nextBasics.mbti ? nextBasics.mbti.split("") : ["", "", "", ""]);
  }, [editing, ready, me, navigate, resumed]);

  const emailValid = email.includes("@") && isCompanyEmail(email);

  if (editing && step === 2 && !editDraftReady) {
    return (
      <StepShell step={shown(2)} total={TOTAL} eyebrow="기본 정보" title="프로필을 불러오고 있어요">
        {editDraftLoadError ? (
          <div>
            <p role="alert" className="text-sm text-destructive">
              저장된 내용을 불러오지 못했어요.
            </p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
          </div>
        ) : null}
      </StepShell>
    );
  }

  if (step === 10) {
    return (
      <StepShell
        step={TOTAL}
        total={TOTAL}
        eyebrow="알림"
        title="소개가 오면 알려 드릴까요?"
        description="새 소개, 만남 요청과 약속 확정을 알림으로 보내 드려요. 소개 내용은 알림에 담지 않아요."
      >
        {/*
          앱에서만 오는 단계다(s55). 메일 알림은 없어졌고, 웹은 종 아이콘으로만 본다.
          권한 창은 이 버튼을 누를 때 처음 뜬다 — 가입 첫 화면에서 묻지 않는다.
        */}
        <Button
          className="w-full"
          size="lg"
          onClick={async () => {
            await enablePush();
            navigate({ to: "/home" });
          }}
        >
          알림 받기
        </Button>
        <div className="mt-3">
          <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/home" })}>
            나중에 할게요
          </Button>
        </div>
      </StepShell>
    );
  }

  if (step === PHONE) {
    return (
      <StepShell
        step={shown(PHONE)}
        total={TOTAL}
        eyebrow={carrierIdentityEnabled ? "본인 확인" : "휴대폰 인증"}
        title={
          carrierIdentityEnabled ? "본인과 성인 여부를 확인할게요" : "휴대폰 번호를 확인할게요"
        }
        description={
          carrierIdentityEnabled ? undefined : "한 사람이 한 계정만 쓰도록 하기 위해서예요."
        }
      >
        {carrierIdentityEnabled ? (
          <CarrierIdentityForm
            onVerified={async (birth) => {
              await refresh();
              setBasics((previous) => ({ ...previous, birth }));
              setStep(2);
            }}
          />
        ) : (
          <PhoneVerifyForm
            onVerified={async () => {
              await refresh();
              setStep(2);
            }}
          />
        )}
      </StepShell>
    );
  }

  if (step === 1) {
    return (
      <StepShell
        step={1}
        total={TOTAL}
        eyebrow="가입"
        title="성별을 알려주세요"
        description="가입 후 변경할 수 없습니다."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            이미 가입하셨나요?{" "}
            <Link to="/login" className="font-semibold text-primary-strong underline">
              로그인
            </Link>
          </p>
        }
      >
        <div className="grid gap-3">
          <ChoiceCard
            selected={gender === "female"}
            onClick={() => setGender("female")}
            title="여성"
          />
          <ChoiceCard selected={gender === "male"} onClick={() => setGender("male")} title="남성" />
        </div>
        <div className="mt-8">
          <Button
            className="w-full"
            size="lg"
            disabled={!gender}
            onClick={() => setStep(SKIP_HUB_STEP ? 4 : 3)}
          >
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
        step={shown(2)}
        total={TOTAL}
        eyebrow="기본 정보"
        title="기본적인 것부터"
        description="이름과 나이는 소개가 열린 상대에게만 보입니다."
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-foreground">
              프로필 사진 ({MIN_PHOTOS}장 이상)
            </p>
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
              얼굴이 잘 보이는 사진과 평소 모습이 담긴 사진을 섞어 주세요.
            </p>
            <PhotoSetEditor photos={basics.photos} onChange={(photos) => setB({ photos })} />
            {me?.photo_url && me.photo_state !== "approved" ? (
              <p
                className={`mt-3 text-xs leading-relaxed ${
                  me.photo_state === "rejected" ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {me.photo_state === "rejected" ? (
                  <>
                    <span className="font-semibold">사진이 반려되었습니다.</span>{" "}
                    {me.photo_reject_reason ?? "다른 사진으로 다시 올려주세요."} 새 사진을 올리면
                    다시 검수합니다.
                  </>
                ) : (
                  <>사진을 검수하고 있습니다. 검수가 끝나기 전까지는 상대에게 소개되지 않습니다.</>
                )}
              </p>
            ) : null}
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
              readOnly={Boolean(me?.identity_verified_at)}
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
        </div>

        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => (editing ? navigate({ to: "/me" }) : setStep(4))}>
            {editing ? "취소" : "이전"}
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!basicsValid(basics) || saving}
            onClick={async () => {
              // 신규 가입은 재개를 위해 기본 정보를 프로필에 저장한다.
              // 기존 회원의 수정은 확정 전까지 비공개 인터뷰 초안에만 둔다.
              if (userId) {
                setSaving(true);
                try {
                  if (editing) {
                    const row = await loadProfileInterviewDraft(userId);
                    if (row && !isProfileInterviewData(row.data))
                      throw new Error("저장된 인터뷰를 읽을 수 없습니다.");
                    const draft =
                      row && isProfileInterviewData(row.data)
                        ? row.data
                        : newProfileInterview(me ?? undefined);
                    await saveProfileInterviewDraft(
                      {
                        ...draft,
                        basics: {
                          name: basics.name,
                          birth: basics.birth,
                          job: basics.job,
                          photos: basics.photos,
                        },
                      } as unknown as import("@/lib/database.types").Json,
                      row?.revision ?? 0,
                    );
                  } else {
                    await saveOnboardingStep(userId, keepStep(4), {
                      name: basics.name,
                      birth: basics.birth,
                      job: basics.job,
                      photo_paths: basics.photos,
                    });
                    // 묶음에서 뺀 사진 파일을 치운다. 저장이 끝난 뒤라야 안전하다.
                    void pruneMyPhotos(basics.photos);
                  }
                  setStep(Q_FIRST);
                } catch {
                  toast.error("저장하지 못했어요. 다시 시도해 주세요.");
                } finally {
                  setSaving(false);
                }
              } else {
                setStep(Q_FIRST);
              }
            }}
          >
            {saving ? "저장 중…" : "다음"}
          </Button>
        </div>
      </StepShell>
    );
  }

  if (step === 3) {
    return (
      <StepShell
        step={shown(3)}
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
          <Button variant="ghost" onClick={() => setStep(1)}>
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
        step={shown(4)}
        total={TOTAL}
        eyebrow="회사 이메일 인증"
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
          aria-describedby={
            email.length > 3 && !emailValid ? "work-email-error" : "work-email-hint"
          }
          className="mt-2"
        />
        {email.length > 3 && !emailValid ? (
          <p
            id="work-email-error"
            role="alert"
            className="mt-2 flex items-start gap-1.5 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>회사 도메인 이메일만 인증할 수 있습니다.</span>
          </p>
        ) : (
          <p id="work-email-hint" className="mt-2 text-sm text-muted-foreground">
            개인 메일은 사용할 수 없습니다.
          </p>
        )}

        {codeSent && !LOCAL_DEV_AUTH_BYPASS ? (
          <div className="mt-6">
            <label className="text-sm font-semibold text-foreground" htmlFor="code">
              인증 코드
            </label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_MAX_LENGTH}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={code.length > 0 && code.length < OTP_MIN_LENGTH}
              aria-describedby={
                code.length > 0 && code.length < OTP_MIN_LENGTH ? "code-error" : "code-hint"
              }
              className="mt-2 tracking-[0.4em]"
            />
            {code.length > 0 && code.length < OTP_MIN_LENGTH ? (
              <p
                id="code-error"
                role="alert"
                className="mt-2 flex items-start gap-1.5 text-sm font-medium text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>메일로 받은 숫자를 그대로 입력해 주세요.</span>
              </p>
            ) : (
              <p id="code-hint" className="mt-2 text-sm text-muted-foreground">
                {autoFilled
                  ? "개발환경이라 방금 발송된 코드를 자동으로 채웠습니다."
                  : "메일로 받은 숫자를 입력해 주세요."}
              </p>
            )}
          </div>
        ) : null}

        {codeSent && LOCAL_DEV_AUTH_BYPASS ? (
          <div className="mt-6 rounded-surface border border-primary/25 bg-primary/10 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">로컬 개발 환경</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              인증 코드를 확인하지 않습니다. 아래에서 바로 가입 흐름을 이어가세요.
            </p>
          </div>
        ) : null}

        {authError ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-1.5 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{authError}</span>
          </p>
        ) : null}

        {codeSent ? (
          <div className="mt-6">
            <label className="text-sm font-semibold text-foreground" htmlFor="signup-password">
              비밀번호
            </label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              className="mt-2"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              다음부터는 이 비밀번호로 로그인합니다. {PASSWORD_MIN_LENGTH}자 이상.
            </p>
          </div>
        ) : null}

        {/* 계정이 실제로 만들어지는 지점이므로 동의를 여기서 받는다 (PRD 266). */}
        {codeSent ? (
          <label className="mt-7 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span className="text-sm leading-relaxed text-foreground/85">
              <Link
                to="/terms"
                target="_blank"
                className="font-semibold text-primary-strong underline"
              >
                이용약관
              </Link>
              과{" "}
              <Link
                to="/privacy"
                target="_blank"
                className="font-semibold text-primary-strong underline"
              >
                개인정보 처리방침
              </Link>
              에 동의합니다. (필수)
            </span>
          </label>
        ) : null}

        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(SKIP_HUB_STEP ? 1 : 3)}>
            이전
          </Button>
          {codeSent ? (
            <Button
              className="flex-1"
              size="lg"
              disabled={
                (!LOCAL_DEV_AUTH_BYPASS && code.length < OTP_MIN_LENGTH) ||
                pw.length < PASSWORD_MIN_LENGTH ||
                !agreed ||
                authBusy
              }
              onClick={async () => {
                setAuthError(null);
                setAuthBusy(true);
                try {
                  const created = await verifyEmailCode(
                    email,
                    code,
                    gender ?? "female",
                    hubId ?? "gangnam",
                  );
                  // 동의는 서버에 시각·버전으로 남긴다. 이게 없으면
                  // eligible_profiles 를 통과하지 못해 매칭 대상이 되지 않는다.
                  // 인증 직후 바로 건다. 여기서 실패해도 계정은 이미 만들어진
                  // 뒤라 되돌릴 수 없으므로 가입은 계속 진행시키고, 나중에
                  // 설정에서 정하게 안내한다 — 코드 로그인 경로가 살아 있다.
                  try {
                    await setPassword(pw);
                  } catch {
                    toast("비밀번호는 나중에 설정에서 정해 주세요.");
                  }
                  await recordConsent();
                  setUserId(created.id);
                  // 다시 인증하는 사람(이미 번호를 확인한 계정)은 건너뛴다.
                  setStep(
                    (
                      carrierIdentityEnabled
                        ? created.identity_verified_at
                        : created.phone_verified_at
                    )
                      ? 2
                      : PHONE,
                  );
                } catch (err) {
                  setAuthError(authErrorMessage(err));
                } finally {
                  setAuthBusy(false);
                }
              }}
            >
              {authBusy
                ? "확인 중…"
                : LOCAL_DEV_AUTH_BYPASS
                  ? "개발 환경으로 계속"
                  : "인증하고 계속"}
            </Button>
          ) : (
            <Button
              className="flex-1"
              size="lg"
              disabled={!emailValid || authBusy}
              onClick={async () => {
                setAuthError(null);
                setAuthBusy(true);
                try {
                  if (LOCAL_DEV_AUTH_BYPASS) {
                    await startLocalDevSignup(email);
                  } else {
                    await requestEmailCode(email);
                  }
                  setCodeSent(true);
                  if (LOCAL_DEV_AUTH_BYPASS) {
                    setCode("000000");
                    setAutoFilled(true);
                    toast.success("로컬 개발 계정을 준비했습니다.");
                  } else {
                    toast.success("인증 코드를 보냈습니다.");
                  }
                } catch (err) {
                  setAuthError(authErrorMessage(err));
                } finally {
                  setAuthBusy(false);
                }
              }}
            >
              {authBusy
                ? "준비 중…"
                : LOCAL_DEV_AUTH_BYPASS
                  ? "개발 계정 만들기"
                  : "인증 코드 받기"}
            </Button>
          )}
        </div>
      </StepShell>
    );
  }

  if (step === Q_FIRST && userId) {
    return (
      <ProfileInterview
        userId={userId}
        member={me}
        basics={basics}
        editing={editing}
        progressStep={shown(Q_FIRST)}
        progressTotal={TOTAL}
        onBack={() => setStep(2)}
        onDone={(revision, runId, decision) => {
          setInterviewRevision(revision);
          setAcceptedRunId(runId);
          setAcceptedDecision(decision);
          setStep(CONDITIONS);
        }}
      />
    );
  }

  // 마지막 — 만나기 전에 알아 두면 좋은 것 (조건은 인터뷰 뒤로, 리부팅 C)
  if (step === CONDITIONS) {
    const setB = (n: Partial<Basics>) => setBasics((prev) => ({ ...prev, ...n }));
    const pickMbti = (i: number, letter: string) => {
      const next = [...mbtiParts];
      next[i] = next[i] === letter ? "" : letter;
      setMbtiParts(next);
      setB({ mbti: next.every(Boolean) ? next.join("") : "" });
    };

    return (
      <StepShell
        step={shown(CONDITIONS)}
        total={TOTAL}
        eyebrow="마지막"
        title="만나기 전에 알아 두면 좋은 것"
        description="소개장 맨 아래에 작게 실려요."
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-foreground">MBTI (선택)</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[0, 1].map((row) =>
                MBTI_AXES.map((axis, i) => {
                  const letter = row === 0 ? axis.left : axis.right;
                  const selected = mbtiParts[i] === letter;
                  return (
                    <Chip
                      key={`${axis.key}-${letter}`}
                      selected={selected}
                      onClick={() => pickMbti(i, letter)}
                      className="w-full justify-center py-2.5 text-sm font-semibold"
                    >
                      {letter}
                    </Chip>
                  );
                }),
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {basics.mbti ? `선택한 유형 ${basics.mbti}` : "네 축 모두 고르면 유형이 완성됩니다."}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">흡연</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SMOKING_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  selected={basics.smoking === o.id}
                  onClick={() => setB({ smoking: o.id })}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">음주</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DRINKING_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  selected={basics.drinking === o.id}
                  onClick={() => setB({ drinking: o.id })}
                >
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
          <Button variant="ghost" onClick={() => setStep(Q_FIRST)}>
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!conditionsValid(basics) || saving || !userId || interviewRevision === null}
            onClick={async () => {
              if (!userId || interviewRevision === null) return;
              setSaving(true);
              try {
                await publishProfileInterview(interviewRevision, basics);
                if (editing) void pruneMyPhotos(basics.photos);
                if (acceptedRunId && acceptedDecision) {
                  try {
                    await recordMyAiDecision(acceptedRunId, acceptedDecision);
                  } catch {
                    /* A saved profile must not be undone by telemetry. */
                  }
                }
                // 완료 직전까지 읽고 있던 me 는 프로필을 쓰기 전 값이다. 갱신하지 않으면
                // /profile 이 소개글 없이 그려져 새로고침해야만 방금 쓴 내용이 보인다.
                await refresh();
                toast.success(editing ? "소개장을 고쳤어요." : "소개장이 완성됐어요.");
                /*
                  가입을 막 끝낸 사람이 볼 곳은 "다음에 일어나는 일" 이 있는 홈이다.
                  알림 메일이 없으면 그 전에 한 화면 들른다 — 없으면 소개가 와도 메일이
                  한 통도 나가지 않는다.
                */
                if (editing) navigate({ to: "/profile" });
                // 앱이면 알림 허용을 한 번 묻는다. 웹은 푸시가 없어 바로 홈으로.
                else if (isNative && (await pushPermission()) === "prompt") setStep(10);
                else navigate({ to: "/home" });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "저장 중…" : editing ? "저장" : "가입 마치기"}
          </Button>
        </div>
      </StepShell>
    );
  }

  return null;
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
        "min-h-11 rounded-control border border-border bg-card p-5 text-left transition-colors",
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
