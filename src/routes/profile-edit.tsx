import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppScreen } from "@/components/app/AppScreen";
import { PhotoSetEditor } from "@/components/onboarding/PhotoSetEditor";
import { Chip } from "@/components/onboarding/Chip";
import {
  DRINKING_OPTIONS,
  MBTI_AXES,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
  ageFrom,
  basicsIssues,
  type Basics,
} from "@/components/onboarding/basics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  loadProfileInterviewDraft,
  publishProfileInterviewV3,
  saveProfileInterviewDraft,
  type Profile,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { supabase } from "@/lib/supabase";
import {
  editableBasics,
  editableStory,
  profileEditDraft,
  profileStoryIssues,
} from "@/lib/profileEditing";
import { STORY_QUESTIONS, type ProfileStoryV3 } from "@/lib/profileStory";
import type { Json } from "@/lib/database.types";

export const Route = createFileRoute("/profile-edit")({
  head: () => ({
    meta: [{ title: "프로필 수정 — 애프터" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfileEditPage,
});

function ProfileEditPage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login", replace: true });
  }, [me, ready, navigate]);
  if (!me)
    return (
      <AppScreen title="프로필 수정" back="/profile" hideTabs>
        <p role="status" className="py-8 text-sm text-muted-foreground">
          프로필을 불러오고 있어요.
        </p>
      </AppScreen>
    );
  if (me.onboarding_step < 7)
    return (
      <AppScreen title="프로필 준비" back="/home" hideTabs>
        <p className="py-4 text-sm">먼저 프로필을 완성해 주세요.</p>
        <Button asChild>
          <Link to="/signup" search={{ prepare: true }}>
            준비 이어가기
          </Link>
        </Button>
      </AppScreen>
    );
  return <ProfileEditor key={me.id} member={me} />;
}

function ProfileEditor({ member }: { member: Profile }) {
  const navigate = useNavigate();
  const { setMe } = useMe();
  const [basics, setBasics] = useState(() => editableBasics(member));
  const [story, setStory] = useState(() => editableStory(member));
  const initial = useRef(
    JSON.stringify({ basics: editableBasics(member), story: editableStory(member) }),
  );
  const source = useRef(member);
  const revision = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const draftReplacementApproved = useRef(false);
  const skipBlock = useRef(false);
  const submitting = useRef(false);
  const dirty = initial.current !== JSON.stringify({ basics, story });
  const blocker = useBlocker({
    shouldBlockFn: () => !skipBlock.current && (dirty || uploading || submitting.current),
    enableBeforeUnload: dirty || uploading || saving,
    withResolver: true,
  });
  useEffect(() => {
    let active = true;
    void loadProfileInterviewDraft(member.id)
      .then((row) => {
        if (!active) return;
        revision.current = row?.revision ?? 0;
        setHasDraft(Boolean(row));
        setLoaded(true);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [member.id]);
  const setB = (patch: Partial<Basics>) => setBasics((value) => ({ ...value, ...patch }));
  const issues = [
    ...basicsIssues(basics),
    ...(!basics.smoking ? ["흡연 선택"] : []),
    ...(!basics.drinking ? ["음주 선택"] : []),
    ...(basics.mbti && !/^[IE][SN][TF][PJ]$/.test(basics.mbti)
      ? ["MBTI 네 축 선택 또는 선택 안 함"]
      : []),
    ...profileStoryIssues(story),
  ];
  const canSave = loaded && dirty && !issues.length && !saving && !uploading && !conflict;
  const age = ageFrom(basics.birth);

  async function save() {
    if (!canSave || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user.id !== member.id)
        throw new Error("로그인한 계정이 바뀌었어요. 다시 로그인해 주세요.");
      const { data: current, error: readError } = await supabase
        .from("profiles")
        .select("updated_at")
        .eq("id", member.id)
        .setHeader("Authorization", `Bearer ${session.access_token}`)
        .single();
      if (readError) throw readError;
      if (current.updated_at !== source.current.updated_at)
        throw Object.assign(new Error("profile changed"), { code: "PT409" });
      revision.current = await saveProfileInterviewDraft(
        profileEditDraft(source.current, basics, story) as unknown as Json,
        revision.current,
        session.access_token,
      );
      const saved = await publishProfileInterviewV3(revision.current, basics, session.access_token);
      // An account switch during publication must never restore the old account's UI.
      if ((await supabase.auth.getSession()).data.session?.user.id !== member.id) return;
      setMe(saved);
      skipBlock.current = true;
      blocker.reset?.();
      toast.success("프로필을 저장했어요.");
      void navigate({ to: "/profile", replace: true });
    } catch (caught) {
      if ((caught as { code?: string }).code === "PT409") {
        setConflict(true);
        setError("다른 화면에서 프로필이 바뀌었어요. 최신 내용을 확인한 뒤 다시 수정해 주세요.");
      } else
        setError(
          caught instanceof Error && caught.message.startsWith("로그인한")
            ? caught.message
            : "저장하지 못했어요. 입력한 내용은 그대로예요. 다시 시도해 주세요.",
        );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <AppScreen
        title="프로필 수정"
        back="/profile"
        hideTabs
        keyboardAware
        footer={
          <div className="space-y-2 px-5 pb-2 pt-3">
            {error ? (
              <p role="alert" className="text-sm leading-relaxed text-destructive">
                {error}
              </p>
            ) : null}
            {issues.length && dirty ? (
              <p role="status" className="text-sm leading-relaxed text-muted-foreground">
                {issues.join(" · ")}이 필요해요.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                disabled={saving || uploading}
                onClick={() => void navigate({ to: "/profile" })}
              >
                취소
              </Button>
              <Button
                className="flex-[2]"
                size="lg"
                disabled={!canSave}
                onClick={() => {
                  if (hasDraft && !draftReplacementApproved.current) setConfirmDraft(true);
                  else void save();
                }}
              >
                {uploading ? "사진을 올리는 중…" : saving ? "저장 중…" : "변경사항 저장"}
              </Button>
            </div>
          </div>
        }
      >
        {loadError ? (
          <div role="alert" className="space-y-3 py-8">
            <p className="text-sm">저장 상태를 확인하지 못했어요. 입력 전 다시 불러와 주세요.</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              다시 불러오기
            </Button>
          </div>
        ) : (
          <fieldset
            disabled={saving || !loaded || conflict}
            className="min-w-0 space-y-8 pb-4 [&_input]:border-transparent [&_input]:bg-muted/60 [&_textarea]:border-transparent [&_textarea]:bg-muted/60"
          >
            <p className="text-sm text-muted-foreground">
              바꾸고 싶은 부분만 고친 뒤 저장해 주세요.
            </p>
            <section aria-labelledby="edit-photos">
              <h2 id="edit-photos" className="mb-3 text-base font-semibold">
                프로필 사진
              </h2>
              <PhotoSetEditor
                photos={basics.photos}
                onChange={(photos) => setB({ photos })}
                onUploadingChange={setUploading}
                showCoaching={
                  JSON.stringify(basics.photos) !==
                  JSON.stringify(editableBasics(source.current).photos)
                }
              />
              {member.photo_state === "rejected" ? (
                <p className="mt-3 text-sm text-destructive">
                  {member.photo_reject_reason ?? "다른 사진으로 다시 올려주세요."}
                </p>
              ) : null}
              {JSON.stringify(basics.photos) !==
              JSON.stringify(editableBasics(source.current).photos) ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  바꾼 사진은 저장 후 다시 검수해요.
                </p>
              ) : null}
            </section>
            <section aria-labelledby="edit-basics" className="space-y-4">
              <h2 id="edit-basics" className="text-base font-semibold">
                기본 정보
              </h2>
              <Field label="이름" id="edit-name">
                <Input
                  id="edit-name"
                  value={basics.name}
                  maxLength={60}
                  onChange={(e) => setB({ name: e.target.value })}
                />
              </Field>
              <Field label="생년월일" id="edit-birth">
                <Input
                  id="edit-birth"
                  type="date"
                  value={basics.birth}
                  readOnly={Boolean(member.identity_verified_at)}
                  aria-describedby="edit-birth-help"
                  onChange={(e) => setB({ birth: e.target.value })}
                />
                <p id="edit-birth-help" className="mt-2 text-xs text-muted-foreground">
                  {member.identity_verified_at
                    ? "본인확인에서 확인한 생년월일이에요."
                    : age !== null
                      ? `만 ${age}세 · 만 19~79세만 이용할 수 있어요.`
                      : "생년월일을 확인해 주세요."}
                </p>
              </Field>
              <Field label="직업" id="edit-job">
                <Input
                  id="edit-job"
                  value={basics.job}
                  maxLength={80}
                  onChange={(e) => setB({ job: e.target.value })}
                />
              </Field>
            </section>
            <section aria-labelledby="edit-lifestyle" className="space-y-5">
              <h2 id="edit-lifestyle" className="text-base font-semibold">
                생활 정보
              </h2>
              <div role="group" aria-label="MBTI (선택)">
                <p className="mb-2 text-sm font-medium">MBTI (선택)</p>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1].map((row) =>
                    MBTI_AXES.map((axis, i) => {
                      const letter = row ? axis.right : axis.left;
                      return (
                        <Chip
                          key={letter}
                          selected={basics.mbti[i] === letter}
                          onClick={() => {
                            const parts = [0, 1, 2, 3].map((index) => basics.mbti[index] ?? "_");
                            parts[i] = parts[i] === letter ? "_" : letter;
                            setB({ mbti: parts.join("") });
                          }}
                        >
                          {letter}
                        </Chip>
                      );
                    }),
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  disabled={!basics.mbti}
                  onClick={() => setB({ mbti: "" })}
                >
                  선택 안 함
                </Button>
              </div>
              <Choices
                label="흡연"
                value={basics.smoking}
                options={SMOKING_OPTIONS}
                onChange={(smoking) => setB({ smoking })}
              />
              <Choices
                label="음주"
                value={basics.drinking}
                options={DRINKING_OPTIONS}
                onChange={(drinking) => setB({ drinking })}
              />
              <Choices
                label="종교 (선택)"
                value={basics.religion}
                options={RELIGION_OPTIONS}
                onChange={(religion) =>
                  setB({ religion: religion === basics.religion ? "" : religion })
                }
              />
            </section>
            <section aria-labelledby="edit-story" className="space-y-4">
              <h2 id="edit-story" className="text-base font-semibold">
                소개글
              </h2>
              <Link
                to="/profile-interview"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary-strong"
              >
                {hasDraft ? "작성 중인 인터뷰 이어가기" : "매니저와 다시 인터뷰하기"}
              </Link>
              <Field label="한 줄 소개" id="edit-headline">
                <Input
                  id="edit-headline"
                  value={story.headline}
                  maxLength={35}
                  onChange={(e) => setStory((s) => ({ ...s, headline: e.target.value }))}
                />
              </Field>
              <Field label="짧은 소개" id="edit-summary">
                <Textarea
                  id="edit-summary"
                  rows={3}
                  value={story.summary}
                  maxLength={300}
                  onChange={(e) => setStory((s) => ({ ...s, summary: e.target.value }))}
                />
              </Field>
              {STORY_QUESTIONS.map((question) => (
                <Field key={question.id} label={question.question} id={`edit-${question.id}`}>
                  <Textarea
                    id={`edit-${question.id}`}
                    rows={3}
                    maxLength={240}
                    value={story.sections.find((s) => s.id === question.id)?.answer ?? ""}
                    onChange={(e) =>
                      setStory((s) => ({
                        ...s,
                        sections: STORY_QUESTIONS.flatMap((q) => {
                          const answer =
                            q.id === question.id
                              ? e.target.value
                              : (s.sections.find((section) => section.id === q.id)?.answer ?? "");
                          return answer ? [{ ...q, questionVersion: 1, answer }] : [];
                        }),
                      }))
                    }
                  />
                </Field>
              ))}
            </section>
          </fieldset>
        )}
      </AppScreen>
      <AlertDialog open={confirmDraft} onOpenChange={setConfirmDraft}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>작성 중인 인터뷰를 이 내용으로 바꿀까요?</AlertDialogTitle>
            <AlertDialogDescription>
              저장하면 이 화면의 내용이 프로필에 반영되고, 이전 인터뷰 초안은 정리돼요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                draftReplacementApproved.current = true;
                void save();
              }}
            >
              현재 내용 저장
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {saving || uploading ? "작업 중이에요" : "수정한 내용을 저장하지 않고 나갈까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {saving || uploading
                ? "작업이 끝날 때까지 잠시 기다려 주세요."
                : "현재 프로필은 그대로 유지돼요. 지금 수정한 내용은 사라져요."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>계속 수정</AlertDialogCancel>
            <AlertDialogAction disabled={saving || uploading} onClick={() => blocker.proceed?.()}>
              저장하지 않고 나가기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
function Choices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip key={option.id} selected={value === option.id} onClick={() => onChange(option.id)}>
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
