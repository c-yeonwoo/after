/** Shared, side-effect-free routing. This module grants no execution authority. */
export type AssistantIntent =
  | "status"
  | "signup"
  | "profile"
  | "coach_profile"
  | "edit"
  | "edit_photo"
  | "edit_facts"
  | "edit_story"
  | "clarify"
  | "intro"
  | "interest"
  | "payment"
  | "schedule"
  | "feedback"
  | "prepare"
  | "memory"
  | "support"
  | "unknown";

const editRequest =
  /수정|변경|바꾸|바꿔|고치|고쳐|편집|삭제|지우|지워|다듬|다시\s*(?:써|작성)|원래대로/;
const storyTarget = /소개\s*글|한\s*줄\s*소개|인터뷰|문장|문구|마지막\s*줄/;
const storyStyle = /다정하게|자연스럽게|부드럽게|간결하게|따뜻하게|짧게|길게/;
const factsTarget =
  /기본\s*정보|(?:^|\s)(?:키|나이|직업|지역|거주지|학력|이름)(?:[을를은는이가도]|에서|로)?(?=\s|$)/;

/** Only explicit exclusions of known workflow subjects; this is not a language parser. */
function activeRequestText(text: string): string {
  return text.replace(
    /(?:사진|소개\s*글|한\s*줄\s*소개|기본\s*정보|프로필|약속\s*시간|약속|일정)(?:[은는을를])?\s*(?:말고|그대로\s*(?:두고|둬|두세요)|안\s*(?:바꾸|바꿔|고치|고쳐|수정하|변경하)(?:고|게|줘|주세요)?|(?:바꾸|고치|수정하|변경하)지\s*(?:말고|마|마세요|말아줘|않고))/g,
    " ",
  );
}

export function assistantIntent(raw: string): AssistantIntent {
  const normalized = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  // Safety/support requests keep priority, including inside compound requests.
  if (/신고|차단|고객센터|고객\s*지원|환불|취소/.test(normalized)) return "support";
  const text = activeRequestText(normalized).trim().replace(/\s+/g, " ");
  const preparation =
    /대화\s*(주제|준비|팁|거리)|대화거리|무슨 (얘기|이야기)|할 (얘기|이야기)|맞춤.*(조언|질문)|만남.*(팁|조언)/.test(
      text,
    );
  if (preparation && /상대|이분|그분|만날 분/.test(text)) return "prepare";
  if (/가입|인증|로그인|비밀번호/.test(text)) return "signup";
  if (/기억.*(저장|수정|삭제|관리|지워)|기억해(?:\s*줘|\s*주세요|[.!?]*$)|메모리/.test(text))
    return "memory";

  const edits: AssistantIntent[] = [];
  if (
    /사진/.test(text) &&
    (editRequest.test(text) ||
      /등록|올리|올려|추가|검사|확인|점검|피드백|코칭|조언|팁|추천|분석|판독|평가|봐\s*줘|어때|괜찮|잘\s*나왔|밝기|해상도|비율/.test(
        text,
      ))
  )
    edits.push("edit_photo");
  if (factsTarget.test(text) && editRequest.test(text)) edits.push("edit_facts");
  if (
    (storyTarget.test(text) && (editRequest.test(text) || storyStyle.test(text))) ||
    /^(?:(?:좀|조금|더)\s*)*(?:다정하게|자연스럽게|부드럽게|간결하게|따뜻하게|짧게|길게)(?:\s*(?:해|만들어|다듬어)(?:줘|주세요))?[.!?]*$/.test(
      text,
    )
  )
    edits.push("edit_story");

  const requests: AssistantIntent[] = [];
  if (edits.length) requests.push(edits.length === 1 ? edits[0] : "edit");
  else if (/프로필/.test(text) && editRequest.test(text)) requests.push("edit");
  // A price/product subject is required. 얼마나/얼마 안 됐다 are ordinary advice.
  if (/결제|티켓|상점|구매|가격|이용료|요금/.test(text)) requests.push("payment");
  if (
    /^(좋아요|호감|패스|관심 없어요)[.!?\s]*$|호감.*(보내|남기)|좋아요.*(보내|눌러|남겨)|소개.*(넘겨|거절)/.test(
      text,
    )
  )
    requests.push("interest");
  if (
    /^(일정|약속|시간|장소)( 정리)?[.!?\s]*$|(?:일정|약속).*(잡아|잡고|조율|정리|변경|바꾸|바꿔|확인|예약|확정)|가능한\s*(시간|요일)|만남 요청|만나고 싶/.test(
      text,
    )
  )
    requests.push("schedule");
  if (/(?:만남|데이트)\s*(?:후기|결과)|후기.*(?:남기|작성|기록|수정)/.test(text))
    requests.push("feedback");
  // Do not silently pick a target or launch the wrong workflow for compound requests.
  if (requests.length > 1) return "clarify";
  const wantsCoaching =
    /프로필|소개\s*글|한\s*줄\s*소개|인터뷰/.test(text) &&
    /코칭|장점|아쉬|매력|어때|피드백|인상|조언/.test(text);
  // Asking for a rewrite example is advice, not a request to open the editor.
  if (
    wantsCoaching &&
    (requests.length === 0 ||
      ((requests[0] === "edit" || requests[0] === "edit_story") &&
        /수정\s*예시/.test(text) &&
        !/수정해|변경해|바꿔|반영|적용|저장/.test(text)))
  )
    return "coach_profile";
  if (requests.length === 1) return requests[0];
  if (
    /프로필|소개\s*글|한\s*줄\s*소개|인터뷰/.test(text) &&
    /코칭|장점|아쉬|매력|어때|피드백|인상|조언/.test(text)
  )
    return "coach_profile";
  if (/프로필|사진|소개\s*글|인터뷰|한\s*줄\s*소개/.test(text)) return "profile";
  if (preparation) return "prepare";
  if (/왜.*소개.*(?:없|안\s*와|안\s*오)|아직.*소개.*(?:없|안\s*와|안\s*오)/.test(text))
    return "status";
  if (/소개.*(보여|보기|확인|도착|왔|시켜)|누굴 만나|상대.*보여/.test(text)) return "intro";
  if (/상태|진행|언제.*소개|소개.*언제|기다리는|지금.*할 일|다음 단계/.test(text)) return "status";
  return "unknown";
}

