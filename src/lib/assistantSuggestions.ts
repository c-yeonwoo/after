/** Local writing assistance: no provider call, transcript lookup or automatic send. */
const questions = [
  { text: "내 프로필의 장점과 아쉬운 표현을 코칭해줘", words: /프로필|소개글|장점|매력|코칭/ },
  { text: "첫 만남에서 어색하면 어떻게 말문을 열까요?", words: /첫|만남|어색|말문|긴장|대화/ },
  { text: "답장이 늦을 때 부담 없이 어떻게 물어볼까요?", words: /답장|연락|늦|부담/ },
  { text: "소개글을 자연스럽게 다듬어줘", words: /소개글|수정|다듬|자연/ },
  { text: "약속 일정 정리해줘", words: /일정|시간|약속|요일/ },
  { text: "내 소개는 지금 어떤 상태야?", words: /소개|상태|기다|진행/ },
];

export function assistantSuggestions(input: string, canCoach = true): string[] {
  const query = input.normalize("NFKC").trim();
  if (query.length > 80) return [];
  const available = questions.filter((item) => canCoach || item.text !== questions[0].text);
  return available
    .filter(
      (item) =>
        !query || (item.text !== query && (item.words.test(query) || item.text.includes(query))),
    )
    .slice(0, 3)
    .map((item) => item.text);
}
