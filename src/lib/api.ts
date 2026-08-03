/**
 * 도메인 API — S1 서버 권위 함수(docs/s1-server-authority.md)에 대한 얇은 래퍼.
 * 화면은 supabase 클라이언트를 직접 만지지 않고 이 파일만 호출한다.
 *
 * store.ts(localStorage)를 대체한다. 상태는 이제 클라이언트가 아니라
 * Postgres + RLS 에 있고, 여기 있는 함수는 전부 SECURITY DEFINER 함수 호출이다 —
 * 티켓 차감·게이트·배제를 클라이언트가 직접 바꿀 방법이 없다.
 */
import type { Basics } from "@/components/onboarding/basics";
import type { ProfileDraft } from "@/components/onboarding/profile";
import type { MeetPrefs } from "@/lib/meet";
import { POLICY_VERSION } from "@/lib/policy";
import { supabase } from "@/lib/supabase";

import type { Database } from "./database.types";

export type Gender = Database["public"]["Enums"]["gender"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
/**
 * 상대에게 보이는 프로필. `profiles` 테이블이 아니라 `public_profiles` 뷰에서 온다.
 *
 * S8 이전에는 상대도 `profiles` 를 그대로 읽었고, 그래서 여성이 권역 내 남성
 * 전원의 `company_email` 과 정확한 `birth` 를 읽을 수 있었다(진단 SEC-1).
 * RLS 는 "어느 행"만 판정하므로 컬럼을 가리려면 노출면 자체를 분리해야 한다.
 * 나이는 서버가 계산한 `age` 로 온다 — 생일은 나가지 않는다.
 */
export type PublicProfile = Database["public"]["Views"]["public_profiles"]["Row"];
export type Intro = Database["public"]["Tables"]["intros"]["Row"];
export type Ticket = Database["public"]["Tables"]["tickets"]["Row"];
export type Meeting = Database["public"]["Tables"]["meetings"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MsgChannel = Database["public"]["Enums"]["msg_channel"];

// ─────────────────────────── 인증 (이메일 OTP) ───────────────────────────
// 회사 이메일 인증 = Supabase Auth 이메일 OTP. 온보딩 4단계의 "코드 받기 → 6자리
// 입력" UI가 그대로 이 흐름과 맞아떨어진다. isCompanyEmail() 도메인 차단 목록은
// 인증이 아니라 보조 수단이며, 실제 인증은 여기 verifyEmailCode() 가 한다.

/**
 * Supabase Auth 의 영어 에러를 화면에 그대로 노출하지 않는다.
 * ("Token has expired or is invalid" 이 한국어 화면에 그대로 떴다)
 */
export function authErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.toLowerCase();
  if (m.includes("expired") || m.includes("invalid")) {
    return "코드가 맞지 않거나 만료되었습니다. 코드를 다시 받아 주세요.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (m.includes("email") && m.includes("not") && m.includes("confirm")) {
    return "이메일 인증이 완료되지 않았습니다.";
  }
  return raw || "인증에 실패했습니다.";
}

/**
 * 개발환경 전용: 로컬 Mailpit 에서 방금 발송된 코드를 읽어온다.
 *
 * 인증을 **우회하지 않는다.** 실제로 발송된 진짜 코드를 가져와 정상적으로
 * verifyOtp 를 태울 뿐이다. 그래서 개발 편의를 얻으면서도 인증 경로가 약해지지
 * 않는다. Mailpit(127.0.0.1)이 없으면 조용히 실패하고 수동 입력으로 돌아간다.
 *
 * `import.meta.env.DEV` 는 프로덕션 빌드에서 false 로 정적 치환되므로 이 함수
 * 본문은 번들에서 아예 제거된다.
 */
export async function devFetchLatestOtp(email: string): Promise<string | null> {
  if (!import.meta.env.DEV) return null;
  try {
    // vite.config.ts 의 dev 프록시 경유 (직접 호출하면 CORS 로 막힌다)
    const res = await fetch("/__dev/mail/api/v1/messages", {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      messages?: { To?: { Address?: string }[]; Snippet?: string }[];
    };
    const hit = body.messages?.find((msg) =>
      msg.To?.some((t) => t.Address?.toLowerCase() === email.toLowerCase()),
    );
    return hit?.Snippet?.match(/(\d{6})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function requestEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/**
 * 재로그인. 가입과 같은 OTP 흐름이지만 **프로필을 만들지 않는다** —
 * gender·hub_id 는 가입 시에만 정하는 값이라 로그인 화면에서 물을 수 없다.
 *
 * 검증 후 프로필 상태에 따라 어디로 보낼지 호출자가 결정할 수 있게 종류를 반환한다.
 */
export async function signInExisting(
  email: string,
  token: string,
): Promise<
  | { kind: "ok"; profile: Profile }
  | { kind: "incomplete"; profile: Profile }
  | { kind: "no-profile" }
> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("인증에 실패했습니다.");

  // 인증은 됐으니 email_verified_at 을 최신화한다(가입 흐름과 동일).
  // 프로필이 아직 없는 계정이면 실패하는데, 그건 아래에서 no-profile 로 처리한다.
  await supabase.rpc("sync_email_verified");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();

  if (!profile) return { kind: "no-profile" };
  await track("login");
  if (profile.onboarding_step < 7) return { kind: "incomplete", profile };
  return { kind: "ok", profile };
}

/** 코드 검증 + (최초 1회) 프로필 생성. gender/hubId 는 인증 이전 단계에서 이미 고른 값. */
export async function verifyEmailCode(
  email: string,
  token: string,
  gender: Gender,
  hubId: string,
): Promise<Profile> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("인증에 실패했습니다.");

  // 재인증(재로그인) 시 이미 프로필이 있을 수 있다 — upsert 로 멱등하게 처리.
  // gender/hub_id 는 최초 생성 시에만 의미가 있고, 이후엔 컬럼 권한상 클라이언트가 못 바꾼다.
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({ id: uid, gender, hub_id: hubId, company_email: email });
    if (insertError) throw insertError;
  }

  // email_verified_at 은 서버 전용 컬럼이라 클라이언트가 직접 못 쓴다.
  // verifyOtp() 가 방금 auth.users.email_confirmed_at 을 채웠으니, 그 값을
  // SECURITY DEFINER 함수로 profiles 에 반영한다 (버그: 이 호출이 빠져 있어서
  // 온보딩을 끝까지 마쳐도 아무도 매칭 대상이 되지 못했다).
  const { data: synced, error: syncError } = await supabase.rpc("sync_email_verified");
  if (syncError) throw syncError;

  await track("signup_verified");
  return synced;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * 약관·개인정보 수집 동의 기록 (PRD 266).
 * 체크박스 상태는 증빙이 못 되므로 서버에 시각과 버전을 남긴다.
 */
export async function recordConsent(): Promise<Profile> {
  const { data, error } = await supabase.rpc("record_consent", {
    p_policy_version: POLICY_VERSION,
  });
  if (error) throw error;
  return data;
}

/**
 * 홈이 필요한 상태 전부. 조각조각 묻지 않는다(진단 PERF-3).
 *
 * 읽기 전용이라 소개 오픈은 포함하지 않는다 — has_open_intro 가 false 인
 * 남성이면 호출자가 openIntro() 를 한 번 부르고 다시 읽는다.
 */
export type HomeState = {
  me: Profile | null;
  candidate: PublicProfile | null;
  meeting: Meeting | null;
  request_count: number;
  pending_no_show: NoShowReport | null;
  has_open_intro: boolean;
};

export async function homeState(): Promise<HomeState> {
  const { data, error } = await supabase.rpc("home_state");
  if (error) throw error;
  return data as unknown as HomeState;
}

// ─────────────────────── 온보딩 (프로필 저장) ───────────────────────

/** 온보딩 단계별 진행 저장. 기존 코드는 완료 시점에만 저장해 중간 이탈 시 재입력을 강요했다. */
export async function saveOnboardingStep(userId: string, step: number, patch: Partial<Profile>) {
  const { error } = await supabase
    .from("profiles")
    .update({ ...patch, onboarding_step: step })
    .eq("id", userId);
  if (error) throw error;
}

export async function completeOnboarding(
  userId: string,
  basics: Basics,
  profile: ProfileDraft,
  intro: string,
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      name: basics.name,
      birth: basics.birth,
      job: basics.job,
      mbti: basics.mbti,
      smoking: basics.smoking,
      drinking: basics.drinking,
      religion: basics.religion,
      headline: profile.headline,
      intro,
      interests: profile.interests,
      details:
        profile.details as unknown as Database["public"]["Tables"]["profiles"]["Row"]["details"],
      match_tags: profile.matchTags,
      match_note: profile.matchNote || null,
      topics: profile.topics,
      topic_note: profile.topicNote || null,
      onboarding_step: 7,
    })
    .eq("id", userId);
  if (error) throw error;

  await track("profile_completed");
}

// ─────────────────────── 호·불 평가 (D2) ───────────────────────

/** affinity_submitted 계측은 DB 트리거(affinities_log_submitted)가 남긴다 — 여기서 남기지 않는다. */
export async function submitAffinity(toId: string, verdict: "like" | "pass") {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  const { error } = await supabase
    .from("affinities")
    .insert({ from_id: session.user.id, to_id: toId, verdict });
  if (error) throw error;
}

/**
 * 여성이 지금 평가할 다음 남성 1명.
 *
 * 선정을 서버가 한다(S10). 예전에는 권역 남성 **전원**을 받아 클라이언트에서
 * `[0]` 만 썼고, 이미 평가한 상대를 제외하려고 ID 전체를 URL 쿼리에 넣었다 —
 * 평가 약 210건에서 HTTP 414 로 후보 조회가 영구히 죽었다(복구 경로 없음).
 * 덤으로 "훑어보는 피드 없음"(F3)이 UI 에만 있고 데이터는 전부 브라우저에
 * 내려와 있던 문제도 함께 없어진다.
 */
export async function myPendingCandidate(): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("next_candidate");
  if (error) throw error;
  return data?.[0] ?? null;
}

