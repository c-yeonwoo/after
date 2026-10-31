import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ProfileDetail } from "@/components/app/ProfileDetail";
import { Chip } from "@/components/onboarding/Chip";
import { StepShell } from "@/components/onboarding/StepShell";
import type { Basics } from "@/components/onboarding/basics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  generateProfileStory,
  loadProfileInterviewDraft,
  saveProfileInterviewDraft,
  type Profile,
  type StoryAnalysis,
  type StoryGenerationResult,
} from "@/lib/api";
import {
  FOLLOWUP_LABELS,
  hasStoryMaterial,
  migrateInterviewV2,
  sourceIdsFor,
  type ProfileInterviewV3Data,
} from "@/lib/profileInterviewV3";
import { hasContactDetail } from "@/lib/profileInterview";
import {
  INTERVIEW_CHOICE_PAGES,
  approvedProfileSignals,
} from "../../../supabase/functions/_shared/profile-signals";
import { PROFILE_INTERVIEW_PROMPTS } from "@/lib/profileInterviewPrompts";
import {
  profileAnswerCoaching,
  profileCoachingSources,
  type ProfileCoachingSource,
} from "@/lib/profileCoaching";
import { toProfileView } from "@/lib/profileView";
import {
  CHOICE_QUESTIONS,
  STORY_QUESTIONS,
  storyFromAnswers,
  validProfileStory,
  type ProfileStoryV3,
  type StorySectionId,
} from "@/lib/profileStory";

type SaveStatus = "saved" | "saving" | "error" | "conflict";
const CORE_KEYS: StorySectionId[] = ["daily_life", "getting_closer", "conversation"];
const INTERVIEW_STAGES: string[] = [
  "start",
  "choices0",
  "choices1",
  "choices2",
  "story0",
  "story1",
  "story2",
  "analyzing",
  "followups",
  "understanding",
  "review",
  "preview",
];

function resultError(result: StoryGenerationResult): string {
  if (result.status === "needs_input") return "내 이야기를 조금만 더 알려주세요.";
  if (result.status !== "error") return "";
  switch (result.code) {
    case "rate_limited":
    case "daily_limit":
      return "오늘은 소개글 생성 횟수를 모두 사용했어요. 직접 정리하거나 내일 다시 시도해 주세요.";
    case "config_error":
    case "provider_request_invalid":
      return "소개글 생성 설정을 확인하고 있어요. 답변은 저장되어 있어요.";
    case "grounding_failed":
      return "내 이야기와 다른 문장이 발견돼 초안을 보여드리지 않았어요. 다시 만들어 주세요.";
    case "invalid_output":
      return "소개글을 다듬는 과정이 끝나지 않았어요. 다시 시도해 주세요.";
    default:
      return "소개글을 다듬는 데 문제가 생겼어요. 답변은 저장되어 있어요.";
  }
}

