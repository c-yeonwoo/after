import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check } from "lucide-react";

import { ProfileDetail } from "@/components/app/ProfileDetail";
import { StepShell } from "@/components/onboarding/StepShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Basics } from "@/components/onboarding/basics";
import {
  composeProfile,
  loadProfileInterviewDraft,
  saveProfileInterviewDraft,
  selectProfileFollowups,
  type Profile,
} from "@/lib/api";
import {
  CORE_QUESTIONS,
  FOLLOWUP_QUESTIONS,
  hasContactDetail,
  includedAnswers,
  isProfileInterviewData,
  newProfileInterview,
  ownWordsDraft,
  type CoreKey,
  type FollowupId,
  type ProfileInterviewData,
} from "@/lib/profileInterview";
import { toProfileView } from "@/lib/profileView";

type SaveStatus = "saved" | "saving" | "error" | "conflict";

export function ProfileInterview({
  userId,
  member,
  basics,
  editing,
  progressStep,
  progressTotal,
  onBack,
  onDone,
}: {
  userId: string;
  member: Profile | null;
  basics: Basics;
  editing: boolean;
  progressStep: number;
  progressTotal: number;
  onBack: () => void;
  onDone: (
    revision: number,
    runId?: number,
    decision?: "accepted" | "edited" | "discarded",
  ) => void;
}) {
  const [data, setData] = useState<ProfileInterviewData>(() =>
    newProfileInterview(member ?? undefined),
  );
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [actionError, setActionError] = useState("");
  const [composing, setComposing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [editingCopy, setEditingCopy] = useState(false);
  const revisionRef = useRef(0);
  const lastSavedRef = useRef<string | null>(null);
  const queueRef = useRef<Promise<number>>(Promise.resolve(0));
  const conflictRef = useRef(false);
  const selectionRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const row = await loadProfileInterviewDraft(userId);
      if (row) {
        if (!isProfileInterviewData(row.data)) throw new Error("저장된 인터뷰를 읽을 수 없습니다.");
        setData(row.data);
        revisionRef.current = row.revision;
        lastSavedRef.current = JSON.stringify(row.data);
        setEditingCopy(row.data.mode === "manual");
      }
      setLoaded(true);
    } catch {
      setLoadError(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback((snapshot: ProfileInterviewData) => {
    const next = queueRef.current
      .catch(() => revisionRef.current)
      .then(async () => {
        if (conflictRef.current) throw new Error("다른 화면에서 수정한 내용이 있어요.");
        setSaveStatus("saving");
        try {
          const revision = await saveProfileInterviewDraft(
            snapshot as unknown as import("@/lib/database.types").Json,
            revisionRef.current,
          );
          revisionRef.current = revision;
          lastSavedRef.current = JSON.stringify(snapshot);
          setSaveStatus("saved");
          return revision;
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code === "PT409") {
            conflictRef.current = true;
            setSaveStatus("conflict");
          } else {
            setSaveStatus("error");
          }
          throw error;
        }
      });
    queueRef.current = next;
    return next;
  }, []);

  // Drafts, including in-progress keystrokes, live in a private RLS table.
  useEffect(() => {
    if (!loaded || conflictRef.current) return;
    if (JSON.stringify(data) === lastSavedRef.current) return;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void persist(data).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [data, loaded, persist]);

  const advance = async (next: ProfileInterviewData) => {
    setActionError("");
    try {
      await persist(next);
      setData(next);
    } catch {
      setActionError("저장하지 못했어요. 다시 시도해 주세요.");
    }
  };

  // One analysis after the three core questions. A failed call means zero extras.
  useEffect(() => {
    if (!loaded || data.stage !== "deepen" || data.analyzed || selectionRef.current) return;
    selectionRef.current = true;
    setSelecting(true);
    void selectProfileFollowups({
      eveningNote: data.profile.eveningNote,
      knownAs: data.profile.knownAs,
      topicNote: data.profile.topicNote,
    })
      .then((result) => {
        const ids = (result?.ids ?? [])
          .filter((id): id is FollowupId => id in FOLLOWUP_QUESTIONS)
          .slice(0, 2);
        setData((current) =>
          current.stage === "deepen" && !current.analyzed
            ? {
                ...current,
                analyzed: true,
                followupIds: ids,
                suggestedTopics: result?.topics ?? [],
              }
            : current,
        );
      })
      .finally(() => {
        setSelecting(false);
        selectionRef.current = false;
      });
  }, [
    loaded,
    data.stage,
    data.analyzed,
    data.profile.eveningNote,
    data.profile.knownAs,
    data.profile.topicNote,
  ]);

  const picked = useMemo(() => includedAnswers(data), [data]);
  const copy = ownWordsDraft(data);
  const activeQuestion = data.stage.startsWith("core")
    ? CORE_QUESTIONS[Number(data.stage.slice(-1))]
    : null;
  const followupId = data.followupIds[data.followupIndex];
  const followupQuestion = followupId ? FOLLOWUP_QUESTIONS[followupId] : null;

  const preview = toProfileView({
    name: basics.name,
    birth: basics.birth,
    job: basics.job,
    mbti: basics.mbti,
    smoking: basics.smoking,
    drinking: basics.drinking,
    religion: basics.religion,
    hub_id: member?.hub_id ?? null,
    photo_url: basics.photos[0] ?? null,
    photo_paths: basics.photos,
    headline: data.profile.headline,
    intro: data.intro,
    interests: data.profile.interests,
    match_tags: data.profile.matchTags,
    topics: data.profile.topics,
    details: data.profile.details,
  });

  const generate = async () => {
    if (!picked.length) {
      setActionError("소개글에 담을 이야기를 하나 고르거나 직접 써 주세요.");
      return;
    }
    setActionError("");
    setComposing(true);
    const included = (key: CoreKey) =>
      data.included.includes(key) ? data.profile[key].trim() : undefined;
    const result = await composeProfile({
      eveningNote: included("eveningNote"),
      knownAs: included("knownAs"),
      topicNote: included("topicNote"),
      matchNote: data.included.includes("matchNote") ? data.profile.matchNote : undefined,
      interests: [],
      topics: data.profile.topics,
      matchTags: [],
      followups: data.followupIds
        .filter((id) => data.included.includes(`followup:${id}`))
        .map((id) => ({
          question: FOLLOWUP_QUESTIONS[id],
          answer: data.followupAnswers[id] ?? "",
        })),
    });
    setComposing(false);
    const next: ProfileInterviewData = {
      ...data,
      stage: "preview",
      intro: result?.intro ?? copy.intro,
      profile: { ...data.profile, headline: result?.headlines[0] ?? copy.headline },
      generatedIntro: result?.intro,
      generatedHeadlines: result?.headlines,
      generatedRunId: result?.meta?.runId,
      evidence: result?.evidence,
    };
    await advance(next);
    setEditingCopy(!result);
  };

  const saveIndicator =
    loaded && data.stage !== "start" ? (
      <p
        aria-live="polite"
        className={`shrink-0 text-xs font-medium ${
          saveStatus === "error" || saveStatus === "conflict"
            ? "text-destructive"
            : "text-muted-foreground"
        }`}
      >
        {saveStatus === "saving"
          ? "저장 중…"
          : saveStatus === "error" || saveStatus === "conflict"
            ? "저장 확인 필요"
            : "저장됨"}
      </p>
    ) : null;

  const shell = (title: string, description: string, children: ReactNode, eyebrow = "소개글") => (
    <StepShell
      step={progressStep}
      total={progressTotal}
      progressLabel="소개글"
      eyebrow={eyebrow}
      eyebrowAction={saveIndicator}
      title={title}
      description={description}
    >
      {children}
      {actionError ? (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {saveStatus === "conflict" ? (
        <div role="alert" className="mt-5 rounded-control border border-destructive p-4 text-sm">
          <p>다른 화면에서 이 인터뷰가 수정됐어요. 현재 입력은 이 화면에 남아 있어요.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => window.location.reload()}>
              저장된 내용 보기
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const latest = await loadProfileInterviewDraft(userId);
                  revisionRef.current = latest?.revision ?? 0;
                  conflictRef.current = false;
                  setSaveStatus("saving");
                  await persist(data);
                } catch {
                  setSaveStatus("conflict");
                }
              }}
            >
              내 입력으로 저장
            </Button>
          </div>
        </div>
      ) : saveStatus === "error" ? (
        <p role="alert" className="mt-5 text-sm text-destructive">
          저장되지 않았어요. 다음을 눌러 다시 시도할 수 있어요.
        </p>
      ) : null}
    </StepShell>
  );

  if (!loaded)
    return shell(
      "소개글을 불러오고 있어요",
      "",
      <div>
        {loadError ? (
          <>
            <p role="alert" className="text-sm text-destructive">
              불러오지 못했어요. 입력을 시작하기 전에 다시 시도해 주세요.
            </p>
            <Button className="mt-5" onClick={() => void load()}>
              다시 시도
            </Button>
          </>
        ) : null}
      </div>,
    );

  if (data.stage === "start")
    return shell(
      "나를 소개해 볼까요?",
      "세 가지 질문에 답하면 소개글 초안을 만들어요.",
      <>
        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={() =>
              void advance({
                ...newProfileInterview(),
                basics: data.basics,
                stage: "core0",
                mode: "interview",
              })
            }
          >
            이야기 시작하기
          </Button>
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() =>
              void advance({
                ...data,
                stage: "preview",
                mode: "manual",
                intro: editing ? data.intro : "",
              }).then(() => setEditingCopy(true))
            }
          >
            {editing ? "현재 소개글 직접 고치기" : "직접 소개글 쓰기"}
          </Button>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          답변은 AI가 정리해요. 직접 쓰기를 고르면 AI에 보내지 않아요.
        </p>
        <Button variant="ghost" className="mt-6" onClick={onBack}>
          이전
        </Button>
      </>,
    );

  if (activeQuestion) {
    const index = CORE_QUESTIONS.indexOf(activeQuestion);
    const key = activeQuestion.key;
    const title = data.alternatives.includes(key)
      ? activeQuestion.alternative
      : activeQuestion.title;
    const value = data.profile[key];
    const goNext = (skip: boolean) => {
      const next: ProfileInterviewData = {
        ...data,
        profile: { ...data.profile, [key]: skip ? "" : value.trim() },
        included: skip
          ? data.included.filter((id) => id !== key)
          : [...new Set([...data.included, key])],
        skipped: skip
          ? [...new Set([...data.skipped, key])]
          : data.skipped.filter((id) => id !== key),
        stage: index === 2 ? "deepen" : (`core${index + 1}` as ProfileInterviewData["stage"]),
      };
      void advance(next);
    };
    return shell(
      title,
      activeQuestion.hint,
      <>
        <label htmlFor="interview-answer" className="block text-base font-medium">
          내 이야기
        </label>
        <Textarea
          id="interview-answer"
          rows={4}
          maxLength={300}
          className="mt-3 text-base"
          placeholder="편하게 적어주세요."
          value={value}
          onChange={(event) =>
            setData((current) => ({
              ...current,
              profile: { ...current.profile, [key]: event.target.value },
            }))
          }
        />
        {value.length >= 250 ? (
          <p className="mt-2 text-sm text-muted-foreground">{300 - value.length}자 남았어요.</p>
        ) : null}
        <div className="mt-4 rounded-control bg-muted/50 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">이렇게 적어도 좋아요</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            {activeQuestion.examples.map((example) => (
              <li key={example}>“{example}”</li>
            ))}
          </ul>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 mt-2"
          onClick={() =>
            setData((current) => ({
              ...current,
              alternatives: current.alternatives.includes(key)
                ? current.alternatives.filter((item) => item !== key)
                : [...current.alternatives, key],
            }))
          }
        >
          질문 바꾸기
        </Button>
        <div className="mt-7 flex gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              void advance({
                ...data,
                stage:
                  index === 0 ? "start" : (`core${index - 1}` as ProfileInterviewData["stage"]),
              })
            }
          >
            이전
          </Button>
          <Button
            className="flex-1"
            size="lg"
            disabled={!value.trim()}
            onClick={() => goNext(false)}
          >
            {index === 2 ? "이야기 확인하기" : "다음 이야기"}
          </Button>
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={() => goNext(true)}>
          {index === 2 && data.profile.eveningNote.trim()
            ? "앞에서 적은 이야기로 할게요"
            : "나중에 답하기"}
        </Button>
        <p className="sr-only">이야기 {index + 1} / 3</p>
      </>,
      `이야기 ${index + 1} / 3`,
    );
  }

  if (data.stage === "deepen")
    return shell(
      "조금 더 알려주실래요?",
      "필요한 질문만 골랐어요. 건너뛰어도 괜찮아요.",
      <>
        {selecting && !data.analyzed ? (
          <p aria-live="polite" className="text-base">
            답변을 살펴보고 있어요…
          </p>
        ) : followupQuestion ? (
          <>
            <p className="mb-4 text-base font-medium">{followupQuestion}</p>
            <label htmlFor="followup-answer" className="sr-only">
              추가 질문 답변
            </label>
            <Textarea
              id="followup-answer"
              rows={4}
              maxLength={300}
              className="text-base"
              value={data.followupAnswers[followupId] ?? ""}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  followupAnswers: { ...current.followupAnswers, [followupId]: event.target.value },
                }))
              }
            />
            <p className="mt-2 text-sm text-muted-foreground">
              추가 질문 {data.followupIndex + 1} / {data.followupIds.length}
            </p>
            <Button
              className="mt-7 w-full"
              size="lg"
              onClick={() => {
                const answer = (data.followupAnswers[followupId] ?? "").trim();
                const last = data.followupIndex + 1 >= data.followupIds.length;
                void advance({
                  ...data,
                  followupIndex: last ? data.followupIndex : data.followupIndex + 1,
                  included: answer
                    ? [...new Set([...data.included, `followup:${followupId}`])]
                    : data.included,
                  stage: last ? "review" : "deepen",
                });
              }}
            >
              다음
            </Button>
          </>
        ) : data.analyzed ? (
          <p className="text-base text-muted-foreground">이미 충분히 알려주셨어요.</p>
        ) : null}
        <Button
          variant="outline"
          className="mt-4 w-full"
          size="lg"
          onClick={() => void advance({ ...data, stage: "review" })}
        >
          이 정도로 계속하기
        </Button>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => void advance({ ...data, stage: "core2" })}
        >
          이전
        </Button>
      </>,
    );

  if (data.stage === "review")
    return shell(
      "이 이야기를 소개글에 담을게요.",
      "빼고 싶은 이야기는 여기서 제외해 주세요.",
      <>
        {[
          ...CORE_QUESTIONS.map(({ key, title }): { id: string; title: string; text: string } => ({
            id: key,
            title,
            text: data.profile[key],
          })),
          ...data.followupIds.map((id) => ({
            id: `followup:${id}`,
            title: FOLLOWUP_QUESTIONS[id],
            text: data.followupAnswers[id] ?? "",
          })),
        ]
          .filter(({ text }) => text.trim())
          .map(({ id, title, text }) => (
            <label
              key={id}
              className="flex min-h-14 gap-3 border-b border-border py-4 text-base leading-relaxed"
            >
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-primary"
                checked={data.included.includes(id)}
                onChange={(event) =>
                  setData((current) => ({
                    ...current,
                    included: event.target.checked
                      ? [...new Set([...current.included, id])]
                      : current.included.filter((item) => item !== id),
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-muted-foreground">{title}</span>
                {text}
              </span>
            </label>
          ))}
        {!CORE_QUESTIONS.some(({ key }) => data.profile[key].trim()) &&
        !data.followupIds.some((id) => (data.followupAnswers[id] ?? "").trim()) ? (
          <p className="text-base text-muted-foreground">
            소개글에 담을 이야기가 아직 없어요. 하나만 답하거나 직접 쓸 수 있어요.
          </p>
        ) : null}
        {data.suggestedTopics.length ? (
          <div className="mt-6">
            <p className="text-sm font-medium">대화 주제 제안 · 선택</p>
            {data.suggestedTopics.map((topic) => (
              <label key={topic} className="mt-2 flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={data.profile.topics.includes(topic)}
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,
                      profile: {
                        ...current.profile,
                        topics: event.target.checked
                          ? [...current.profile.topics, topic]
                          : current.profile.topics.filter((item) => item !== topic),
                      },
                    }))
                  }
                />
                {topic}
              </label>
            ))}
          </div>
        ) : null}
        <Button
          className="mt-8 w-full"
          size="lg"
          disabled={composing || !picked.length}
          onClick={() => void generate()}
        >
          {composing ? "소개글을 정리하고 있어요…" : "이 내용으로 소개글 만들기"}
        </Button>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() =>
            void advance({
              ...data,
              stage: "preview",
              mode: "manual",
              intro: "",
              profile: { ...data.profile, headline: "" },
            }).then(() => setEditingCopy(true))
          }
        >
          직접 쓰기
        </Button>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => void advance({ ...data, stage: "core0" })}
        >
          답변 수정
        </Button>
      </>,
    );

  const canSave =
    data.profile.headline.trim().length >= 3 &&
    data.intro.trim().length >= 5 &&
    data.profile.headline.trim().length <= 35 &&
    data.intro.trim().length <= 300 &&
    !hasContactDetail(`${data.profile.headline} ${data.intro}`);
  return shell(
    "이렇게 소개할까요?",
    "소개글을 읽고 내 말과 다른 곳은 고쳐 주세요. 흡연·음주 등은 다음 화면에서 선택해요.",
    <>
      <ProfileDetail p={preview} />
      {data.evidence?.length &&
      data.intro === data.generatedIntro &&
      data.profile.headline === data.generatedHeadlines?.[0] ? (
        <details className="mt-5 text-sm text-muted-foreground">
          <summary className="min-h-11 cursor-pointer text-primary-strong">
            어떤 답변으로 썼나요?
          </summary>
          <ul className="mt-2 space-y-2">
            {data.evidence.map(({ sourceField, quote }, i) => (
              <li key={`${sourceField}-${i}`}>“{quote}”</li>
            ))}
          </ul>
        </details>
      ) : null}
      {!data.generatedIntro && data.mode === "interview" ? (
        <p className="mt-5 text-sm text-muted-foreground">
          문장을 다듬지 못해 적어주신 말을 그대로 담았어요. 직접 고쳐도 됩니다.
        </p>
      ) : null}
      {editingCopy ? (
        <div className="mt-7 space-y-4">
          <div>
            <label htmlFor="headline-edit" className="text-base font-medium">
              한 줄 소개
            </label>
            <Input
              id="headline-edit"
              className="mt-2 text-base"
              maxLength={35}
              value={data.profile.headline}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  profile: { ...current.profile, headline: event.target.value },
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="intro-edit" className="text-base font-medium">
              소개글
            </label>
            <Textarea
              id="intro-edit"
              rows={6}
              maxLength={300}
              className="mt-2 text-base"
              value={data.intro}
              onChange={(event) =>
                setData((current) => ({ ...current, intro: event.target.value }))
              }
            />
          </div>
          <Button variant="outline" onClick={() => setEditingCopy(false)}>
            수정 마치기
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="mt-7 w-full" onClick={() => setEditingCopy(true)}>
          소개글 수정
        </Button>
      )}
      {data.generatedIntro && data.intro !== data.generatedIntro ? (
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() =>
            setData((current) => ({
              ...current,
              intro: current.generatedIntro ?? current.intro,
              profile: {
                ...current.profile,
                headline: current.generatedHeadlines?.[0] ?? current.profile.headline,
              },
            }))
          }
        >
          처음 제안한 글 다시 보기
        </Button>
      ) : null}
      <Button
        className="mt-8 w-full"
        size="lg"
        disabled={!canSave || saveStatus === "conflict"}
        onClick={async () => {
          try {
            const revision = await persist(data);
            const decision = data.generatedRunId
              ? data.intro === data.generatedIntro &&
                data.profile.headline === data.generatedHeadlines?.[0]
                ? "accepted"
                : "edited"
              : undefined;
            onDone(revision, data.generatedRunId, decision);
          } catch {
            setActionError("저장을 확인하지 못했어요. 다시 시도해 주세요.");
          }
        }}
      >
        이 소개글로 계속하기
      </Button>
      {!canSave ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {hasContactDetail(`${data.profile.headline} ${data.intro}`)
            ? "연락처와 링크는 소개글에 적을 수 없어요. 만남이 정해진 뒤 안전하게 연락할 수 있어요."
            : "한 줄 소개 3자, 소개글 5자 이상 적어 주세요."}
        </p>
      ) : null}
      <Button
        variant="ghost"
        className="mt-3 w-full"
        onClick={() =>
          void advance({ ...data, stage: data.mode === "manual" ? "start" : "review" })
        }
      >
        이전
      </Button>
    </>,
  );
}
