# 앱스토어 스크린샷

**1320 × 2868** (6.9" — iPhone 17 Pro Max). App Store Connect 가 요구하는 기본
아이폰 크기이고, 이 한 벌만 올리면 더 작은 기기에는 자동으로 축소돼 쓰인다.

## 목록

| 파일                    | 화면           | 왜 넣는가                                                    |
| ----------------------- | -------------- | ------------------------------------------------------------ |
| `01-landing.png`        | 랜딩           | 브랜드 첫인상. "AFTER WORK MATCHING" 한 줄로 무엇인지 말한다 |
| `02-login.png`          | 로그인         | 비밀번호 · 카카오 · 코드 세 경로                             |
| `03-home-confirmed.png` | 홈 (만남 확정) | 이 앱이 최종적으로 만들어 주는 것                            |
| `04-intro-card.png`     | 소개 도착      | **한 번에 한 명**이라는 핵심 규칙이 보이는 화면              |
| `05-intro-profile.png`  | 소개 프로필    | 스와이프가 아니라 읽는 프로필                                |
| `06-chat.png`           | 대화           | 확정 후 열리는 조율 대화                                     |
| `07-me.png`             | 나             | 티켓 보유·만난 횟수                                          |
| `08-ticket-store.png`   | 티켓 상점      | 과금 구조를 숨기지 않는다 (베타는 무료 발급)                 |
| `09-home-dark.png`      | 홈 (다크)      | 다크 테마 지원                                               |
| `10-chat-dark.png`      | 대화 (다크)    | 저녁에 쓰는 앱이라는 톤                                      |
| `11-signup-gender.png`  | 가입 1/7       | 가입이 짧다는 것                                             |
| `12-signup-hub.png`     | 가입 2/7       | 권역제 — 지금 강남·역삼, 나머지는 준비 중                    |
| `13-signup-verify.png`  | 가입 3/7       | **회사 이메일 인증** — 이 서비스의 근거                      |

`_verify-*.png` 는 제출용이 아니라 점검 기록이다.

## 다시 뽑는 방법

```bash
# 1) 목데이터 (로컬 Supabase 가 떠 있어야 한다)
bun scripts/screenshot-seed.mjs

# 2) 로컬을 바라보는 앱 번들
#    ⚠️ `npm run build:app` 은 production 모드라 운영 DB 를 본다.
BUILD_TARGET=app npx vite build --mode development && npx cap sync ios

# 3) 상태바 고정 (9:41 · 풀배터리 · 신호 만땅)
xcrun simctl status_bar <UDID> override --time "9:41" \
  --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 \
  --batteryState discharging --batteryLevel 100

# 4) Xcode 로 빌드·설치 후 캡처
xcrun simctl io <UDID> screenshot brand/appstore/NN-이름.png
```

로그인은 `m1@verify.local`(연우). 시뮬레이터에 비밀번호를 심어 두려면:

```bash
curl -s -X PUT "http://127.0.0.1:55321/auth/v1/admin/users/<uid>" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"password":"<로컬 전용 비밀번호>"}'
```

### 시뮬레이터에서 `@` 입력이 안 될 때

`simctl` 텍스트 주입이 `@` 를 `2` 로 보낸다(shift 미적용). 붙여넣기로 우회한다 —
`xcrun simctl pbcopy <UDID>` 로 클립보드에 넣고, 입력칸을 길게 눌러 **Paste**.

## 사진에 대하여

프로필 사진은 **브랜드 색 그라디언트 + 이니셜 도안**이다(`screenshot-seed.mjs`
의 `avatarSvg`). 스톡 사진은 라이선스가 필요하고, 생성한 얼굴은 실제 사용자로
오인될 수 있어서 둘 다 피했다.

**실제 제출 전에는 판단이 필요하다.** 소개 서비스의 스토어 스크린샷에 사람
얼굴이 없으면 비어 보인다는 반론이 충분히 성립한다. 라이선스 있는 사진으로
바꾸려면 `avatarSvg` 대신 그 파일들을 업로드하면 되고, 나머지 절차는 같다.