function SourceNotes({ sources, label }: { sources: ProfileCoachingSource[]; label: string }) {
  if (!sources.length) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="min-h-11 cursor-pointer content-center rounded-control py-2 font-medium text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      <dl className="space-y-4 pb-3 pt-1">
        {sources.map((source) => (
          <div key={source.id}>
            <dt className="text-xs leading-relaxed text-muted-foreground">{source.label}</dt>
            <dd className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {source.text}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function ProfileInterviewV3({
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
  ) => Promise<void>;
}) {
  const [data, setData] = useState<ProfileInterviewV3Data>(() =>
    migrateInterviewV2(null, member, basics),
  );
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);
  const [editingCopy, setEditingCopy] = useState(false);
  const revisionRef = useRef(0);
  const lastSavedRef = useRef<string | null>(null);
  const currentDataRef = useRef(data);
  currentDataRef.current = data;
  const queueRef = useRef<Promise<number>>(Promise.resolve(0));
  const publishingRef = useRef(false);
  const requestingRef = useRef(false);
  const conflictRef = useRef(false);
  const initialInputsRef = useRef({ member, basics });
  const loadStartedRef = useRef(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const row = await loadProfileInterviewDraft(userId);
      if (row) {
        const next = migrateInterviewV2(
          row.data,
          initialInputsRef.current.member,
          initialInputsRef.current.basics,
        );
        setData(next);
        revisionRef.current = row.revision;
        lastSavedRef.current = JSON.stringify(row.data);
        setEditingCopy(next.mode === "manual");
      }
      setLoaded(true);
    } catch {
      setLoadError(true);
    }
  }, [userId]);

  useEffect(() => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    void load();
  }, [load]);

  const persist = useCallback((snapshot: ProfileInterviewV3Data) => {
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
          setSaveStatus(
            JSON.stringify(snapshot) === JSON.stringify(currentDataRef.current)
              ? "saved"
              : "saving",
          );
          return revision;
        } catch (caught) {
          if ((caught as { code?: string }).code === "PT409") {
            conflictRef.current = true;
            setSaveStatus("conflict");
          } else setSaveStatus("error");
          throw caught;
        }
      });
    queueRef.current = next;
    return next;
  }, []);

  useEffect(() => {
    if (
      !loaded ||
      publishingRef.current ||
      conflictRef.current ||
      JSON.stringify(data) === lastSavedRef.current
    )
      return;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      // Publication uses the final saved revision. A previously scheduled
      // autosave must not increment it while onDone is still in flight.
      if (
        !publishingRef.current &&
        !advancingRef.current &&
        !requestingRef.current &&
        JSON.stringify(data) === JSON.stringify(currentDataRef.current)
      )
        void persist(data).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [data, loaded, persist]);

  const advance = async (next: ProfileInterviewV3Data) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAdvancing(true);
    setActionError("");
    try {
      await persist(next);
      currentDataRef.current = next;
      setData(next);
      setSaveStatus("saved");
    } catch {
      setActionError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
    }
  };

  const editInput = (patch: Partial<ProfileInterviewV3Data>) => {
    setData((current) => ({
      ...current,
      ...patch,
      sourceRevision: current.sourceRevision + 1,
      understandingConfirmed: false,
      generatedStory: null,
      generatedRunId: undefined,
    }));
  };

  const request = (mode: "analyze" | "compose", snapshot: ProfileInterviewV3Data) =>
    generateProfileStory({
      mode,
      answers: snapshot.answers,
      choices: snapshot.choices,
      choiceCustom: snapshot.choiceCustom,
      followups: snapshot.followups,
      publicIds: snapshot.publicIds.filter((id) => sourceIdsFor(snapshot).includes(id)),
      smoking: basics.smoking,
      drinking: basics.drinking,
      confirmed: mode === "compose" ? snapshot.understanding : undefined,
    });

  const analyze = async () => {
    if (requestingRef.current || advancingRef.current) return;
    if (!hasStoryMaterial(data)) {
      setActionError("선택이나 짧은 이야기 중 하나만 더 알려주세요.");
      return;
    }
    requestingRef.current = true;
    setBusy(true);
    setActionError("");
    const snapshot = { ...data, stage: "analyzing" as const };
    try {
      await persist(snapshot);
      currentDataRef.current = snapshot;
      setData(snapshot);
      setSaveStatus("saved");
      const result = await request("analyze", snapshot);
      if (result.status === "success" && "analysis" in result) {
        const analysis: StoryAnalysis = result.analysis;
        await advance({
          ...snapshot,
          stage: analysis.followupIds.length ? "followups" : "understanding",
          followupIds: analysis.followupIds.filter((id) => id in FOLLOWUP_LABELS).slice(0, 2),
          understanding: analysis.summary.slice(0, 3),
          contradictions: analysis.contradictions.slice(0, 2),
          generationError: undefined,
        });
      } else {
        await advance({ ...snapshot, stage: "error", generationError: resultError(result) });
      }
    } catch {
      setActionError("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      requestingRef.current = false;
      setBusy(false);
    }
  };

  const generate = async () => {
    if (requestingRef.current || advancingRef.current) return;
    if (!hasStoryMaterial(data)) {
      setActionError("소개할 이야기를 하나만 더 알려주세요.");
      return;
    }
    requestingRef.current = true;
    setBusy(true);
    setActionError("");
    const snapshot = data;
    try {
      await persist(snapshot);
      const result = await request("compose", snapshot);
      if (result.status === "success" && "story" in result && validProfileStory(result.story)) {
        await advance({
          ...snapshot,
          stage: "preview",
          story: result.story,
          generatedStory: result.story,
          generatedRunId: result.runId,
          storySourceRevision: snapshot.sourceRevision,
          generationError: undefined,
        });
        setEditingCopy(false);
      } else
        setActionError(resultError(result) || "소개글을 확인하지 못했어요. 다시 시도해 주세요.");
    } catch {
      setActionError("답변을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      requestingRef.current = false;
      setBusy(false);
    }
  };

  const manual = () => {
    const approvedAnswers = Object.fromEntries(
      CORE_KEYS.filter((id) => data.publicIds.includes(`answer:${id}`)).map((id) => [
        id,
        data.answers[id],
      ]),
    );
    const story =
      data.story && data.storySourceRevision === data.sourceRevision
        ? data.story
        : storyFromAnswers(approvedAnswers);
    void advance({
      ...data,
      stage: "preview",
      mode: "manual",
      story,
      storySourceRevision: data.sourceRevision,
      generatedStory: null,
      generatedRunId: undefined,
    });
    setEditingCopy(true);
  };

  const picked = useMemo(() => sourceIdsFor(data), [data]);
  const story = data.story;
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
    headline: story?.headline ?? "",
    intro: story?.summary ?? "",
    profile_story: story,
    profile_public_signals: approvedProfileSignals(data.choices, data.publicIds),
    interests: [],
    match_tags: [],
    topics: [],
    details: {},
  });

  const indicator =
    loaded && data.stage !== "start" ? (
      <p
        aria-live="polite"
        className={`text-xs font-medium ${saveStatus === "error" || saveStatus === "conflict" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {saveStatus === "saving"
          ? "저장 중…"
          : saveStatus === "saved"
            ? "저장됨"
            : "저장 확인 필요"}
      </p>
    ) : null;
  const shell = (
    title: string,
    description: string,
    children: ReactNode,
    eyebrow = "매니저와 프로필 준비",
  ) => (
    <StepShell
      assistant
      step={progressStep}
      total={progressTotal}
      progressLabel="프로필 작성"
      progress={
        (progressStep -
          1 +
          (INTERVIEW_STAGES.indexOf(data.stage === "error" ? "analyzing" : data.stage) + 1) /
            (INTERVIEW_STAGES.length + 1)) /
        progressTotal
      }
      transitionKey={data.stage}
      eyebrow={eyebrow}
      eyebrowAction={indicator}
      title={title}
      description={description}
    >
      <fieldset
        disabled={busy || advancing || saveStatus === "conflict"}
        aria-busy={busy || advancing}
        className="min-w-0"
      >
        {children}
      </fieldset>
      {actionError ? (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {saveStatus === "conflict" ? (
        <div
          role="alert"
          className="mt-5 space-y-3 rounded-control border border-destructive p-4 text-sm"
        >
          <p>다른 화면에서 수정했어요. 입력은 이 화면에 남아 있습니다.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            저장된 내용 보기
          </Button>
        </div>
      ) : saveStatus === "error" ? (
        <div role="alert" className="mt-5 text-sm text-destructive">
          <p>저장되지 않았어요. 입력한 내용은 이 화면에 남아 있어요.</p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={busy || advancing}
            onClick={() => {
              setActionError("");
              void persist(data).catch(() => undefined);
            }}
          >
            다시 저장하기
          </Button>
        </div>
      ) : null}
    </StepShell>
  );

  if (!loaded)
    return shell(
      "프로필을 불러오고 있어요",
      "",
      loadError ? (
        <Button onClick={() => void load()}>다시 시도</Button>
      ) : (
        <p className="text-sm text-muted-foreground">잠시만요…</p>
      ),
    );

  if (data.stage === "start")
    return shell(
      "내 이야기를 시작해 볼까요?",
      "세 가지 이야기를 들려주세요. 소개글로 다듬고 함께 확인해요.",
      <>
        {data.story ? (
          <p className="mb-5 text-sm text-muted-foreground">
            이전에 쓴 프로필은 마지막에 다시 확인할 수 있어요.
          </p>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          onClick={() => void advance({ ...data, stage: "choices0" })}
        >
          시작하기
        </Button>
        <Button size="lg" variant="outline" className="mt-3 w-full" onClick={manual}>
          직접 쓰기
        </Button>
        <Button variant="ghost" className="mt-5" onClick={onBack}>
          이전
        </Button>
      </>,
    );

  if (data.stage.startsWith("choices")) {
    const page = Number(data.stage.slice(-1));
    const questions = INTERVIEW_CHOICE_PAGES[page as 0 | 1 | 2].map((id) =>
      CHOICE_QUESTIONS.find((question) => question.id === id)!,
    );
    return shell(
      "나에게 편한 방식",
      [
        "일상과 첫 만남에서 편한 쪽을 알려주세요.",
        "연락·약속은 어떤 방식이 편한가요? 이 두 답은 공개하지 않아요.",
        "어떤 관계와 배려가 편한지 골라주세요. 건너뛰어도 괜찮아요.",
      ][page],
      <>
        <div className="space-y-5">
          {questions.map((question) => (
            <div key={question.id} className="rounded-surface bg-card p-5">
              <fieldset className="min-w-0">
                <legend className="break-keep text-base font-semibold leading-snug text-foreground">
                  {question.title}
                </legend>
                <p className="mt-1 text-xs text-muted-foreground">
                  {question.max === 1 ? "한 가지" : `최대 ${question.max}가지`} · 선택
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {question.options.map((option) => (
                    <Chip
                      key={option}
                      selected={(data.choices[question.id] ?? []).includes(option)}
                      onClick={() => {
                        const current = data.choices[question.id] ?? [];
                        const next = current.includes(option)
                          ? current.filter((item) => item !== option)
                          : [...current, option].slice(-question.max);
                        editInput({
                          choices: { ...data.choices, [question.id]: next },
                          publicIds: [
                            ...new Set([
                              ...data.publicIds,
                              ...(["contact", "planning"].includes(question.id)
                                ? []
                                : next.map(
                                    (item) =>
                                      `choice:${question.id}:${(question.options as readonly string[]).indexOf(item)}`,
                                  )),
                            ]),
                          ],
                        });
                      }}
                    >
                      {option}
                    </Chip>
                  ))}
                </div>
                <label
                  htmlFor={`custom-${question.id}`}
                  className="mt-4 block text-xs text-muted-foreground"
                >
                  직접 적기 · 선택
                </label>
                <Input
                  id={`custom-${question.id}`}
                  className="mt-2 text-base"
                  maxLength={100}
                  value={data.choiceCustom[question.id] ?? ""}
                  placeholder="내 말로 적어도 좋아요"
                  onChange={(event) =>
                    editInput({
                      choiceCustom: { ...data.choiceCustom, [question.id]: event.target.value },
                      publicIds: [
                        ...new Set([
                          ...data.publicIds,
                          ...(["contact", "planning"].includes(question.id)
                            ? []
                            : [`choice:${question.id}:custom`]),
                        ]),
                      ],
                    })
                  }
                />
                {["contact", "planning"].includes(question.id) ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    이 답은 기본적으로 프로필에 공개되지 않아요.
                  </p>
                ) : null}
              </fieldset>
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              void advance({
                ...data,
                stage:
                  page === 0 ? "start" : (`choices${page - 1}` as ProfileInterviewV3Data["stage"]),
              })
            }
          >
            이전
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() =>
              void advance({
                ...data,
                stage:
                  page === 2 ? "story0" : (`choices${page + 1}` as ProfileInterviewV3Data["stage"]),
              })
            }
          >
            다음
          </Button>
        </div>
      </>,
      `선택 ${page + 1} / 3`,
    );
  }

  if (data.stage.startsWith("story")) {
    const index = Number(data.stage.slice(-1));
    const question = STORY_QUESTIONS[index];
    const prompt = PROFILE_INTERVIEW_PROMPTS[question.id];
    const value = data.answers[question.id];
    const coaching = profileAnswerCoaching(question.id, value);
    return shell(
      prompt.question,
      prompt.guide,
      <>
        <div>
          <label htmlFor="story-answer" className="mb-2 block text-sm font-semibold">
            내 답변
          </label>
          <Textarea
            id="story-answer"
            aria-describedby={
              coaching ? "story-answer-note story-answer-help" : "story-answer-note"
            }
            rows={5}
            maxLength={300}
            className="text-base"
            placeholder="평소 쓰는 말로 편하게 적어주세요."
            value={value}
            onChange={(event) =>
              editInput({
                answers: { ...data.answers, [question.id]: event.target.value },
                publicIds: [...new Set([...data.publicIds, `answer:${question.id}`])],
              })
            }
          />
          <div className="mt-3 flex items-start justify-between gap-3">
            <p id="story-answer-note" className="text-xs leading-relaxed text-muted-foreground">
              쓴 내용은 마지막에 고치거나 빼실 수 있어요.
            </p>
            <output
              className="shrink-0 text-xs text-muted-foreground tabular-nums"
              aria-label="답변 글자 수"
            >
              {value.length}/300
            </output>
          </div>
          {coaching ? (
            <div id="story-answer-help" className="mt-5 text-sm leading-relaxed">
              <p className="font-medium text-foreground">조금 더 떠올려보고 싶다면</p>
              <p className="mt-1 break-keep text-muted-foreground">{coaching}</p>
              <p className="mt-2 text-xs text-muted-foreground">지금 답변으로 넘어가도 괜찮아요.</p>
            </div>
          ) : null}
        </div>
        <div className="mt-8 flex gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              void advance({
                ...data,
                stage:
                  index === 0
                    ? "choices2"
                    : (`story${index - 1}` as ProfileInterviewV3Data["stage"]),
              })
            }
          >
            이전
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() =>
              void advance({
                ...data,
                stage:
                  index === 2
                    ? "analyzing"
                    : (`story${index + 1}` as ProfileInterviewV3Data["stage"]),
              })
            }
          >
            {index === 2 ? "답변 확인하기" : "다음 이야기"}
          </Button>
        </div>
        {index === 2 ? (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => void analyze()}>
            적은 답으로 바로 정리하기
          </Button>
        ) : null}
      </>,
      `이야기 ${index + 1} / 3`,
    );
  }

  if (data.stage === "analyzing")
    return shell(
      "내 이야기를 살펴볼게요",
      "소개할 내용을 정리한 뒤, 뜻이 맞는지 함께 확인해요.",
      <>
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void analyze()}>
          {busy ? "살펴보는 중…" : "내용 정리하기"}
        </Button>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => void advance({ ...data, stage: "story2" })}
        >
          답변 수정
        </Button>
      </>,
    );

  if (data.stage === "error")
    return shell(
      "답변은 그대로 있어요",
      data.generationError ?? "내용을 살펴보는 데 문제가 생겼어요.",
      <>
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void analyze()}>
          다시 시도
        </Button>
        <Button size="lg" variant="outline" className="mt-3 w-full" onClick={manual}>
          내가 직접 정리하기
        </Button>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => void advance({ ...data, stage: "story2" })}
        >
          답변 수정
        </Button>
      </>,
    );

  if (data.stage === "followups")
    return shell(
      "조금만 더 들려주세요",
      "최대 두 가지만 더 여쭤볼게요. 건너뛰어도 괜찮아요.",
      <>
        <div className="space-y-5">
          {data.followupIds.map((id) => (
            <div key={id}>
              <label htmlFor={`followup-${id}`} className="break-keep text-base font-semibold">
                {FOLLOWUP_LABELS[id]}
              </label>
              <Textarea
                id={`followup-${id}`}
                className="mt-3 text-base"
                rows={3}
                maxLength={300}
                value={data.followups[id] ?? ""}
                onChange={(event) =>
                  editInput({
                    followups: { ...data.followups, [id]: event.target.value },
                    publicIds: [...new Set([...data.publicIds, `followup:${id}`])],
                  })
                }
              />
            </div>
          ))}
        </div>
        <Button
          size="lg"
          className="mt-8 w-full"
          onClick={() => void advance({ ...data, stage: "understanding" })}
        >
          계속하기
        </Button>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => void advance({ ...data, stage: "understanding" })}
        >
          건너뛰기
        </Button>
      </>,
    );

  if (data.stage === "understanding")
    return shell(
      "이렇게 이해했어요",
      "내 뜻과 같은가요? 원래 답변도 펼쳐볼 수 있어요.",
      <>
        {data.understanding.length ? (
          <ul className="divide-y divide-border">
            {data.understanding.map((fact, index) => (
              <li key={index} className="py-4 text-base leading-relaxed">
                {fact.text}
                <SourceNotes
                  sources={profileCoachingSources(data, fact.sourceIds, "owner")}
                  label="참고한 내 답변 보기"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">답변을 한 번 더 확인해 주세요.</p>
        )}
        {data.contradictions.length ? (
          <div className="mt-5 rounded-control bg-muted p-4">
            <p className="text-sm font-semibold">한 번만 확인해 주세요</p>
            {data.contradictions.map((item) => (
              <p key={item} className="mt-2 text-sm">
                {item}
              </p>
            ))}
          </div>
        ) : null}
        <Button
          size="lg"
          className="mt-8 w-full"
          onClick={() => void advance({ ...data, stage: "review", understandingConfirmed: true })}
        >
          맞아요
        </Button>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => void advance({ ...data, stage: "story0" })}
        >
          내 이야기 수정
        </Button>
      </>,
    );

  if (data.stage === "review")
    return shell(
      "프로필에 담을 이야기",
      "선택한 답변만 소개글로 다듬어요. 공개하지 않을 내용은 빼주세요.",
      <>
        <div className="divide-y divide-border">
          {picked
            .filter((id) => !id.startsWith("choice:contact") && !id.startsWith("choice:planning"))
            .map((id) => {
              const text = id.startsWith("answer:")
                ? data.answers[id.slice(7) as StorySectionId]
                : id.startsWith("followup:")
                  ? data.followups[id.slice(9)]
                  : (() => {
                      const parts = id.split(":");
                      return parts[2] === "custom"
                        ? data.choiceCustom[parts[1]]
                        : data.choices[parts[1]]?.find(
                            (option) =>
                              CHOICE_QUESTIONS.find((q) => q.id === parts[1])?.options[
                                Number(parts[2])
                              ] === option,
                          );
                    })();
              return (
                <label
                  key={id}
                  className="flex min-h-14 cursor-pointer items-start gap-3 py-4 text-sm leading-relaxed"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0 accent-selection"
                    checked={data.publicIds.includes(id)}
                    onChange={(event) =>
                      setData((current) => ({
                        ...current,
                        publicIds: event.target.checked
                          ? [...new Set([...current.publicIds, id])]
                          : current.publicIds.filter((item) => item !== id),
                        sourceRevision: current.sourceRevision + 1,
                        story: null,
                        generatedStory: null,
                        generatedRunId: undefined,
                      }))
                    }
                  />
                  <span>{text}</span>
                </label>
              );
            })}
        </div>
        <Button
          size="lg"
          className="mt-8 w-full"
          disabled={busy || !data.publicIds.some((id) => picked.includes(id))}
          onClick={() => void generate()}
        >
          {busy ? "프로필을 다듬는 중…" : "이 내용으로 프로필 만들기"}
        </Button>
        <Button size="lg" variant="outline" className="mt-3 w-full" onClick={manual}>
          직접 정리하기
        </Button>
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => void advance({ ...data, stage: "understanding" })}
        >
          이전
        </Button>
      </>,
    );

  const updateStory = (next: ProfileStoryV3) => setData((current) => ({ ...current, story: next }));
  const updateSection = (id: StorySectionId, answer: string) => {
    const current = story ?? storyFromAnswers({});
    const meta = STORY_QUESTIONS.find((item) => item.id === id)!;
    const sections = current.sections.filter((section) => section.id !== id);
    if (answer.trim())
      sections.push({
        id,
        questionId: meta.questionId,
        questionVersion: 1,
        question: meta.question,
        answer,
      });
    sections.sort((a, b) => CORE_KEYS.indexOf(a.id) - CORE_KEYS.indexOf(b.id));
    updateStory({ ...current, sections });
  };
  const complete =
    story &&
    validProfileStory(story) &&
    story.summary.trim().length >= 5 &&
    !hasContactDetail(JSON.stringify(story)) &&
    data.storySourceRevision === data.sourceRevision;
  return shell(
    "이렇게 소개할까요?",
    "상대에게 보여줄 모습이에요. 확인하고 저장해 주세요.",
    <>
      {data.generatedStory ? (
        <div className="mb-6 text-sm leading-relaxed">
          <p className="font-medium text-foreground">선택한 답변을 AI가 다듬은 초안이에요</p>
          <p className="mt-1 break-keep text-muted-foreground">
            말투는 다듬어도 뜻은 그대로. 내 취향·경험과 다른 부분은 고쳐주세요.
          </p>
          <SourceNotes
            sources={profileCoachingSources(data, picked, "public")}
            label="프로필 재료로 고른 내 답변 보기"
          />
        </div>
      ) : null}
      {story ? <ProfileDetail p={preview} /> : null}
      {editingCopy ? (
        <fieldset disabled={busy} className="mt-7 min-w-0 space-y-5 border-t border-border pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            여기서는 상대에게 보여줄 문장만 고쳐요. 인터뷰에서 남긴 원래 답변은 바뀌지 않아요.
          </p>
          <div>
            <label htmlFor="story-headline" className="text-sm font-semibold">
              한 줄 소개
            </label>
            <Input
              id="story-headline"
              className="mt-2 text-base"
              maxLength={35}
              value={story?.headline ?? ""}
              onChange={(event) =>
                updateStory({ ...(story ?? storyFromAnswers({})), headline: event.target.value })
              }
            />
          </div>
          <div>
            <label htmlFor="story-summary" className="text-sm font-semibold">
              카드에서 보일 짧은 소개
            </label>
            <Textarea
              id="story-summary"
              rows={3}
              className="mt-2 text-base"
              maxLength={300}
              value={story?.summary ?? ""}
              onChange={(event) =>
                updateStory({ ...(story ?? storyFromAnswers({})), summary: event.target.value })
              }
            />
          </div>
          {STORY_QUESTIONS.map((question) => (
            <div key={question.id}>
              <label
                htmlFor={`section-${question.id}`}
                className="break-keep text-sm font-semibold"
              >
                {question.question}
              </label>
              <Textarea
                id={`section-${question.id}`}
                rows={4}
                className="mt-2 text-base"
                maxLength={240}
                value={story?.sections.find((section) => section.id === question.id)?.answer ?? ""}
                onChange={(event) => updateSection(question.id, event.target.value)}
              />
            </div>
          ))}
          <Button variant="outline" onClick={() => setEditingCopy(false)}>
            수정 마치기
          </Button>
        </fieldset>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          className="mt-7 w-full"
          onClick={() => setEditingCopy(true)}
        >
          프로필 수정
        </Button>
      )}
      {data.generatedStory && story !== data.generatedStory ? (
        <Button
          variant="ghost"
          className="mt-3 w-full"
          disabled={busy}
          onClick={() => updateStory(data.generatedStory!)}
        >
          처음 제안한 글 다시 보기
        </Button>
      ) : null}
      <Button
        size="lg"
        className="mt-8 w-full"
        disabled={!complete || busy || saveStatus === "conflict"}
        onClick={async () => {
          if (!complete || publishingRef.current) return;
          publishingRef.current = true;
          setBusy(true);
          setActionError("");
          try {
            const revision = await persist(data);
            await onDone(
              revision,
              data.generatedRunId,
              data.generatedRunId
                ? JSON.stringify(story) === JSON.stringify(data.generatedStory)
                  ? "accepted"
                  : "edited"
                : undefined,
            );
          } catch {
            setActionError("저장하지 못했어요. 다시 시도해 주세요.");
          } finally {
            publishingRef.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "저장 중…" : "프로필 저장하기"}
      </Button>
      {!complete ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {!story?.sections.length ? "질문 하나에 답을 적어 주세요. " : ""}한 줄 소개 3자, 카드 소개
          5자, 답변 5자 이상이 필요해요. 연락처·링크는 적을 수 없어요.
        </p>
      ) : null}
      <Button
        variant="ghost"
        className="mt-3 w-full"
        disabled={busy}
        onClick={() =>
          void advance({ ...data, stage: data.mode === "manual" ? "start" : "review" })
        }
      >
        이전
      </Button>
    </>,
  );
}
