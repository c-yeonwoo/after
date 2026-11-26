import type { IntroEvidence } from "./api";
import { validProfileStory } from "./profileStory";

type PublicCopy = {
  name?: string | null;
  profile_story?: unknown;
  headline?: string | null;
  intro?: string | null;
};
export type ReadablePair = { self: PublicCopy; other: PublicCopy };

// Each detail is a literal phrase someone can actually write. A scene is a
// possibility for the two readers, never an inferred trait or a prediction.
type Topic = { details: string[]; scene: string };
const topics: Record<string, Topic> = {
  "영화·드라마": {
    details: [
      "좋았던 장면",
      "좋아하는 영화",
      "엔딩 크레디트",
      "독립영화",
      "영화관",
      "인생 영화",
      "좋아하는 대사",
    ],
    scene: "같은 작품을 보고도 두 분은 어떤 장면부터 꺼내실지 궁금해요.",
  },
  음악: {
    details: [
      "플레이리스트",
      "라이브 공연",
      "콘서트",
      "좋아하는 밴드",
      "자주 듣는 노래",
      "퇴근길 노래",
    ],
    scene: "요즘 자주 듣는 곡을 한 곡씩 건네면 어떤 두 곡이 나올까요?",
  },
  음식: {
    details: ["동네 맛집", "새로운 메뉴", "단골집", "제철 음식", "동네 빵집", "시장 구경"],
    scene: "서로에게 딱 한 곳만 소개한다면 어디일지 궁금해요.",
  },
  여행: {
    details: ["골목길", "기차 여행", "동네 시장", "혼자 여행", "바닷가", "뚜벅이 여행"],
    scene: "여행에서 찍은 사진 한 장씩만 골라도 서로 다른 이야기가 펼쳐지겠어요.",
  },
  운동: {
    details: ["한강 러닝", "퇴근 후 운동", "클라이밍", "헬스장", "수영장", "러닝 코스"],
    scene: "각자 처음 재미를 느낀 순간을 들려주면 어떨까요?",
  },
};

const sharedScenes: Record<string, string> = {
  "짧게 커피": "긴 저녁 약속을 잡지 않고도 가볍게 마주 앉을 수 있겠어요.",
  "함께 걷기": "나란히 걷다가 눈에 들어온 가게 하나로 이야기가 시작될 수도 있겠어요.",
  "식사하며 대화": "첫 메뉴를 같이 고르는 순간부터 만남이 시작되겠어요.",
  "활동이나 체험": "손을 움직이며 자연스럽게 말을 건넬 수 있겠어요.",
  "가벼운 술자리": "한 잔 앞에 두고 서로의 하루를 듣는 저녁은 어떨까요?",
  "동네 돌아보기": "서로의 동네에서 즐겨 걷는 길이 궁금해져요.",
  "요즘 일상": "오늘 하루 중 웃음이 났던 순간 하나면 이야기를 시작할 수 있겠어요.",
  "하는 일": "직함 한 줄보다 요즘 풀고 있는 문제 하나가 더 재미있는 시작일 수 있겠어요.",
  "중요하게 생각하는 것": "요즘 시간을 내서라도 꼭 하는 일부터 나눠 보면 어떨까요?",
  "사람 만나기": "요즘 누구와 어떤 시간을 보냈는지 궁금해지네요.",
  "혼자 푹 쉬기": "각자에게 제대로 쉰 저녁은 어떤 모습인지 궁금해요.",
  "취미에 몰입하기": "최근에 시간 가는 줄 몰랐던 일을 하나씩 들려주면 어떨까요?",
  운동하기: "각자 어떤 운동에 재미를 붙였는지 궁금해져요.",
};

const positiveEnding =
  /(?:좋아해요|좋아요|즐겨요|즐깁니다|기억해요|기억합니다|반가워요|나누고 싶어요|듣고 싶어요|찾아가요|가곤 해요|취미예요)\s*$/u;

function publicSentences(profile: PublicCopy): string[] {
  const story = profile.profile_story;
  const fields =
    story == null
      ? [profile.headline, profile.intro]
      : validProfileStory(story)
        ? [...story.sections.map(({ answer }) => answer), story.headline]
        : [];
  // Skip mixed or reported statements entirely. Missing an excerpt is cheaper
  // than turning a dislike, comparison or someone else's taste into a recommendation.
  return fields
    .flatMap((field) => (field ?? "").split(/[.!?。！？\n]+/u))
    .filter(
      (line) =>
        positiveEnding.test(line) &&
        !/싫|않|아니|별로|못|안\s|없|그만|질렸|부담|피하|대신|말고|빼고|제외|보다|지만|다고|다던|(?:친구|가족|동료|상대|동생|언니|오빠|부모님|그분|님)(?:은|는|이|가|도)/u.test(
          line,
        ),
    );
}

/** A locked teaser supplies only its server-approved signal, never a profile. */
export function introReasonCopy(
  original: string,
  evidence?: IntroEvidence | null,
  pair?: ReadablePair,
): string {
  if (evidence?.source !== "shared" || !evidence.quote) return original;
  if (evidence.discounted)
    return "두 분이 겹쳐 고른 항목이 있지만, 소개에서 덜 중요하게 봐 달라고 하셨어요.";
  const signal = evidence.quote;
  const topic = Object.hasOwn(topics, signal) ? topics[signal] : undefined;
  // The server does not distinguish legacy interest tags from questionnaire
  // selections here. Do not invent the question the member answered.
  const common = `두 분의 프로필에는 ‘${signal}’ 이야기가 함께 있어요.`;
  if (!topic)
    return Object.hasOwn(sharedScenes, signal) ? `${common} ${sharedScenes[signal]}` : original;
  if (pair) {
    const detail = (profile: PublicCopy) => {
      for (const line of publicSentences(profile)) {
        const found = topic.details.find((phrase) => {
          const start = `(?:^|[^\\p{L}\\p{N}])${phrase}`;
          // "좋아하는 영화와 …" carries its own qualifier. For bare nouns
          // the predicate must actually attach to that noun, not a later topic.
          const qualified = /^(?:좋아하는 |좋았던 |자주 듣는 )/u.test(phrase);
          const suffix = qualified
            ? /(?:와|과|이랑|을|를|이|가|은|는|도)?(?=$|[^\p{L}\p{N}])/u.source
            : /(?:을|를|이|가|은|는|도|에)?\s*(?:이야기[를가]?\s*)?(?:(?:정말|무척|오래|자주)\s+)?/u
                .source + positiveEnding.source;
          return new RegExp(start + suffix, "u").test(line);
        });
        if (found) return found;
      }
    };
    const self = detail(pair.self);
    const other = detail(pair.other);
    if (self && other) {
      const peer = pair.other.name?.trim();
      const connection =
        self === other
          ? `두 분 모두 소개에 ‘${self}’ 이야기를 적어주셨어요.`
          : `써주신 ‘${self}’ 이야기를 읽고 나니, ${peer ? peer + "님" : "이분"}의 ‘${other}’도 눈에 들어왔어요.`;
      return `${connection} ${topic.scene}`;
    }
  }
  return `${common} ${topic.scene}`;
}
