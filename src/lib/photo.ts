/**
 * 프로필 사진 업로드·표시.
 *
 * 예전에는 FileReader.readAsDataURL 로 base64 를 만들어 profiles.photo_url 에
 * 그대로 넣었다(진단 UX-3). 4MB 사진이 5.4MB 문자열이 되어 그 행을 읽는 모든
 * 쿼리에 딸려 나왔고, 여성의 후보 조회는 권역 남성 전원을 읽으므로 인원수만큼
 * 곱해졌다. 이제 Storage 에 올리고 행에는 경로만 남긴다.
 *
 * 버킷은 비공개다 — 사진은 소개가 열린 상대에게만 보여야 하고, 공개 버킷이면
 * URL 을 아는 누구나 소개를 넘긴 뒤에도 영구히 볼 수 있다.
 */
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

const BUCKET = "profile-photos";

/** 장변 상한. 화면에서 쓰는 최대 크기(4:5 카드)의 2배 남짓이면 충분하다. */
const MAX_EDGE = 1080;
const QUALITY = 0.82;

/**
 * 업로드 전에 브라우저에서 줄인다. 원본을 그대로 올리면 상한(2MB)에 걸려
 * "왜 안 되는지" 사용자가 알 수 없는 실패가 난다.
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리할 수 없습니다.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY),
  );
  if (!blob) throw new Error("이미지를 변환할 수 없습니다.");
  return blob;
}

/** 업로드하고 저장할 **경로**를 돌려준다. 행에는 이 경로만 들어간다. */
export async function uploadProfilePhoto(file: File): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요합니다.");

  const blob = await shrink(file);
  // 경로 첫 폴더가 소유자여야 한다 — Storage 정책이 그걸로 판정한다.
  const path = `${session.user.id}/${crypto.randomUUID()}.webp`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * 표시용 서명 URL. 비공개 버킷이라 매번 받아야 한다.
 *
 * 이미 http(s) 로 시작하면 그대로 돌려준다 — 예전 데이터(외부 URL)와
 * 섞여 있을 수 있다. data: 로 시작하는 옛 base64 값도 그대로 통과시켜
 * 마이그레이션 전 프로필이 깨져 보이지 않게 한다.
 */
export async function photoUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^(https?:|data:|blob:)/.test(pathOrUrl)) return pathOrUrl;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

/**
 * 경로 → 서명 URL 을 컴포넌트에서 쓰기 위한 훅.
 *
 * 사진을 그리는 곳이 여러 화면이라 각자 서명 URL 을 만들면 규칙이 흩어진다.
 * 여기 한 곳만 통과하게 한다.
 */
export function usePhotoUrl(pathOrUrl: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pathOrUrl) {
      setUrl(null);
      return;
    }
    photoUrl(pathOrUrl).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [pathOrUrl]);

  return url;
}
