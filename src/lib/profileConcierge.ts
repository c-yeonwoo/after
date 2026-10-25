import type { ProfileStoryV3, StorySectionId } from "./profileStory";
import { DRINKING_OPTIONS, SMOKING_OPTIONS } from "../components/onboarding/basics";

/** Only fields already visible on the approved profile may enter this reading. */
export type ConciergeProfile = {
  headline: string;
  intro: string;
  story?: ProfileStoryV3 | null;
  interests: string[];
  topics: string[];
  answers: { q: string; a: string }[];
  area?: string;
  smoking?: string;
  drinking?: string;
};

export type ProfileEvidence = {
  person: "self" | "other";
  field: string;
  label: string;
  quote: string;
};

export type ProfileConnection = {
  id: string;
  title: string;
  reading: string;
  invitation: string;
  evidence: ProfileEvidence[];
};

type PublicSource = { field: string; label: string; text: string };

const compact = (text: string) => text.normalize("NFKC").replace(/[\s.!?。！？“”"'‘’]/gu, "");
const clean = (text: string | undefined) => (text ?? "").trim();

function publicSources(profile: ConciergeProfile): PublicSource[] {
  if (profile.story) {
    return profile.story.sections.map((section) => ({
      field: `story.${section.id}`,
      label: section.question,
      text: clean(section.answer),
    }));
  }
  return [
    { field: "intro", label: "소개글", text: clean(profile.intro) },
    ...profile.answers.map((answer, index) => ({
      field: `answers.${index}`,
      label: answer.q,
      text: clean(answer.a),
    })),
    ...profile.interests.map((text, index) => ({
      field: `interests.${index}`,
      label: "공개 관심사",
      text: clean(text),
    })),
    ...profile.topics.map((text, index) => ({
      field: `topics.${index}`,
      label: "나누고 싶은 이야기",
      text: clean(text),
    })),
  ].filter((source) => source.text);
}

/** Preserve the exact public statement, including negation, wishes and frequency. */
function evidence(source: PublicSource, person: ProfileEvidence["person"]): ProfileEvidence {
  return { person, field: source.field, label: source.label, quote: source.text };
}

const conversationTopics = [
  {
    id: "film",
    word: "영화",
    pattern: /영화/,
    invitation: "최근 기억에 남은 영화의 한 장면부터 물어보면 어떨까요?",
  },
  {
    id: "walk",
    word: "산책",
    pattern: /산책/,
    invitation: "걷는 시간이 어떤 느낌인지, 각자의 경험을 나눠보세요.",
  },
  {
    id: "music",
    word: "음악",
    pattern: /음악/,
    invitation: "요즘 듣거나 기억에 남은 음악이 있는지 물어보세요.",
  },
  {
    id: "food",
    word: "요리",
    pattern: /요리/,
    invitation: "직접 만들거나 먹어본 음식 중 기억나는 것을 물어보세요.",
  },
  {
    id: "travel",
    word: "여행",
    pattern: /여행/,
    invitation: "다녀온 곳이나 언젠가 가보고 싶은 곳부터 이야기해 보세요.",
  },
  {
    id: "coffee",
    word: "커피",
    pattern: /커피/,
    invitation: "커피 이야기에서 각자 편하게 머무는 공간으로 이어가 보세요.",
  },
  {
    id: "book",
    word: "독서",
    pattern: /독서/,
    invitation: "최근 읽었거나 읽어보고 싶은 책이 있는지 물어보세요.",
  },
] as const;

/**
 * Shared words are conversation openings, never inferred shared preferences.
 * In particular, “영화를 안 봐요” and “영화가 좋아요” remain distinct quotations.
 */
export function comparePublicProfiles(own: ConciergeProfile, other: ConciergeProfile) {
  const selfSources = publicSources(own);
  const otherSources = publicSources(other);
  const connections: ProfileConnection[] = [];
  const considerations: ProfileConnection[] = [];

  for (const topic of conversationTopics) {
    const a = selfSources.find((source) => topic.pattern.test(source.text));
    const b = otherSources.find((source) => topic.pattern.test(source.text));
    if (!a || !b) continue;
    connections.push({
      id: topic.id,
      title: `말문을 열어 줄 ${topic.word} 이야기`,
      reading: `두 소개글에 ${topic.word} 이야기가 있어요. 좋아하는 방식이나 경험은 서로 다를 수 있어요.`,
      invitation: topic.invitation,
      evidence: [evidence(a, "self"), evidence(b, "other")],
    });
    break;
  }

  const ownArea = clean(own.area);
  const otherArea = clean(other.area);
  if (ownArea && otherArea && ownArea === otherArea) {
    connections.push({
      id: "area",
      title: "같은 권역에서 시작하는 만남",
      reading: `두 분 모두 ${ownArea} 권역으로 소개되어 있어요.`,
      invitation: "각자 이동하기 편한 장소부터 함께 정해보세요.",
      evidence: [
        { person: "self", field: "area", label: "지역", quote: ownArea },
        { person: "other", field: "area", label: "지역", quote: otherArea },
      ],
    });
  }

  const lifestyle = [
    {
      field: "smoking",
      label: "흡연",
      title: "흡연에 대해 편한 기준",
      values: SMOKING_OPTIONS.map((option) => option.label),
      invitation: "흡연 여부와 별개로, 만나는 동안 서로 편한 기준이 있는지 물어보세요.",
    },
    {
      field: "drinking",
      label: "음주",
      title: "첫 만남의 음주 여부",
      values: DRINKING_OPTIONS.map((option) => option.label),
      invitation: "첫 만남에 술이 없는 자리도 편한지 함께 정해보세요.",
    },
  ] as const;
  for (const item of lifestyle) {
    const a = clean(own[item.field]);
    const b = clean(other[item.field]);
    if (
      !item.values.some((value) => value === a) ||
      !item.values.some((value) => value === b) ||
      a === b
    )
      continue;
    considerations.push({
      id: item.field,
      title: item.title,
      reading: `공개한 ${item.label} 답변이 달라요. 이 차이만으로 만남이 맞지 않는다고 판단할 수는 없어요.`,
      invitation: item.invitation,
      evidence: [
        { person: "self", field: item.field, label: item.label, quote: a },
        { person: "other", field: item.field, label: item.label, quote: b },
      ],
    });
  }

  return { connections, considerations };
}

const writingPrompts: Record<StorySectionId, string> = {
  daily_life: "최근 퇴근 후 기억에 남는 장면 하나를 적어볼까요? 무엇을 했는지만 짧게 들려주세요.",
  getting_closer: "누군가와 어색함이 풀렸던 순간, 어떤 말이나 행동이 오갔나요?",
  conversation: "요즘 누군가에게 들려주고 싶은 이야기 하나가 있다면 무엇인가요?",
};

export function profileReading(profile: ConciergeProfile) {
  const sources = publicSources(profile);
  const summary = clean(profile.story?.summary);
  const summaryKey = compact(summary);
  const repetitiveSummary =
    !summaryKey ||
    compact(profile.headline).includes(summaryKey) ||
    sources.some((source) => compact(source.text).includes(summaryKey));
  const seen = new Set([compact(profile.headline), summaryKey]);
  const hooks = (profile.story?.conversationHooks ?? [])
    .filter((hook) => {
      const key = compact(hook);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
  const sections = profile.story?.sections ?? [];
  const nextSection =
    (["daily_life", "getting_closer", "conversation"] as const).find(
      (id) => !sections.some((section) => section.id === id && section.answer.trim().length >= 25),
    ) ?? "daily_life";
  const strength = sections.length
    ? "질문에 답한 내 문장이 있어, 상대가 어떤 이야기를 꺼낼지 찾을 수 있어요."
    : sources.some((source) => source.text.length >= 5)
      ? "내가 직접 적은 소개가 있어요. 한 장면을 더하면 첫 대화의 실마리가 더 또렷해져요."
      : "짧은 이야기 하나면 시작할 수 있어요. 평소 쓰는 말 그대로 들려주세요.";
  return {
    summary: repetitiveSummary ? null : summary,
    hooks,
    strength,
    nextPrompt: writingPrompts[nextSection],
  };
}
