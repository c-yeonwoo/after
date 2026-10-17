import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";

import { PhoneVerifyForm } from "@/components/app/PhoneVerifyForm";
import { AppScreen } from "@/components/app/AppScreen";
import { CarrierIdentityForm } from "@/components/app/CarrierIdentityForm";
import { PhotoSetEditor } from "@/components/onboarding/PhotoSetEditor";
import { StepShell } from "@/components/onboarding/StepShell";
import { ProfileInterviewV3 } from "@/components/onboarding/ProfileInterviewV3";
import { Chip } from "@/components/onboarding/Chip";
import {
  DRINKING_OPTIONS,
  MBTI_AXES,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
  ageFrom,
  basicsIssues,
  basicsValid,
  conditionsValid,
  emptyBasics,
  type Basics,
} from "@/components/onboarding/basics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND, HUBS, isCompanyEmail, OPEN_HUBS } from "@/lib/brand";
import { carrierIdentityEnabled, carrierIdentityError } from "@/lib/carrierIdentity";
import {
  beginSignup,
  clearSignupSession,
  finishSignupIdentity,
  loadSignupSession,
  pendingSignupIdentity,
  signupToken,
  startSignupIdentity,
  type SignupSession,
} from "@/lib/signupSession";
import {
  authErrorMessage,
  createSignupProfile,
  loadProfileInterviewDraft,
  LOCAL_DEV_AUTH_BYPASS,
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  requestEmailCode,
  recordConsent,
  recordMyAiDecision,
  publishProfileInterviewV3,
  saveProfileInterviewDraft,
  saveOnboardingStep,
  setPassword,
  signOut,
  startLocalDevSignup,
  verifySignupEmail,
  type Profile,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { isNative } from "@/lib/native";
import { isProfileInterviewData } from "@/lib/profileInterview";
import { isProfileInterviewV3Data, newProfileInterviewV3 } from "@/lib/profileInterviewV3";
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
        content: "회사 이메일을 확인하고, 내 이야기를 담은 소개장을 함께 써요.",
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
  단계 id 와 보이는 순서는 다르다. id 는 저장·재개 코드가 오래 써 온 번호라 그대로
  두고, 순서는 여기 한 곳에서 정한다(리부팅 C, 2026-10-10).

    동의 → 본인·성인 확인 → 회사 이메일 → 직장 지역 → 기본 정보 → 생활 정보 → 인터뷰
    통신사 미개통 베타에서만 성별 수기 입력·가입 후 문자 OTP 경로를 유지한다.

  생활 정보는 소개장 생성 전에 받는다. 성격을 추측하는 근거로 쓰지 않고,
  본인 답변과 충돌할 때 확인하는 자료로만 사용한다.
*/
const Q_FIRST = 11;
const CONDITIONS = 15;
const CONSENT = 0;
const PHONE = 5;
const ORDER = carrierIdentityEnabled
  ? [CONSENT, PHONE, 4, 3, 2, CONDITIONS, Q_FIRST]
  : [CONSENT, 1, 4, 3, PHONE, 2, CONDITIONS, Q_FIRST];
const TOTAL = ORDER.length;
/** 화면에 보이는 단계 번호. */
const shown = (id: number) => ORDER.indexOf(id) + 1;
type Gender = "female" | "male";

function resumeStep(me: Profile) {
  if (!me.terms_agreed_at || !me.privacy_agreed_at) return CONSENT;
  if (carrierIdentityEnabled ? !me.identity_verified_at : !me.phone_verified_at) return PHONE;
  if (me.onboarding_step < 4) return 2;
  if (!me.smoking || !me.drinking) return CONDITIONS;
  return Q_FIRST;
}

function Onboarding() {
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const editing = Boolean(edit);
  const { me, ready, refresh, setMe } = useMe();
  const [step, setStep] = useState(editing ? 2 : CONSENT);
  const [gender, setGender] = useState<Gender | null>(null);
  // 모집 중인 지역이 하나여도 직장 위치를 추측해 자동 배정하지 않는다.
  const [hubId, setHubId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const agreed = termsAgreed && privacyAgreed;
  const [signupSession, setSignupSession] = useState<SignupSession | null>(null);
  const [signupResumeRequired, setSignupResumeRequired] = useState(false);
  const [signupRestoreError, setSignupRestoreError] = useState(false);
  const [signupReady, setSignupReady] = useState(editing);
  const signupRestored = useRef(false);
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
  /** 기존 세션의 사진·이름은 사용자가 명시적으로 '이어하기'를 고르기 전에는 불러오지 않는다. */
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  const [editDraftReady, setEditDraftReady] = useState(!editing);
  const [editDraftLoadError, setEditDraftLoadError] = useState(false);

  const [basics, setBasics] = useState<Basics>(emptyBasics);
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

  useEffect(() => {
    if (!ready || me || editing || signupRestored.current) return;
    signupRestored.current = true;
    void (async () => {
      let session: SignupSession | null = null;
      const query = new URLSearchParams(window.location.search);
      const id = query.get("identityVerificationId");
      const code = query.get("code");
      try {
        if (id || code) {
          window.history.replaceState(null, "", "/signup");
          if (code || !id || pendingSignupIdentity() !== id) throw new Error("not verified");
          session = await finishSignupIdentity(id);
        } else {
          session = await loadSignupSession();
        }
      } catch (error) {
        setAuthError(carrierIdentityError(error));
        try {
          session = await loadSignupSession();
        } catch {
          setSignupRestoreError(true);
        }
      }
      if (session) {
        setSignupSession(session);
        setTermsAgreed(true);
        setPrivacyAgreed(true);
        if (session.gender) setGender(session.gender);
        if (session.birth) setBasics((value) => ({ ...value, birth: session.birth! }));
        if (session.verified) setAuthError(null);
        setStep(carrierIdentityEnabled ? (session.verified ? 4 : PHONE) : 1);
        setSignupResumeRequired(!id && !code);
      }
      setSignupReady(true);
    })();
  }, [ready, me, editing]);

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
    if (!editing && me.onboarding_step >= 7) return;
    if (!editing && !resumeConfirmed) return;
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
          if (row && !isProfileInterviewData(row.data) && !isProfileInterviewV3Data(row.data))
            throw new Error("invalid draft");
          const restoredBasics =
            row && (isProfileInterviewData(row.data) || isProfileInterviewV3Data(row.data))
              ? row.data.basics
              : undefined;
          if (restoredBasics) setBasics((current) => ({ ...current, ...restoredBasics }));
          setEditDraftReady(true);
        })
        .catch(() => setEditDraftLoadError(true));
    }
    if (!editing) setStep(resumeStep(me));
    setMbtiParts(nextBasics.mbti ? nextBasics.mbti.split("") : ["", "", "", ""]);
  }, [editing, ready, me, navigate, resumed, resumeConfirmed]);

  const emailValid = email.includes("@") && isCompanyEmail(email);

  function restartSignup() {
    clearSignupSession();
    setSignupSession(null);
    setSignupResumeRequired(false);
    setTermsAgreed(false);
    setPrivacyAgreed(false);
    setGender(null);
    setHubId(null);
    setEmail("");
    setCode("");
    setCodeSent(false);
    setEmailVerified(false);
    setPw("");
    setBasics(emptyBasics);
    setAuthError(null);
    setStep(CONSENT);
  }

  async function completeSignup() {
    if (!hubId || (!carrierIdentityEnabled && !gender)) return;
    const token = signupToken();
    if (!token) {
      setAuthError("가입 확인 시간이 지났어요. 약관부터 다시 확인해 주세요.");
      setStep(CONSENT);
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const created = await createSignupProfile(
        hubId,
        token,
        carrierIdentityEnabled ? undefined : (gender ?? undefined),
      );
      try {
        await setPassword(pw);
      } catch {
        toast("비밀번호는 나중에 설정에서 정해 주세요.");
      }
      clearSignupSession();
      setMe(created);
      setUserId(created.id);
      if (created.birth) setBasics((value) => ({ ...value, birth: created.birth! }));
      setStep(
        (carrierIdentityEnabled ? created.identity_verified_at : created.phone_verified_at)
          ? 2
          : PHONE,
      );
    } catch (error) {
      setAuthError(authErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  // SSR·세션 복구 중에는 빈 가입 폼도 보여주지 않는다. 기존 회원 데이터가 뒤늦게
  // 폼에 채워져 '새 가입'처럼 보이던 순간적인 노출을 막는다.
  if (!ready || (editing && !me) || (!editing && !me && !signupReady)) {
    return (
      <AppScreen title="가입" hideTabs>
        <p className="mt-16 text-center text-sm text-muted-foreground">계정을 확인하고 있어요…</p>
      </AppScreen>
    );
  }

  if (!editing && me && (me.onboarding_step >= 7 || !resumeConfirmed)) {
    const completed = me.onboarding_step >= 7;
    return (
      <AppScreen title="가입" hideTabs>
        <div className="pt-12">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {completed ? "이미 가입된 계정이 있어요" : "진행 중인 가입이 있어요"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {completed
              ? "기존 계정을 이용하거나, 로그아웃한 뒤 다른 계정으로 시작할 수 있어요."
              : "이 계정으로 이어가거나, 로그아웃한 뒤 다른 계정으로 시작할 수 있어요."}
          </p>
          <div className="mt-8 grid gap-3">
            <Button
              size="lg"
              onClick={() => {
                if (completed) navigate({ to: "/home", replace: true });
                else setResumeConfirmed(true);
              }}
            >
              {completed ? "기존 계정으로 계속" : "가입 이어하기"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={authBusy}
              onClick={async () => {
                setAuthBusy(true);
                try {
                  await signOut();
                  clearSignupSession();
                  // 이전 계정에서 불러온 폼 상태까지 버리고 새 화면을 연다.
                  window.location.replace("/signup");
                } catch (err) {
                  setAuthError(authErrorMessage(err));
                  setAuthBusy(false);
                }
              }}
            >
              {authBusy ? "로그아웃 중…" : "다른 계정으로 새로 가입"}
            </Button>
          </div>
          {authError ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {authError}
            </p>
          ) : null}
        </div>
      </AppScreen>
    );
  }

  if (!me && signupRestoreError) {
    return (
      <StepShell
        step={shown(CONSENT)}
        total={TOTAL}
        eyebrow="가입"
        title="가입 정보를 확인하지 못했어요"
        description="연결 상태를 확인하고 다시 시도해 주세요."
      >
        <Button className="w-full" size="lg" onClick={() => window.location.reload()}>
          다시 확인하기
        </Button>
      </StepShell>
    );
  }

  if (!me && signupResumeRequired) {
    return (
      <StepShell
        step={shown(CONSENT)}
        total={TOTAL}
        eyebrow="가입"
        title="진행 중인 가입이 있어요"
        description="이어서 진행하거나, 처음부터 다시 시작할 수 있어요."
      >
        <div className="grid gap-3">
          <Button size="lg" onClick={() => setSignupResumeRequired(false)}>
            가입 이어하기
          </Button>
          <Button size="lg" variant="outline" onClick={restartSignup}>
            처음부터 시작하기
          </Button>
        </div>
      </StepShell>
    );
  }

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

  if (step === CONSENT) {
    return (
      <StepShell
        step={shown(CONSENT)}
        total={TOTAL}
        eyebrow="가입"
        title="시작하기 전에, 확인해 주세요"
        description="서비스 이용과 개인정보 처리에 대한 동의가 필요해요."
        footer={
          <p className="text-center text-sm text-muted-foreground">
            이미 가입하셨나요?{" "}
            <Link to="/login" className="font-semibold text-primary-strong underline">
              로그인
            </Link>
          </p>
        }
      >
        <div className="divide-y divide-border rounded-surface border border-border bg-card px-4">
          <label className="flex min-h-16 cursor-pointer items-center gap-3 py-4">
            <input
              type="checkbox"
              aria-label="이용약관 동의 (필수)"
              checked={termsAgreed}
              onChange={(event) => setTermsAgreed(event.target.checked)}
              className="size-5 shrink-0 accent-primary"
            />
            <span className="text-sm">
              <Link
                to="/terms"
                target="_blank"
                className="font-semibold text-primary-strong underline underline-offset-4"
              >
                이용약관
              </Link>{" "}
              동의 <span className="text-muted-foreground">(필수)</span>
            </span>
          </label>
          <label className="flex min-h-16 cursor-pointer items-center gap-3 py-4">
            <input
              type="checkbox"
              aria-label="개인정보 수집·이용 동의 (필수)"
              checked={privacyAgreed}
              onChange={(event) => setPrivacyAgreed(event.target.checked)}
              className="size-5 shrink-0 accent-primary"
            />
            <span className="text-sm">
              <Link
                to="/privacy"
                target="_blank"
                className="font-semibold text-primary-strong underline underline-offset-4"
              >
                개인정보 수집·이용
              </Link>{" "}
              동의 <span className="text-muted-foreground">(필수)</span>
            </span>
          </label>
        </div>
        {authError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {authError}
          </p>
        ) : null}
        <Button
          className="mt-8 w-full"
          size="lg"
          disabled={!agreed || authBusy}
          onClick={async () => {
            setAuthBusy(true);
            setAuthError(null);
            try {
              if (me) {
                const updated = await recordConsent();
                setMe(updated);
                setStep(resumeStep(updated));
              } else {
                const session = signupSession ?? (await beginSignup());
                setSignupSession(session);
                setStep(carrierIdentityEnabled ? (session.verified ? 4 : PHONE) : 1);
              }
            } catch (error) {
              setAuthError(authErrorMessage(error));
            } finally {
              setAuthBusy(false);
            }
          }}
        >
          {authBusy ? "확인 중…" : "동의하고 시작하기"}
        </Button>
      </StepShell>
    );
  }

  if (step === PHONE) {
    const alreadyVerified = me
      ? carrierIdentityEnabled
        ? me.identity_verified_at
        : me.phone_verified_at
      : signupSession?.verified;
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
        {authError ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {authError}
          </p>
        ) : null}
        {alreadyVerified ? (
          <div>
            <p className="text-sm text-muted-foreground">인증을 마쳤어요. 가입을 이어가세요.</p>
            <Button className="mt-6 w-full" size="lg" onClick={() => setStep(me ? 2 : 4)}>
              다음
            </Button>
          </div>
        ) : carrierIdentityEnabled ? (
          <CarrierIdentityForm
            verifyIdentity={
              !me
                ? async () => {
                    const session = await startSignupIdentity();
                    if (!session.verified || !session.birth || !session.gender)
                      throw new Error("not verified");
                    setSignupSession(session);
                    setGender(session.gender);
                    return session.birth;
                  }
                : undefined
            }
            onVerified={async (birth) => {
              if (me) await refresh();
              setBasics((previous) => ({ ...previous, birth }));
              setAuthError(null);
              setStep(me ? 2 : 4);
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
        {!me ? (
          <Button variant="ghost" className="mt-4" onClick={restartSignup}>
            처음부터 다시
          </Button>
        ) : null}
      </StepShell>
    );
  }

  if (step === 1) {
    return (
      <StepShell
        step={shown(1)}
        total={TOTAL}
        eyebrow="가입"
        title="성별을 알려주세요"
        description="가입 후 변경할 수 없습니다."
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
          <Button className="w-full" size="lg" disabled={!gender} onClick={() => setStep(4)}>
            다음
          </Button>
        </div>
      </StepShell>
    );
  }

  if (step === 2) {
    const age = ageFrom(basics.birth);
    const issues = basicsIssues(basics);
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
            <p className="text-sm font-semibold text-foreground">프로필 사진</p>
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
              aria-invalid={Boolean(basics.birth) && (age === null || age < 19 || age > 79)}
              aria-describedby="birth-help"
            />
            <p
              id="birth-help"
              aria-live="polite"
              className={cn(
                "mt-2 text-sm",
                basics.birth && (age === null || age < 19 || age > 79)
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {basics.birth
                ? age !== null && age >= 19 && age <= 79
                  ? `만 ${age}세`
                  : "만 19~79세만 가입할 수 있습니다."
                : me?.identity_verified_at
                  ? "본인확인에서 확인한 생년월일이에요."
                  : "입력한 생년월일 기준 만 19세 이상만 가입할 수 있어요."}
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

        {issues.length ? (
          <p role="status" className="mt-6 text-sm leading-relaxed text-muted-foreground">
            다음으로 가려면 {issues.join(" · ")}이 필요해요.
          </p>
        ) : null}

        <div className={cn("flex gap-2", issues.length ? "mt-5" : "mt-8")}>
          <Button
            variant="ghost"
            onClick={() => (editing ? navigate({ to: "/me" }) : setStep(PHONE))}
          >
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
                    if (
                      row &&
                      !isProfileInterviewData(row.data) &&
                      !isProfileInterviewV3Data(row.data)
                    )
                      throw new Error("저장된 인터뷰를 읽을 수 없습니다.");
                    const draft =
                      row &&
                      (isProfileInterviewData(row.data) || isProfileInterviewV3Data(row.data))
                        ? row.data
                        : newProfileInterviewV3(me, basics);
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
                  setStep(CONDITIONS);
                } catch {
                  toast.error("저장하지 못했어요. 다시 시도해 주세요.");
                } finally {
                  setSaving(false);
                }
              } else {
                setStep(CONDITIONS);
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
        eyebrow="직장 지역"
        title="직장은 어느 지역에 있나요?"
        description="직장과 가까운 지역의 사람을 소개해 드려요."
      >
        <div className="grid gap-3">
          {OPEN_HUBS.map((hub) => (
            <ChoiceCard
              key={hub.id}
              selected={hubId === hub.id}
              onClick={() => setHubId(hub.id)}
              title={hub.label}
              body={hub.detail}
            />
          ))}
        </div>
        {OPEN_HUBS.length < HUBS.length ? (
          <p className="mt-4 text-sm text-muted-foreground">다른 지역은 차례로 준비하고 있어요.</p>
        ) : null}
        {authError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {authError}
          </p>
        ) : null}
        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(4)}>
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!hubId || authBusy}
            onClick={completeSignup}
          >
            {authBusy ? "저장 중…" : "다음"}
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
        title={emailVerified ? "로그인 비밀번호를 정해 주세요" : "회사 이메일로 인증해 주세요"}
        description={
          emailVerified
            ? "다음부터는 이 비밀번호로 로그인할 수 있어요."
            : "주소는 프로필에 노출되지 않습니다."
        }
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
          onChange={(e) => {
            setEmail(e.target.value);
            setCodeSent(false);
            setEmailVerified(false);
            setCode("");
            setAuthError(null);
          }}
          disabled={emailVerified}
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

        {codeSent && !emailVerified && !LOCAL_DEV_AUTH_BYPASS ? (
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

        {codeSent && !emailVerified && LOCAL_DEV_AUTH_BYPASS ? (
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

        {emailVerified ? (
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

        <div className="mt-8 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(carrierIdentityEnabled ? PHONE : 1)}>
            이전
          </Button>
          {emailVerified ? (
            <Button
              className="flex-1"
              size="lg"
              disabled={pw.length < PASSWORD_MIN_LENGTH || !agreed || authBusy}
              onClick={() => setStep(3)}
            >
              {authBusy ? "저장 중…" : "가입 계속하기"}
            </Button>
          ) : codeSent ? (
            <Button
              className="flex-1"
              size="lg"
              disabled={(!LOCAL_DEV_AUTH_BYPASS && code.length < OTP_MIN_LENGTH) || authBusy}
              onClick={async () => {
                setAuthError(null);
                setAuthBusy(true);
                try {
                  const result = await verifySignupEmail(email, code);
                  if (result.kind === "closed") {
                    setAuthError(
                      result.state === "withdrawn"
                        ? "탈퇴한 계정입니다. 다른 회사 이메일로 새로 가입해 주세요."
                        : "이용이 중지된 계정입니다. 문의해 주세요.",
                    );
                  } else if (result.kind === "existing") {
                    setMe(result.profile);
                    if (result.profile.onboarding_step >= 7) {
                      toast("이미 가입된 계정으로 로그인했어요.");
                      navigate({ to: "/home", replace: true });
                    } else {
                      // 코드 확인은 로그인일 뿐, 저장된 사진·이름을 가입 폼에
                      // 자동으로 불러오는 데 대한 선택은 아니다.
                      toast("진행 중인 가입이 있어요.");
                    }
                  } else {
                    setResumeConfirmed(true);
                    setEmailVerified(true);
                  }
                } catch (err) {
                  setAuthError(authErrorMessage(err));
                } finally {
                  setAuthBusy(false);
                }
              }}
            >
              {authBusy ? "확인 중…" : LOCAL_DEV_AUTH_BYPASS ? "계속하기" : "이메일 확인"}
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
      <ProfileInterviewV3
        userId={userId}
        member={me}
        basics={basics}
        editing={editing}
        progressStep={shown(Q_FIRST)}
        progressTotal={TOTAL}
        onBack={() => setStep(CONDITIONS)}
        onDone={async (revision, runId, decision) => {
          setSaving(true);
          try {
            await publishProfileInterviewV3(revision, basics);
            if (editing) void pruneMyPhotos(basics.photos);
            if (runId && decision) {
              try {
                await recordMyAiDecision(runId, decision);
              } catch {
                /* Telemetry must not undo an approved profile. */
              }
            }
            await refresh();
            toast.success(editing ? "소개장을 고쳤어요." : "소개장이 완성됐어요.");
            if (editing) navigate({ to: "/profile" });
            else if (isNative && (await pushPermission()) === "prompt") setStep(10);
            else navigate({ to: "/home" });
          } finally {
            setSaving(false);
          }
        }}
      />
    );
  }

  // 생활 정보는 소개장 분석과 작성 전에 고른다.
  if (step === CONDITIONS) {
    const setB = (n: Partial<Basics>) => setBasics((prev) => ({ ...prev, ...n }));
    const missingConditions = [
      !basics.smoking ? "흡연" : null,
      !basics.drinking ? "음주" : null,
    ].filter(Boolean);
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
        eyebrow="생활 정보"
        title="만나기 전에 알아 두면 좋은 것"
        description="흡연·음주는 소개 전에 알려드려요. MBTI·종교는 선택입니다."
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

        {missingConditions.length ? (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            아직 {missingConditions.join(" · ")} 선택이 필요해요.
          </p>
        ) : null}

        <div className={cn("flex gap-2", missingConditions.length ? "mt-5" : "mt-8")}>
          <Button variant="ghost" onClick={() => setStep(2)}>
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!conditionsValid(basics) || saving || !userId}
            onClick={async () => {
              if (!userId) return;
              setSaving(true);
              try {
                if (editing) {
                  const row = await loadProfileInterviewDraft(userId);
                  const draft =
                    row && (isProfileInterviewData(row.data) || isProfileInterviewV3Data(row.data))
                      ? row.data
                      : newProfileInterviewV3(me, basics);
                  await saveProfileInterviewDraft(
                    { ...draft, basics } as unknown as import("@/lib/database.types").Json,
                    row?.revision ?? 0,
                  );
                } else {
                  await saveOnboardingStep(userId, keepStep(4), {
                    smoking: basics.smoking,
                    drinking: basics.drinking,
                    mbti: basics.mbti || null,
                    religion: basics.religion || null,
                  });
                }
                setStep(Q_FIRST);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "저장 중…" : "다음"}
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