/** 남은 후보 수. "이번이 마지막"인지 화면이 알 수 있어야 한다. */
export async function remainingCandidates(): Promise<number> {
  const { data, error } = await supabase.rpc("remaining_candidates");
  if (error) throw error;
  return data ?? 0;
}

export async function getProfile(id: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 여러 명을 한 번에. 목록 화면의 N+1 을 없앤다(진단 PERF-3). */
export async function getProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("public_profiles")
    .select("*")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return new Map((data ?? []).flatMap((p) => (p.id ? [[p.id, p] as const] : [])));
}

// ─────────────────────── 소개 (F4) ───────────────────────

export async function openIntro(): Promise<Intro> {
  const { data, error } = await supabase.rpc("open_intro");
  if (error) throw error;
  return data;
}

/** 소개 넘기기 = 영구 배제 (D3·P1). 호출 전 반드시 확인 다이얼로그를 거쳐야 한다. */
export async function passIntro(introId: string): Promise<void> {
  const { error } = await supabase.rpc("pass_intro", { p_intro_id: introId });
  if (error) throw error;
}

export async function getOpenIntro(): Promise<Intro | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("intros")
    .select("*")
    .eq("male_id", session.user.id)
    .is("closed_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 남성이 지금 보고 있는 소개 = 열린 intro + 상대(여성) 프로필. */
export async function getOpenIntroWithCandidate(): Promise<{
  intro: Intro;
  candidate: PublicProfile;
} | null> {
  const intro = await getOpenIntro();
  if (!intro) return null;
  const candidate = await getProfile(intro.female_id);
  if (!candidate) return null;
  return { intro, candidate };
}

/**
 * 남성 전용: 열린 소개가 없으면 다음 후보로 열어본다.
 * open_intro()는 멱등이라 이미 열려 있으면 그대로 반환하고, 자격 있는 후보가
 * 아직 없으면 P0002로 실패한다(정상 상태 — 화면은 "대기 중"으로 처리한다).
 */
export async function ensureOpenIntro(): Promise<{
  intro: Intro;
  candidate: PublicProfile;
} | null> {
  const existing = await getOpenIntroWithCandidate();
  if (existing) return existing;

  const { error } = await supabase.rpc("open_intro");
  if (error) {
    if (error.code === "P0002") return null;
    throw error;
  }
  return getOpenIntroWithCandidate();
}

// ─────────────────────── 티켓 (F5) ───────────────────────

/** 티켓 차감 + 만남 생성. 이름이 "use"로 시작하면 React 훅으로 오인되므로 redeem 을 쓴다. */
export async function redeemMeetingTicket(introId: string): Promise<Meeting> {
  const { data, error } = await supabase.rpc("use_meeting_ticket", { p_intro_id: introId });
  if (error) throw error;
  return data;
}

export async function listMyTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return data;
}

