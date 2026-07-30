/** 데모 소개 상대 — Cloud 연결 전 화면 확인용 고정 데이터 */
export type Candidate = {
  id: string;
  name: string;
  age: number;
  job: string;
  mbti?: string;
  smoking: string;
  drinking: string;
  area: string;
  /** 퇴근길 겹침 정도 */
  distance: string;
  headline: string;
  intro: string;
  interests: string[];
  matchTags: string[];
  topics: string[];
  answers: { q: string; a: string }[];
};

export const CANDIDATES: Candidate[] = [
  {
    id: "hana",
    name: "하나",
    age: 31,
    job: "제품 디자이너",
    mbti: "INFP",
    smoking: "비흡연",
    drinking: "가끔 한 잔",
    area: "선릉",
    distance: "퇴근길 도보 12분 겹침",
    headline: "평일 저녁을 잘 쓰는 사람이 되고 싶어요.",
    intro:
      "회사에서는 화면을 만들고, 퇴근하면 주로 걷습니다. 요즘은 양재천을 따라 천천히 뛰는 게 하루의 마무리예요.\n\n말수가 많은 편은 아니지만 궁금한 게 생기면 질문이 길어집니다. 처음 만나는 자리에서도 날씨 이야기보다는 요즘 무엇에 빠져 있는지 듣는 쪽이 편해요.",
    interests: ["러닝", "커피", "책", "전시·사진"],
    matchTags: ["말이 느긋한 사람", "질문을 잘하는 사람", "자기 일에 꾸준한 사람"],
    topics: ["요즘 빠져 있는 것", "최근에 바꾼 생각", "취향 자랑"],
    answers: [
      { q: "요즘 주로 어디서, 어떤 속도로 뛰세요?", a: "퇴근하고 양재천 5km. 기록보다 그날 컨디션대로 뜁니다." },
      { q: "커피는 어떤 식으로 즐기세요?", a: "산미 있는 원두로 핸드드립. 주말 아침 루틴이에요." },
      { q: "최근에 읽고 오래 남은 책은요?", a: "에세이보다 인터뷰집을 좋아해요. 사람 말투가 그대로 남는 게 좋아서요." },
    ],
  },
];

export function getCandidate(id: string) {
  return CANDIDATES.find((c) => c.id === id) ?? null;
}
