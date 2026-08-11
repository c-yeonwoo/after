import {
  DRINKING_OPTIONS,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
  ageFrom,
} from "@/components/onboarding/basics";
import { followUpFor } from "@/components/onboarding/profile";
import { HUBS } from "@/lib/brand";
import type { ProfileView } from "@/components/app/ProfileDetail";

/**
 * 프로필 행 → 화면이 쓰는 모양.
 *
 * 같은 변환이 내 프로필(profile.tsx)과 소개 상세(intro.tsx)에 복제돼 있었다.
 * 운영 화면이 **사용자가 보는 것과 같은 프로필**을 그려야 해서 세 번째 사본이
 * 생길 참이었는데, 라벨 매핑이 갈리면 운영자와 회원이 다른 것을 보게 된다.
 *
 * 입력이 두 모양이다 — profiles 행은 birth 를, public_profiles 뷰는 미리 계산한
 * age 를 준다. 둘 다 받아서 여기서 흡수한다.
 */
export type ProfileSource = {
  name: string | null;
  birth?: string | null;
  age?: number | null;
  job: string | null;
  mbti: string | null;
  smoking: string | null;
  drinking: string | null;
  religion: string | null;
  // public_profiles 뷰는 nullable 로 나온다(뷰의 컬럼은 not null 이 안 붙는다).
  hub_id: string | null;
  photo_url: string | null;
  headline: string | null;
  intro: string | null;
  interests: string[] | null;
  match_tags: string[] | null;
  topics: string[] | null;
  details: unknown;
};

export function toProfileView(p: ProfileSource): ProfileView {
  const details = (p.details as Record<string, string> | null) ?? {};
  const interests = (p.interests ?? []).map((v) => v.trim()).filter(Boolean);

  return {
    name: p.name ?? "",
    age: p.age ?? (p.birth ? ageFrom(p.birth) : null),
    job: p.job ?? "",
    mbti: p.mbti ?? undefined,
    smoking: SMOKING_OPTIONS.find((o) => o.id === p.smoking)?.label,
    drinking: DRINKING_OPTIONS.find((o) => o.id === p.drinking)?.label,
    religion: RELIGION_OPTIONS.find((o) => o.id === p.religion)?.label,
    area: HUBS.find((h) => h.id === p.hub_id)?.label,
    photo: p.photo_url || undefined,
    headline: p.headline ?? "",
    intro: p.intro ?? "",
    interests,
    matchTags: p.match_tags ?? [],
    topics: p.topics ?? [],
    // 인터뷰는 관심사마다 딸린 후속 질문이다. 답이 없는 항목은 내지 않는다.
    answers: interests
      .map((label) => ({ q: followUpFor(label), a: (details[label] ?? "").trim() }))
      .filter((x) => x.a),
  };
}