export type TicketOrder = Database["public"]["Tables"]["ticket_orders"]["Row"];

/**
 * 티켓 구매 의사 접수.
 *
 * 결제 게이트웨이가 붙기 전까지 `pending` 주문이 곧 "사고 싶다"는 신호다.
 * 예전에는 티켓이 0장이면 비활성 버튼("보유한 티켓이 없습니다")만 남아
 * 사이클이 여기서 끊겼다(진단 UX-7) — 누를 수 있는 것이 없었다.
 */
export async function requestTicketOrder(quantity: 1 | 3 = 1): Promise<TicketOrder> {
  const { data, error } = await supabase.rpc("create_ticket_order", { p_quantity: quantity });
  if (error) throw error;
  await track("ticket_requested", { quantity });
  return data;
}

/** 마이페이지 대시보드용 숫자. 행동으로 이어지거나 본인에게 의미 있는 것만 센다. */
export type MyStats = {
  unusedTickets: number;
  metCount: number;
  joinedAt: string;
};

export async function myStats(): Promise<MyStats | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const [{ data: profile }, tickets, { count: met }] = await Promise.all([
    supabase.from("profiles").select("created_at").eq("id", session.user.id).maybeSingle(),
    unusedTicketCount(),
    // 내가 "만났다"고 답한 만남. completed_by 에 내가 들어 있어야 한다 —
    // 상대만 답한 건 내 기록이 아니다.
    supabase
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .not("completed_at", "is", null)
      .contains("completed_by", [session.user.id]),
  ]);

  if (!profile) return null;
  return { unusedTickets: tickets, metCount: met ?? 0, joinedAt: profile.created_at };
}

