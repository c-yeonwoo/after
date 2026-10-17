// Explicitly fictional local personas, not AI output or production member copy.
const questions = [
  ["daily_life", "퇴근 후에는 어떻게 보내세요?"],
  ["getting_closer", "어떤 만남에서 편해지나요?"],
  ["conversation", "만나면 어떤 이야기를 나누고 싶나요?"],
];
const answers = {
  m1: [
    "퇴근하고 나면 카메라를 들고 동네를 조금 걸어요. 멀리 가기보다는 늘 지나던 길에서 눈에 들어오는 장면을 찍는 편이에요.",
    "처음엔 커피 한 잔을 앞에 두고 천천히 이야기하면 좋겠어요. 서로 말할 틈을 주면서, 그날 있었던 사소한 일부터 나누는 자리가 편해요.",
    "최근 찍은 사진이나 요즘 자주 걷는 길 이야기를 나누고 싶어요. 상대가 좋아하는 동네 공간도 궁금해요.",
  ],
  m2: [
    "요즘은 도자기를 배우고 있어요. 아직 그릇 모양이 마음대로 나오진 않지만, 손으로 무언가 만드는 시간이 좋아요. 운동하고 싶은 날에는 가볍게 달려요.",
    "처음부터 긴 시간을 약속하기보다는 조용한 카페에서 만나고 싶어요. 대화가 편하면 다음에는 함께 걸어도 좋겠어요.",
    "최근 새로 배운 것에 대해 이야기하면 말이 잘 나오는 편이에요. 처음 해봤는데 의외로 좋았던 일도 서로 들려주면 재미있을 것 같아요.",
  ],
  m3: [
    "주말 아침에는 가 보고 싶었던 빵집에 들러요. 빵을 고르고 커피를 마시면서 여유 있게 아침을 보내는 걸 좋아해요.",
    "커피 한 잔 마시면서 서로의 하루를 묻는 자리가 편해요. 처음부터 멋진 이야기를 준비하기보다 편한 말로 시작하고 싶어요.",
    "요즘 발견한 빵집이나 좋아하는 아침 메뉴부터 이야기해 보고 싶어요. 맛있게 먹었던 한 끼 이야기는 언제 들어도 좋더라고요.",
  ],
  m4: [
    "퇴근길에 서점에 들르는 편이에요. 꼭 책을 사지 않더라도 진열된 책을 천천히 둘러보고, 마음에 드는 문장을 조금 읽다 와요.",
    "사람이 너무 많은 곳보다는 서로의 말이 잘 들리는 카페가 좋아요. 말이 잠깐 끊겨도 서두르지 않아도 되는 만남이면 좋겠어요.",
    "요즘 읽는 책이나 우연히 발견한 글 이야기를 나누고 싶어요. 같은 글을 보고도 서로 다르게 느낀 부분을 듣는 게 재미있어요.",
  ],
  f1: [
    "주말에는 작은 전시를 찾아다녀요. 작품을 많이 보기보다 마음에 드는 것 앞에서 조금 오래 머무는 편이에요.",
    "처음에는 카페에서 편하게 이야기하고 싶어요. 취향이 꼭 같지 않더라도 서로 왜 좋아하는지 물어볼 수 있는 대화가 좋아요.",
    "최근에 본 전시에서 기억에 남은 장면을 나누고 싶어요. 상대가 요즘 눈여겨보는 것도 들어보고 싶고요.",
  ],
  f2: [
    "아침에 시간이 나면 달리기를 하고 커피를 마셔요. 늘 길게 뛰는 건 아니고, 그날 여유에 맞춰 가볍게 움직이는 편이에요.",
    "첫 만남은 커피 한 잔이 편해요. 서로의 일상을 조금씩 묻다가 자연스럽게 다음 이야기가 이어지면 좋겠어요.",
    "요즘 자주 가는 카페나 달리면서 본 동네 풍경 이야기를 하고 싶어요. 상대만의 작은 일상도 궁금해요.",
  ],
  f3: [
    "조용한 동네를 걷는 걸 좋아해요. 길을 정해두기보다는 그날 눈에 들어오는 골목으로 천천히 걸어보는 편이에요.",
    "첫 만남에는 짧게 커피를 마시고 싶어요. 서로 말할 시간을 충분히 주면서 알아가면 편할 것 같아요.",
    "좋아하는 산책길이나 동네에서 발견한 가게 이야기를 나누고 싶어요. 서로 아는 장소가 겹치면 반가울 것 같아요.",
  ],
  f4: [
    "요즘은 클라이밍에 빠져 있어요. 쉽게 풀리지 않던 동작을 다시 시도해 보는 시간이 재미있어요.",
    "처음에는 커피를 마시며 이야기하고, 익숙해지면 함께 가볍게 움직이는 만남도 해 보고 싶어요. 처음부터 활동을 강요하진 않았으면 해요.",
    "최근 해 본 운동이나 새로 시작해 보고 싶은 취미를 이야기하고 싶어요. 잘하는 이야기만큼 처음이라 어려웠던 이야기도 좋아요.",
  ],
  f5: [
    "퇴근하고 요가를 하러 가요. 수업이 없는 날에는 집에서 쉬거나 동네를 조금 걸어요.",
    "처음엔 조용한 카페에서 대화하는 시간이 편해요. 서로의 생활 리듬을 물어보고 무리하지 않는 속도로 알아가고 싶어요.",
    "요즘 하루를 어떻게 보내는지, 쉬는 시간에는 무엇을 하는지 이야기하고 싶어요. 좋아하는 동네 공간도 추천받고 싶어요.",
  ],
};
export function demoStory(key, headline) {
  if (!answers[key]) return null;
  return {
    version: 3,
    headline,
    summary: answers[key][0],
    sections: questions.map(([id, question], i) => ({
      id,
      questionId: `${id}_v1`,
      questionVersion: 1,
      question,
      answer: answers[key][i],
    })),
    conversationHooks: [],
    publishedRevision: 1,
  };
}

const quote = (s) => String(s).replaceAll("'", "''");
/** Does not touch photos, likes, queues, tickets, meetings or existing drafts. */
export function demoStoryUpgradeSql(id, key, headline) {
  const story = demoStory(key, headline);
  if (!story) return "";
  const data = JSON.stringify({
    version: 3,
    stage: "preview",
    source: "local-demo-interview-v3",
    publicIds: questions.map(([id]) => `answer:${id}`),
    story,
    choices: { first_date: ["짧게 커피"], topics: ["요즘 일상"] },
  });
  return `begin;
    insert into public.profile_interview_drafts(user_id,revision,data)
      select id,1,'${quote(data)}'::jsonb from public.profiles
      where id='${quote(id)}'::uuid and company_email='${quote(key)}@verify.local'
        and profile_story is null and intro=headline
      on conflict(user_id) do nothing;
    update public.profiles p set profile_story=d.data->'story',intro=d.data->'story'->>'summary'
      from public.profile_interview_drafts d where p.id=d.user_id and p.id='${quote(id)}'::uuid
        and p.company_email='${quote(key)}@verify.local' and p.profile_story is null
        and d.data->>'source'='local-demo-interview-v3';
    delete from public.profile_interview_drafts where user_id='${quote(id)}'::uuid
      and data->>'source'='local-demo-interview-v3';
    commit;`;
}
