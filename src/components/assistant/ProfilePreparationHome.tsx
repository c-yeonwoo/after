import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Camera, MessageCircleHeart, UserRound } from "lucide-react";
import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { AssistantMark } from "./AssistantMark";
import { accountChecksComplete } from "@/lib/assistant";
import { carrierIdentityEnabled } from "@/lib/carrierIdentity";
import type { Profile } from "@/lib/api";

export function ProfilePreparationHome({ profile }: { profile: Profile }) {
  const checked = accountChecksComplete(profile, carrierIdentityEnabled);
  return (
    <AppScreen hideTabs>
      <div className="assistant-welcome">
        <AssistantMark className="size-14" />
        <h2 className="mt-5 text-[1.875rem] font-bold leading-[1.25] tracking-tight break-keep">
          {checked ? "반가워요. 어떤 분인지 들려주세요." : "먼저 계정을 확인할게요."}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {checked
            ? "사진과 짧은 이야기로 나다운 프로필을 만들어요."
            : "약관과 인증을 마치면 프로필을 준비해요."}
        </p>
      </div>
      <ol className="assistant-checklist mt-7" aria-label="소개 준비 단계">
        <li>
          <span className="assistant-step-icon">{checked ? <Check /> : <UserRound />}</span>
          <div>
            <strong>계정 확인</strong>
            <p>{checked ? "회사 이메일·휴대폰 확인 완료" : "약관 동의와 인증부터"}</p>
          </div>
        </li>
        <li>
          <span className="assistant-step-icon">
            <Camera />
          </span>
          <div>
            <strong>프로필 준비</strong>
            <p>나이·사진·기본 정보와 나의 이야기</p>
          </div>
        </li>
        <li>
          <span className="assistant-step-icon">
            <MessageCircleHeart />
          </span>
          <div>
            <strong>확인하고 소개 시작</strong>
            <p>내가 확인한 프로필만 공개해요</p>
          </div>
        </li>
      </ol>
      <Button asChild size="lg" className="mt-7 w-full">
        <Link to="/signup" search={{ prepare: true }}>
          {checked ? "내 비서와 프로필 만들기" : "계정 확인 이어하기"}
          <ArrowRight className="ml-2 size-4" />
        </Link>
      </Button>
      <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
        프로필 완성과 필수 확인 전에는 소개가 시작되지 않아요.
      </p>
      <Link
        to="/me"
        className="mt-5 flex min-h-11 items-center justify-center text-sm text-muted-foreground"
      >
        계정 관리
      </Link>
    </AppScreen>
  );
}