/** 후기 요청 메일 수신 여부. 만남 진행 알림은 끌 수 없다(상대의 환불 기한이 걸려 있다). */
export async function setFeedbackEmails(on: boolean): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");
  const { error } = await supabase
    .from("profiles")
    .update({ feedback_emails: on })
    .eq("id", session.user.id);
  if (error) throw error;
}

/** 아직 처리되지 않은 내 주문. 있으면 "접수됨" 상태로 보여준다. */
export async function myPendingTicketOrder(): Promise<TicketOrder | null> {
  const { data, error } = await supabase
    .from("ticket_orders")
    .select("*")
    .eq("state", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function unusedTicketCount(): Promise<number> {
  const { count, error } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("state", "unused");
  if (error) throw error;
  return count ?? 0;
}

// ─────────────────────── 만남 조율 (F6) ───────────────────────

export async function submitMeetingPrefs(meetingId: string, prefs: MeetPrefs): Promise<Meeting> {
  const { data, error } = await supabase.rpc("submit_meeting_prefs", {
    p_meeting_id: meetingId,
    p_prefs: prefs as unknown as Database["public"]["Tables"]["meetings"]["Row"]["prefs"],
  });
  if (error) throw error;
  return data;
}

export async function confirmMeeting(
  meetingId: string,
  scheduledAt: string,
  placeName: string,
  placeKind?: string,
): Promise<Meeting> {
  const { data, error } = await supabase.rpc("confirm_meeting", {
    p_meeting_id: meetingId,
    p_scheduled_at: scheduledAt,
    p_place_name: placeName,
    p_place_kind: placeKind,
  });
  if (error) throw error;
  return data;
}

export async function markMet(meetingId: string): Promise<Meeting> {
  const { data, error } = await supabase.rpc("mark_met", { p_meeting_id: meetingId });
  if (error) throw error;
  return data;
}

export async function getMeetingByIntro(introId: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("intro_id", introId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 이 만남의 상대(= 나 아닌 당사자) 프로필. */
export async function getMeetingCounterpart(meeting: Meeting): Promise<PublicProfile | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: intro, error } = await supabase
    .from("intros")
    .select("male_id, female_id")
    .eq("id", meeting.intro_id)
    .maybeSingle();
  if (error) throw error;
  if (!intro) return null;

  const counterpartId = intro.male_id === session.user.id ? intro.female_id : intro.male_id;
  return getProfile(counterpartId);
}

export type MeetingRequest = { meeting: Meeting; candidate: PublicProfile };

/**
 * 여성이 답을 보내야 하는 만남 요청 **전부**.
 *
 * 불변식 2(`intros_one_open_per_male`)는 **남성 기준** 부분 유니크 인덱스다 —
 * `female_id` 에는 제약이 없으므로 여러 남성이 같은 여성에게 동시에 티켓을 쓸 수 있다.
 * 예전 구현은 `.maybeSingle()` 이라 2건 이상이면 PGRST116 을 던졌고, 여성 홈이
 * "불러오는 중"에서 멈춘 채 남성들의 티켓만 24시간 뒤 자동 환불됐다.
 *
 * 오래 기다린 요청이 먼저다 — 환불 기한이 먼저 닥치기 때문이다.
 */
export async function listMeetingsAwaitingMyPrefs(): Promise<MeetingRequest[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const { data: intros, error: introErr } = await supabase
    .from("intros")
    .select("id, male_id")
    .eq("female_id", session.user.id)
    .is("closed_at", null);
  if (introErr) throw introErr;
  if (!intros?.length) return [];

  const { data: meetings, error: meetingErr } = await supabase
    .from("meetings")
    .select("*")
    .in(
      "intro_id",
      intros.map((i) => i.id),
    )
    .is("prefs_submitted_at", null)
    .is("cancelled_at", null)
    .order("created_at", { ascending: true });
  if (meetingErr) throw meetingErr;
  if (!meetings?.length) return [];

  const maleByIntro = new Map(intros.map((i) => [i.id, i.male_id]));
  // 건별로 getProfile 을 돌면 N+1 이 된다(진단 PERF-3). 한 번에 모아 온다.
  const profiles = await getProfiles(
    meetings.flatMap((m) => {
      const id = maleByIntro.get(m.intro_id);
      return id ? [id] : [];
    }),
  );

  return meetings.flatMap((meeting) => {
    const maleId = maleByIntro.get(meeting.intro_id);
    const candidate = maleId ? profiles.get(maleId) : undefined;
    return candidate ? [{ meeting, candidate }] : [];
  });
}

export type ActiveMeeting = { meeting: Meeting; counterpart: PublicProfile };

/**
 * 진행 중인 내 만남 **전부** (대화가 열린 것 = 만남 확정 완료, S7).
 *
 * 남성은 불변식 2 때문에 항상 0~1건이지만, 여성은 여러 남성에게 동시에 요청을
 * 받을 수 있어 N건이 될 수 있다. 예전 구현은 `.limit(1)` 이라 던지지는 않았지만
 * **나머지를 조용히 숨겼다** — 열려 있는 대화가 사라져 보이는 셈이다.
 *
 * 최근 것이 위로 온다.
 */
export async function listMyActiveMeetings(): Promise<ActiveMeeting[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const { data: intros, error: introErr } = await supabase
    .from("intros")
    .select("id, male_id, female_id")
    .or(`male_id.eq.${session.user.id},female_id.eq.${session.user.id}`);
  if (introErr) throw introErr;
  if (!intros?.length) return [];

  const { data: meetings, error: meetingErr } = await supabase
    .from("meetings")
    .select("*")
    .in(
      "intro_id",
      intros.map((i) => i.id),
    )
    .is("cancelled_at", null)
    .not("confirmed_at", "is", null)
    .order("created_at", { ascending: false });
  if (meetingErr) throw meetingErr;
  if (!meetings?.length) return [];

  const introById = new Map(intros.map((i) => [i.id, i]));
  const counterpartOf = (introId: string) => {
    const intro = introById.get(introId);
    if (!intro) return null;
    return intro.male_id === session.user.id ? intro.female_id : intro.male_id;
  };

  const profiles = await getProfiles(
    meetings.flatMap((m) => {
      const id = counterpartOf(m.intro_id);
      return id ? [id] : [];
    }),
  );

  return meetings.flatMap((meeting) => {
    const id = counterpartOf(meeting.intro_id);
    const counterpart = id ? profiles.get(id) : undefined;
    return counterpart ? [{ meeting, counterpart }] : [];
  });
}

// ─────────────────────── 채팅 (F7) ───────────────────────
// 게이트는 RLS 가 판정한다(is_channel_open). 여기서 열고 닫는 로직을 흉내내지 않는다 —
// 그게 진단에서 뚫렸던 방식이다. INSERT/SELECT 가 그냥 실패하면 그것이 곧 게이트다.

export async function listMessages(meetingId: string, channel: MsgChannel): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("channel", channel)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendMessage(
  meetingId: string,
  channel: MsgChannel,
  body: string,
): Promise<Message> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  const { data, error } = await supabase
    .from("messages")
    .insert({ meeting_id: meetingId, sender_id: session.user.id, channel, body })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** 채널이 지금 실제로 열려 있는지. 낙관적 UI 판단용 — 최종 판정은 항상 INSERT 실패 여부다. */
export function isChannelOpenNow(meeting: Meeting, channel: MsgChannel): boolean {
  if (meeting.cancelled_at) return false;
  if (channel === "coord") return meeting.prefs_submitted_at != null;
  return (
    meeting.private_opens_at != null && new Date(meeting.private_opens_at).getTime() <= Date.now()
  );
}

// ─────────────────────── 피드백 (F9) ───────────────────────

export async function submitFeedback(
  meetingId: string,
  met: boolean,
  result?: string,
  body?: string,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  const { error } = await supabase
    .from("feedbacks")
    .insert({ meeting_id: meetingId, author_id: session.user.id, met, result, body });
  if (error) throw error;
}

// ─────────────────────── 노쇼 (P4) ───────────────────────

export type NoShowReport = Database["public"]["Tables"]["no_show_reports"]["Row"];

/** 노쇼 신고. 이것만으로는 아무 제재도 일어나지 않는다 — 상대 확인을 거친다. */
export async function reportNoShow(meetingId: string): Promise<NoShowReport> {
  const { data, error } = await supabase.rpc("report_no_show", { p_meeting_id: meetingId });
  if (error) throw error;
  return data;
}

/** 피고발자의 응답. admit=true 면 즉시 확정(제명), false 면 기각. */
export async function respondNoShow(reportId: string, admit: boolean): Promise<NoShowReport> {
  const { data, error } = await supabase.rpc("respond_no_show", {
    p_report_id: reportId,
    p_admit: admit,
  });
  if (error) throw error;
  return data;
}

/** 나에게 접수된(내가 피고발자인) 대기 중 신고. 없으면 null. */
export async function myPendingNoShowReport(): Promise<NoShowReport | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("no_show_reports")
    .select("*")
    .eq("accused_id", session.user.id)
    .eq("state", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─────────────────────── 계측 (F10) ───────────────────────

export async function track(name: string, props: Record<string, unknown> = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await supabase.from("events").insert({
    user_id: session?.user.id ?? null,
    name,
    props: props as Database["public"]["Tables"]["events"]["Row"]["props"],
  });
}
