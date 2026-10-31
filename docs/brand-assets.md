# 애프터 브랜드 자산

## 현재 기준 — 2026-11-01 승인

사용자가 3개 시안 중 첫 번째 **“이어주는 after”**를 승인했다. 소문자 `after`를 직접 그린 모노라인 워드마크와 `f/t`가 가로획으로 이어지는 심벌을 사용한다. 일반 글꼴로 다시 입력하거나 코럴 점·기존 `a` 링 심벌을 붙이지 않는다. 앱의 화이트·핑크·웜화이트 팔레트, Wanted Sans UI 글꼴, 승인된 개인 소개 매니저 캐릭터는 유지한다.

- 단일 원본: [after-logo.json](../brand/after-logo.json), revision `after-ft-1`. 워드마크 viewBox는 `0 0 325 114`, 심벌은 `0 0 104 110`; 획 두께는 원본 좌표 기준 `12`, 끝과 연결은 둥글게 처리한다. 비율과 연결부를 보존하고 획을 개별 수정하지 않는다.
- 앱: [Logo.tsx](../src/components/Logo.tsx)가 생성된 [brandLogo.ts](../src/lib/brandLogo.ts)의 경로를 쓴다. `currentColor`와 `text-foreground`로 테마에 맞는 잉크색을 상속한다. 워드마크는 `sm` 높이 `28px`, 기본 `md` 높이 `32px`, 독립 심벌은 기본 `24×24px`이다. 워드마크 폭은 원본 비율로 자동 계산한다.
- 고정색 내보내기: 잉크 `#393B42`, 웜화이트 아이콘 바탕 `#FAF9F6`, 실행 화면 바탕 `#FFFFFF`. 반전 워드마크는 흰색이다. 이는 내보내기용 색이며 UI의 의미색 토큰을 대체하지 않는다.
- [워드마크](../brand/after-wordmark.svg), [흰색 워드마크](../brand/after-wordmark-white.svg), [심벌](../brand/after-symbol.svg)은 폰트 의존성 없는 SVG다. 동일한 웹 공개본은 `public/brand/`에 생성한다. 밝은 바탕에는 잉크 버전, 충분히 어두운 바탕에는 흰색 버전을 사용한다.
- 아이콘: [favicon.svg](../public/favicon.svg), `public/favicon.ico`, `public/icon-512.png`, `public/apple-touch-icon.png`, [app-icon-ios.svg](../brand/app-icon-ios.svg), `brand/app-store-1024.png`, iOS `AppIcon.appiconset/AppIcon-512@2x.png`. 스토어·iOS·Apple Touch용은 불투명한 정사각형이며 운영체제가 모서리를 처리한다.
- 실행 화면: [splash.svg](../brand/splash.svg)와 iOS `Splash.imageset/`의 2732px PNG 3개. 공유 미리보기: [og-image.html](../brand/og-image.html) → `public/og-image.png` (`1200×630`). SNS 프로필용은 `brand/social-profile-1024.png`다.

## 재생성

저장소 루트에서 실행한다. 로컬 Node 의존성의 Playwright/Chromium과 Python 3의 Pillow가 필요하다.

```bash
node scripts/generate-brand-assets.mjs
```

[생성 스크립트](../scripts/generate-brand-assets.mjs)는 원본 JSON에서 앱 경로 데이터와 SVG·PNG·ICO를 결정적으로 다시 만든다. 이미지 생성 서비스나 외부 모델을 호출하지 않는다. 원본을 바꿀 때는 이 명령으로 전체 묶음을 갱신하고 앱의 밝은/어두운 화면, 작은 파비콘, 불투명한 iOS 아이콘, 실행 화면과 공유 미리보기에서 같은 연결 형태가 유지되는지 확인한다. 생성된 `brandLogo.ts`와 SVG를 직접 고치지 않는다.

스토어 스크린샷은 아이콘과 별도 산출물이다. UI 문구나 색이 바뀌면 [App Store 제출 자료](appstore-submission.md)의 캡처를 다시 만들고, 과거 화면을 제출하지 않는다.

