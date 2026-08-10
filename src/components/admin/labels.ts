import { HUBS } from "@/lib/brand";

/**
 * 운영 화면이 저장값을 사람 말로 바꾸는 규칙.
 *
 * 컴포넌트와 같은 파일에 두면 fast refresh 가 깨진다(컴포넌트 외의 것을 함께
 * 내보내는 파일은 갱신 대상에서 빠진다) — 그래서 .ts 로 분리한다.
 */

/**
 * 권역 라벨은 brand.ts 의 HUBS 가 단일 진실이다. 운영 화면에서 다시 적으면
 * 사용자 화면과 이름이 갈린다("강남" vs "강남·역삼권").
 */
export const hubLabel = (id: string) => HUBS.find((h) => h.id === id)?.label ?? id;

/**
 * 저장값은 'none'·'social' 같은 식별자다. 온보딩이 쓰는 라벨을 그대로 재사용해
 * 운영자와 회원이 같은 어휘를 보게 한다 — 다르면 CS 통화에서 말이 어긋난다.
 * 모르는 값은 원문으로 보여준다. 운영 화면에서 값을 숨기면 안 된다.
 */
export const optionLabel = (
  opts: readonly { id: string; label: string }[],
  v: string | null,
): string | null => (v ? (opts.find((o) => o.id === v)?.label ?? v) : null);