/** Only server-owned state codes; no counterpart identity, private text or hidden reason. */
export function assistantStatusText(state: string | null | undefined): string {
  switch (state) {
    case "policy_required":
      return "먼저 약관 동의를 확인해 주세요.";
    case "identity_required":
      return "본인·성인 확인을 마치면 소개를 준비할 수 있어요.";
    case "phone_required":
      return "먼저 휴대폰 인증을 마쳐주세요.";
    case "profile_incomplete":
      return "사진과 이야기를 채우면 프로필을 완성할 수 있어요.";
    case "photos_required":
      return "소개에 필요한 사진을 등록해 주세요.";
    case "photos_pending":
      return "사진을 확인 중이에요. 검수가 끝나면 소개를 이어가요.";
    case "intro_available":
    case "intro_delivered":
      return "살펴볼 소개가 있어요. 프로필을 읽고 마음을 정해 주세요.";
    case "request_received":
      return "만남 요청이 도착했어요. 요청별로 시간을 확인해 주세요.";
    case "request_waiting":
    case "schedule_waiting":
      return "상대의 답을 기다리는 중이에요. 답이 오면 다음 단계를 확인할 수 있어요.";
    case "schedule_selection":
      return "가능한 시간이 도착했어요. 날짜와 장소를 확인해 주세요.";
    case "meeting_confirmed":
      return "약속이 정해졌어요. 상세에서 시간·장소와 대화를 확인해 주세요.";
    case "meeting_outcome_required":
      return "만남은 어떠셨나요? 만남 여부와 후기를 남겨주세요.";
    case "report_response_required":
      return "확인이 필요한 안전 안내가 있어요. 홈에서 확인해 주세요.";
    case "paused":
      return "지금은 소개를 쉬고 있어요. 나 → 환경설정에서 다시 시작할 수 있어요.";
    case "account_unavailable":
      return "현재 이용 상태를 확인해 주세요. 고객센터에서 도와드릴게요.";
    case "waiting":
      return "소개를 준비 중이에요. 새 소개나 요청이 생기면 홈에서 확인할 수 있어요.";
    default:
      return "현재 상태를 확인하지 못했어요. 홈에서 다시 불러와 주세요.";
  }
}