## 이전 브랜드 기록 — 현재 제작에 적용하지 않음

아래는 변경 이력을 보존한 과거 기록이다. 코럴 점, `a` 심벌, 잉크 채움 버튼, Pretendard 지침은 현재 기준이 아니다. 현재 로고는 위의 2026-11-01 승인본, UI 색과 글꼴은 [DESIGN.md](../DESIGN.md)를 따른다. 당시 Chrome/sips 수동 내보내기 절차는 위의 단일 생성 명령으로 대체됐다.

### 2026-10-16 Evening, Refined 팔레트 (과거 기록)

- 기본 배경 `#FAF8F3`(Warm Paper), 본문·주 버튼 `#23302B`(Evening Ink), 보조면 `#EEEAE1`(Soft Cream), 선 `#D7DED8`(Quiet Line).
- 강조는 `#AC5147`(After Coral)을 로고 점·인용 경계·작은 선택 표시에 한정한다. 작은 강조 글자는 8% 잉크 틴트 위에서도 WCAG AA를 만족하는 `#A34A40`을 쓴다. 다크 강조는 `#E9A49B`(Soft Blush)다.
- 정보성 보조 글자에 `#526B75`(Dusk Slate)를 사용한다. 성공·경고·오류는 브랜드색과 구별되는 의미색을 유지한다.
- 주요 CTA는 여전히 잉크 채움이며 코럴 버튼으로 바꾸지 않는다. 바탕 70% · 잉크/그린 25% · 코럴 5%를 화면의 대략적인 면적 기준으로 삼는다.
- 실제 적용값은 [styles.css](../src/styles.css), 대비 회귀 검사는 `npm run check:contrast`가 단일 기준이다.

### 2026-10-16 UI 정돈 (과거 기록)

- 심벌과 앱 아이콘은 유지하고, 화면 헤더는 중복된 `a + after` 대신 코럴 점을 붙인 `after` 워드마크로 단순화했다.
- 바탕은 노란 크림에서 옅은 오프화이트로, 카드는 흰색으로 정리했다. 잉크색 주 버튼과 작은 코럴 강조는 유지한다.
- 제목·이름·본문은 Pretendard, 한 줄 소개의 인용만 Gowun Batang을 쓴다. 새 화면에서 명조를 제목에 다시 확대하지 않는다.
- `/brand/after-hours.jpg`는 기존 캠페인의 AI 생성 카페 장면을 웹용으로 최적화한 장식 이미지다. 실제 제휴 장소나 회원의 만남 사진으로 설명하지 않는다.
- Emil Kowalski의 `emil-design-eng`, `apple-design`, `mobile-native` 원칙을 적용했다. 눌림은 140ms, 가입 진행률은 transform 200ms, 모션 줄이기 설정을 존중한다. 실물 iOS/Android의 키보드·터치 감각은 별도로 확인한다.

아래 문단은 2026-10-16 당시의 아이콘 제작 기준이다. 현재 제작에는 적용하지 않는다.

당시 기준은 위 팔레트와 [리브랜딩 설계안](after-rebrand-plan.md)이다. 2026-10-11에 만든 `a` 심벌 형태와 점 크기(r 3.4)는 유지하되 점 색을 2026-10-16 팔레트로 정리했다. 어두운 아이콘의 점은 Soft Blush `#E9A49B`, 밝은 화면의 점은 After Coral `#AC5147`이다. 배경 잉크 `#23302B`, 글자 Warm Paper `#FAF8F3`. 워드마크·심벌 SVG가 원본이며, 화면 마크는 [Logo.tsx](../src/components/Logo.tsx), 웹 아이콘은 [favicon.svg](../public/favicon.svg), iOS 아이콘은 [app-icon-ios.svg](../brand/app-icon-ios.svg), 실행 화면은 [splash.svg](../brand/splash.svg)에서 관리한다.
