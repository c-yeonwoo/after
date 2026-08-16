import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  followUpFor,
  TOPIC_TAGS,
  buildIntro,
  suggestHeadlines,
  emptyProfile,
  type ProfileDraft,
} from "@/components/onboarding/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BRAND, HUBS, isCompanyEmail } from "@/lib/brand";
import {
  authErrorMessage,
  completeOnboarding,
  devFetchLatestOtp,
  requestEmailCode,
  recordConsent,
  saveOnboardingStep,
  verifyEmailCode,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { uploadProfilePhoto, usePhotoUrl } from "@/lib/photo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { edit?: true } =>
    search.edit === "1" || search.edit === true ? { edit: true } : {},
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

const TOTAL = 7;
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
  const { edit } = Route.useSearch();
  const editing = Boolean(edit);
  const { me, ready } = useMe();
  const [step, setStep] = useState(editing ? 2 : 1);
  const [gender, setGender] = useState<Gender | null>(null);
  const [hubId, setHubId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** 저장된 프로필을 한 번만 불어온다 — me 가 갱신될 때마다 폼을 덮어쓰면 입력이 날아간다. */
  const [resumed, setResumed] = useState(false);
  /** 방금 고른 파일의 blob URL. 업로드가 끝나기 전에도 보여주기 위한 것. */
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [basics, setBasics] = useState<Basics>(emptyBasics);
  const [profile, setProfile] = useState<ProfileDraft>(emptyProfile);
  const [intro, setIntro] = useState("");
  const [seedInput, setSeedInput] = useState("");
  const [activeSeed, setActiveSeed] = useState(0);
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
    if (!editing) {
      // 이미 진행한 단계로 착지시킨다. 저장 시점과 같은 번호를 쓴다:
      // 4=기본정보 저장됨 → 관심사, 5=관심사 저장됨 → 매치/토픽, 6 → 확인.
      setStep(
        me.onboarding_step >= 6 ? 9 : me.onboarding_step >= 5 ? 8 : me.onboarding_step >= 4 ? 6 : 2,
      );
    }
    setGender(me.gender);
    setHubId(me.hub_id);
    setEmail(me.company_email);
    const nextBasics: Basics = {
      name: me.name ?? "",
      photo: me.photo_url ?? "",
      birth: me.birth ?? "",
      job: me.job ?? "",
      mbti: me.mbti ?? "",
      smoking: me.smoking ?? "",
      drinking: me.drinking ?? "",
      religion: me.religion ?? "",
    };
    setBasics(nextBasics);
    setProfile({
      headline: me.headline ?? "",
      interests: me.interests,
      details: (me.details as Record<string, string>) ?? {},
      matchTags: me.match_tags,
      matchNote: me.match_note ?? "",
      topics: me.topics,
      topicNote: me.topic_note ?? "",
    });
    setIntro(me.intro ?? me.headline ?? "");
    setMbtiParts(nextBasics.mbti ? nextBasics.mbti.split("") : ["", "", "", ""]);
  }, [editing, ready, me, navigate, resumed]);

  // 저장된 값은 Storage 경로라 그대로 <img src> 에 넣을 수 없다.
  const savedPhoto = usePhotoUrl(basics.photo);
  const shownPhoto = photoPreview ?? savedPhoto;

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
      <StepShell
        step={1}
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
          <Button className="w-full" size="lg" disabled={!gender} onClick={() => setStep(3)}>
            다음
          </Button>
        </div>
      </StepShell>
    );
  }

  if (step === 2) {
    const age = ageFrom(basics.birth);
    const setB = (n: Partial<Basics>) => setBasics((prev) => ({ ...prev, ...n }));
    const pickMbti = (i: number, letter: string) => {
      const next = [...mbtiParts];
      next[i] = next[i] === letter ? "" : letter;
      setMbtiParts(next);
      setB({ mbti: next.every(Boolean) ? next.join("") : "" });
    };

    return (
      <StepShell
        step={4}
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
                {shownPhoto ? (
                  <img
                    src={shownPhoto}
                    alt="선택한 프로필 사진 미리보기"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                    미등록
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="photo"
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-medium focus-within:ring-2 focus-within:ring-ring"
                >
                  {photoBusy ? "올리는 중…" : basics.photo ? "사진 변경" : "사진 선택"}
                  <input
                    id="photo"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // 미리보기는 즉시(blob), 실제 값은 Storage 경로다.
                      // 예전에는 base64 를 행에 넣어 모든 select 에 딸려 나왔다(UX-3).
                      setPhotoPreview(URL.createObjectURL(file));
                      setPhotoBusy(true);
                      try {
                        setB({ photo: await uploadProfilePhoto(file) });
                      } catch (err) {
                        setPhotoPreview(null);
                        toast.error(
                          err instanceof Error ? err.message : "사진을 올리지 못했습니다.",
                        );
                      } finally {
                        setPhotoBusy(false);
                      }
                    }}
                  />
                </label>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  얼굴이 잘 보이는 사진 한 장이면 충분합니다.
                </p>
              </div>
            </div>

            {/*
              검수 상태를 사용자에게 돌려준다.

              s18 이후 사진은 승인 전까지 후보 풀에서 빠진다. 그런데 그 사실이
              어디에도 안 적혀 있어서, 반려당한 사람은 **아무에게도 안 보이는
              상태로 이유도 모른 채** 남았다(출시 전 검증 B5). 사유는 이미
              profiles.photo_reject_reason 에 있고 본인만 읽을 수 있다 —
              화면이 그걸 안 읽었을 뿐이다.

              사진을 새로 고르면 트리거가 pending 으로 되돌리므로(s18), 여기서
              할 일은 "지금 어느 상태이고 무엇을 하면 되는지" 를 말하는 것이다.
            */}
            {!photoPreview && me?.photo_url && me.photo_state !== "approved" ? (
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
          <Button variant="ghost" onClick={() => (editing ? navigate({ to: "/me" }) : setStep(4))}>
            {editing ? "취소" : "이전"}
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!basicsValid(basics) || saving}
            onClick={async () => {
              // 인증이 앞으로 왔으므로 이 시점엔 이미 프로필 행이 있다 —
              // 기본 정보를 바로 서버에 남긴다. 예전에는 completeOnboarding()
              // 까지 가야 저장돼서, 관심사 단계에서 이탈하면 이름·생일까지
              // 전부 다시 입력해야 했다(진단 UX-2).
              if (userId) {
                setSaving(true);
                try {
                  // 수정 모드에서는 단계를 **내리지 않는다.** 완료된 프로필(7)에
                  // 4 를 쓰면 매칭 자격을 잃는다 — eligible 조건이 step=7 이다.
                  await saveOnboardingStep(userId, editing ? (me?.onboarding_step ?? 4) : 4, {
                    name: basics.name,
                    birth: basics.birth,
                    job: basics.job,
                    mbti: basics.mbti,
                    smoking: basics.smoking,
                    drinking: basics.drinking,
                    religion: basics.religion,
                    photo_url: basics.photo || null,
                  });
                } finally {
                  setSaving(false);
                }
              }
              setStep(6);
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
        step={2}
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
        step={3}
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
                <span>숫자 6자리를 입력해 주세요.</span>
              </p>
            ) : (
              <p id="code-hint" className="mt-2 text-sm text-muted-foreground">
                {autoFilled
                  ? "개발환경이라 방금 발송된 코드를 자동으로 채웠습니다."
                  : "메일로 받은 6자리를 입력해 주세요."}
              </p>
            )}
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
          <Button variant="ghost" onClick={() => setStep(3)}>
            이전
          </Button>
          {codeSent ? (
            <Button
              className="flex-1"
              size="lg"
              disabled={code.length !== 6 || !agreed || authBusy}
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
                  await recordConsent();
                  setUserId(created.id);
                  setStep(2);
                } catch (err) {
                  setAuthError(authErrorMessage(err));
                } finally {
                  setAuthBusy(false);
                }
              }}
            >
              {authBusy ? "확인 중…" : "인증하고 계속"}
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
                  await requestEmailCode(email);
                  setCodeSent(true);
                  toast.success("인증 코드를 보냈습니다.");
                  const dev = await devFetchLatestOtp(email);
                  if (dev) {
                    setCode(dev);
                    setAutoFilled(true);
                  }
                } catch (err) {
                  setAuthError(authErrorMessage(err));
                } finally {
                  setAuthBusy(false);
                }
              }}
            >
              {authBusy ? "보내는 중…" : "인증 코드 받기"}
            </Button>
          )}
        </div>
      </StepShell>
    );
  }

  // (한 줄 소개는 마지막 확인 화면에서 답변 기반으로 제안합니다)

  // 5 — 요즘 시간 쓰는 것들 (키워드 + 선택 후속 답변)
  if (step === 6) {
    const seeds = profile.interests.map((v) => v.trim()).filter(Boolean);
    const filled = seeds.length;
    const grown = seeds.filter((s) => profile.details[s]?.trim()).length;
    const ok = filled >= MIN_INTERESTS;
    const active = seeds[activeSeed] ?? "";
    const canAdd = profile.interests.length < MAX_INTERESTS;

    const addSeed = () => {
      const value = seedInput.trim();
      if (!value || !canAdd || profile.interests.includes(value)) return;
      patch({ interests: [...profile.interests, value] });
      setSeedInput("");
      setActiveSeed(profile.interests.length);
    };

    return (
      <StepShell
        step={5}
        total={TOTAL}
        eyebrow="프로필"
        title="요즘 시간 쓰는 것들"
        description={`${MIN_INTERESTS}~${MAX_INTERESTS}개를 적어주세요. 아래 한 줄 메모는 선택이고, 적으면 소개글이 더 좋아집니다.`}
      >
        <div className="flex items-center gap-2">
          <Input
            value={seedInput}
            aria-label="요즘 시간 쓰는 것 추가"
            placeholder={INTEREST_PLACEHOLDERS[filled] ?? "직접 적기"}
            disabled={!canAdd}
            onChange={(e) => setSeedInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                addSeed();
              }
            }}
          />
          <Button variant="outline" disabled={!seedInput.trim() || !canAdd} onClick={addSeed}>
            추가
          </Button>
        </div>

        {seeds.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {seeds.map((label, i) => {
              const selected = i === activeSeed;
              const hasLeaf = Boolean(profile.details[label]?.trim());
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveSeed(i)}
                  className={`min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                  {hasLeaf ? <span className="ml-1.5 opacity-70">·</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">하나 적으면 여기에 모입니다.</p>
        )}

        {active ? (
          <div className="mt-5 rounded-surface border border-border bg-muted/40 p-4">
            <p className="text-sm font-semibold text-foreground">
              {followUpFor(active)}
              <span className="ml-1.5 font-normal text-muted-foreground">선택</span>
            </p>
            <Textarea
              rows={3}
              className="mt-3 bg-card"
              aria-label={`${active} 후속 답변`}
              placeholder="한두 문장이면 충분합니다 (선택)"
              value={profile.details[active] ?? ""}
              onChange={(e) => patch({ details: { ...profile.details, [active]: e.target.value } })}
            />
            <button
              type="button"
              className="mt-2 min-h-11 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => {
                const nextDetails = { ...profile.details };
                delete nextDetails[active];
                patch({
                  interests: profile.interests.filter((v) => v.trim() !== active),
                  details: nextDetails,
                });
                setActiveSeed(0);
              }}
            >
              이 항목 지우기
            </button>
          </div>
        ) : null}

        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {filled} / {MAX_INTERESTS}
          {grown ? ` · 메모 ${grown}개` : ""}
        </p>

        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={() => setStep(2)}>
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!ok || saving}
            onClick={async () => {
              patch({ interests: seeds });
              if (userId) {
                setSaving(true);
                try {
                  await saveOnboardingStep(userId, 5, {
                    interests: seeds,
                    details: profile.details as never,
                  });
                } finally {
                  setSaving(false);
                }
              }
              setStep(8);
            }}
          >
            {saving ? "저장 중…" : "다음"}
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
        step={6}
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
          <p className="text-sm font-semibold text-foreground">
            이번 만남에서 이야기하고 싶은 주제 (2개 이상)
          </p>
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
            disabled={!ok || saving}
            onClick={async () => {
              setIntro(draft);
              if (userId) {
                setSaving(true);
                try {
                  await saveOnboardingStep(userId, 6, {
                    match_tags: profile.matchTags,
                    match_note: profile.matchNote || null,
                    topics: profile.topics,
                    topic_note: profile.topicNote || null,
                  });
                } finally {
                  setSaving(false);
                }
              }
              setStep(9);
            }}
          >
            {saving ? "저장 중…" : "프로필 만들기"}
          </Button>
        </div>
      </StepShell>
    );
  }

  const topics = [
    ...profile.topics,
    ...(profile.topicNote.trim() ? [profile.topicNote.trim()] : []),
  ];
  const headlineOptions = suggestHeadlines(profile, basics.job);

  return (
    <StepShell
      step={7}
      total={TOTAL}
      eyebrow="프로필 확인"
      title="이렇게 소개해도 될까요?"
      description="적은 내용으로 만든 초안입니다."
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {shownPhoto ? (
          <img src={shownPhoto} alt="내 프로필 사진" className="aspect-[4/5] w-full object-cover" />
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
              RELIGION_OPTIONS.find((o) => o.id === basics.religion)?.label,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <p className="mt-5 text-xs font-semibold tracking-wide text-primary-strong">
            요즘 시간 쓰는 것들
          </p>

          <div className="mt-2 space-y-2">
            {selectedInterests.map((label) => (
              <div
                key={label}
                className="rounded-surface border border-border bg-muted/30 px-3 py-2"
              >
                <p className="text-sm font-semibold text-foreground">{label}</p>
                {profile.details[label]?.trim() ? (
                  <p className="mt-1 text-sm text-muted-foreground">{profile.details[label]}</p>
                ) : null}
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs font-semibold tracking-wide text-primary-strong">
            이번 만남에서 나누고 싶은 이야기
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <span key={t} className="rounded-full bg-accent/40 px-3 py-1 text-xs text-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-foreground">한 줄 소개 제안</p>
        <p className="mt-1 text-sm text-muted-foreground">
          적어주신 답변을 바탕으로 만든 문장입니다. 마음에 드는 것을 고르거나 직접 고쳐 쓰세요.
        </p>
        <div className="mt-3 space-y-2">
          {headlineOptions.map((line) => {
            const selected = profile.headline === line;
            return (
              <button
                key={line}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  patch({ headline: line });
                  setIntro(buildIntro({ ...profile, headline: line }));
                }}
                className={cn(
                  "w-full rounded-xl border border-border bg-card p-4 text-left text-sm leading-relaxed transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected
                    ? "border-primary-strong bg-primary/10"
                    : "hover:border-primary-strong/60",
                )}
              >
                “{line}”
              </button>
            );
          })}
        </div>
        <Input
          className="mt-3"
          aria-label="한 줄 소개 직접 쓰기"
          placeholder="직접 쓰기 (선택)"
          value={profile.headline}
          onChange={(e) => patch({ headline: e.target.value })}
        />
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
          intro.trim().length > 0 && intro.trim().length < 20
            ? "font-medium text-destructive"
            : "text-muted-foreground",
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
          disabled={
            intro.trim().length < 20 || profile.headline.trim().length < 5 || saving || !userId
          }
          onClick={async () => {
            if (!userId) return;
            setSaving(true);
            try {
              await completeOnboarding(userId, basics, profile, intro.trim());
              toast.success("프로필이 저장되었습니다");
              navigate({ to: "/me" });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "저장 중…" : "프로필 확정"}
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