/** Server fallback for product queries: never spend model tokens inventing product policy. */
export function assistantServiceReply(
  text: string,
  state?: string | null,
  gender?: string | null,
): string | null {
  switch (assistantIntent(text)) {
    case "status":
      return assistantStatusText(state);
    case "signup":
      return "가입은 약관과 인증부터 진행해요. 확인을 마치면 매니저와 프로필을 준비할 수 있어요. 홈에서 필요한 단계를 이어가 주세요.";
    case "profile":
      return "사진·기본 정보와 짧은 인터뷰로 프로필을 준비해요. 작성안을 직접 확인하고 저장해야 공개돼요. 내 프로필에서 이어갈 수 있어요.";
    case "edit":
      return "사진, 기본 정보, 소개글 중 어느 부분을 먼저 바꿀까요? 바꿀 대상을 확인한 뒤 해당 수정 화면에서 이어갈 수 있어요.";
    case "edit_photo":
      return "사진은 내 프로필의 사진 수정에서 바꿀 수 있어요. 현재 사진 도움은 기기 안에서 밝기·해상도·비율을 확인하고 구성을 안내하는 기능이에요. 사진 속 인물이나 성격을 판독하지 않으며, 선택한 사진은 직접 확인하고 저장해 주세요.";
    case "edit_facts":
      return "키·직업·지역 같은 기본 정보는 내 프로필의 수정 화면에서 직접 확인하고 저장해 주세요. 이 대화만으로 정보가 바뀌지 않아요.";
    case "edit_story":
      return "소개글이나 인터뷰 답변에서 바꿀 문장을 선택해 주세요. 수정안은 직접 확인하고 승인해야 반영되며, 사진과 기본 정보는 바꾸지 않아요.";
    case "clarify":
      return "요청하신 일 중 어떤 것부터 도와드릴까요? 먼저 처리할 한 가지를 알려주시면 해당 화면에서 확인할 수 있어요.";
    case "intro":
      return "소개 화면에서 현재 살펴볼 분을 확인해 주세요. 소개 자격과 같은 지역의 후보에 따라 준비하며, 상대의 속마음이나 소개 시점을 단정하지 않아요.";
    case "interest":
      return "소개 화면에서 상대를 확인한 뒤 좋아요나 넘기기를 직접 선택해 주세요. 좋아요는 만남 확정이 아니며, 이 대화만으로 보내지 않아요.";
    case "payment":
      return gender === "female"
        ? "현재 여성 회원에게 티켓 구매를 요청하지 않아요. 소개와 도착한 만남 요청을 확인해 주세요."
        : gender === "male"
          ? "상점에서 현재 상품·금액과 무료 베타 여부를 확인해 주세요. 결제와 티켓 사용은 별도 확인이 필요하며, 이 대화가 결제하지 않아요."
          : "현재 계정의 이용 조건을 먼저 확인해 주세요. 결제나 티켓 사용은 별도 확인이 필요하며, 이 대화가 결제하지 않아요.";
    case "schedule":
      return "일정은 상대와 현재 요청을 확인한 뒤 후보를 정리해요. 날짜·장소와 전송 내용을 직접 확인해야 반영돼요. 이 대화만으로 약속을 확정하지 않아요.";
    case "feedback":
      return "약속 상세에서 실제 만남 여부와 후기를 남길 수 있어요. 만나지 못했다면 사유를 직접 확인해 주세요. 이 대화가 신고나 후기를 자동으로 제출하지 않아요.";
    case "memory":
      return "기억 관리는 승인한 선호만 따로 저장하거나 지우는 기능이에요. 상담 문장이 자동으로 기억되지는 않아요. 기억 관리에서 내용을 확인해 주세요.";
    case "prepare":
      return "열람할 수 있는 상대의 소개·약속 화면에서 대화 준비를 선택해 주세요. 공개 프로필의 이야기로 팁을 준비하며, 상대의 마음을 추측하지 않아요.";
    case "support":
      return "결제·취소·신고는 제가 자동 처리하지 않아요. 약속 취소는 약속 상세에서, 결제·환불 문의와 신고는 고객센터에서 확인해 주세요.";
    default:
      return null;
  }
}
