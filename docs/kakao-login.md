# 카카오 로그인

코드는 다 붙어 있다. **켜려면 대시보드 설정 세 곳**이 필요하고, 그건 손으로 해야
한다(키를 다루는 일이라 여기서 대신 하지 않는다).

---

## 설계 — 왜 "가입 수단" 이 아닌가

이 서비스의 전제는 **회사 이메일로 확인한 직장**이다. 카카오로 계정을 만들 수
있게 하면 그 관문이 무의미해진다. 그래서 카카오는 **이미 있는 계정에 붙이는
재로그인 수단**으로만 쓴다.

```
가입      회사 메일 인증 (필수, 한 번)  →  비밀번호 설정
그 다음   비밀번호  ·  카카오  ·  코드(잊었을 때)
```

- 연결은 **환경설정 → 카카오 → 연결하기**.
- 연결하지 않은 카카오로 로그인 화면에서 누르면, Supabase 가 그 카카오 이메일로
  새 auth 유저를 만든다. 프로필이 없으므로 `landAfterSignIn` 이 `no-profile` 을
  돌려주고, 화면이 **로그아웃시킨 뒤** 가입으로 보낸다.
- 자동 연결(이메일이 같고 검증된 경우)은 기대하지 않는다. 회사 메일과 카카오
  계정 메일이 같은 경우가 거의 없다.

---

## 켜는 순서

### 1. 카카오 개발자센터

<https://developers.kakao.com> → 내 애플리케이션 → 애플리케이션 추가

| 항목     | 값                      |
| -------- | ----------------------- |
| 앱 이름  | 이클립스                |
| 사업자명 | _(사업자 정보 확정 후)_ |

- **앱 키 → REST API 키**를 복사한다. 이게 Supabase 의 `client_id` 다.
  (JavaScript 키가 아니다 — 서버 사이드 OAuth 라 REST API 키를 쓴다.)
- **카카오 로그인 → 활성화 ON**
- **카카오 로그인 → Redirect URI** 에 **Supabase 의 콜백**을 넣는다:
  ```
  https://<project-ref>.supabase.co/auth/v1/callback
  ```
  ⚠️ 우리 앱 주소가 아니다. OAuth 는 카카오 → Supabase → 우리 앱 순서로 돈다.
- **동의항목**: 카카오계정(이메일)을 **필수 동의**로. 이메일이 없으면 Supabase 가
  유저를 만들지 못한다.
- **보안 → Client Secret** 을 발급했다면 그 값도 함께 복사한다(선택).

### 2. Supabase 대시보드

**Authentication → Providers → Kakao**

- Enable
- Client ID = REST API 키, Client Secret = 위에서 받은 값(없으면 비움)

**Authentication → URL Configuration → Redirect URLs** 에 세 줄을 추가한다:

```
https://eclps.kr/login
https://eclps.kr/settings
kr.eclps.app://auth/callback
```

마지막 줄이 없으면 **앱에서만** 조용히 실패한다 — 웹은 되는데 앱은 안 되는,
찾기 어려운 종류의 고장이다.

**Authentication → Advanced → Manual linking = ON**
꺼져 있으면 설정의 "카카오 연결하기" 가 `manual_linking_disabled` 로 거절된다.

> ⚠️ `supabase config push` 를 쓰지 말 것. `[auth]` 블록을 통째로 덮어써서
> 대시보드 SMTP 설정이 날아간다. 로컬용 값은 `supabase/config.toml` 에 있고
> 운영은 대시보드가 정본이다.

### 3. 확인

- 웹: `https://eclps.kr/settings` → 카카오 연결하기 → 돌아와서 "연결 끊기" 로
  라벨이 바뀌면 성공.
- 앱: 같은 흐름. 사파리 시트가 뜨고, 끝나면 **시트가 저절로 닫혀야** 한다.
  안 닫히면 `Info.plist` 의 `CFBundleURLSchemes` 와
  `src/lib/native.ts` 의 `NATIVE_REDIRECT` 가 어긋난 것이다.

---

## 코드 위치

| 무엇                           | 어디                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- |
| 인가 URL 생성 · 연결 · 해제    | `src/lib/api.ts` (`kakaoAuthorizeUrl` · `linkKakao` · `unlinkKakao`)      |
| 로그인 뒤 공통 판정            | `src/lib/api.ts` (`landAfterSignIn`) — **세 경로가 반드시 여기를 지난다** |
| 웹뷰 밖에서 열기 · 딥링크 수신 | `src/lib/native.ts`                                                       |
| 로그인 화면 버튼               | `src/routes/login.tsx`                                                    |
| 연결/해제 UI                   | `src/routes/settings.tsx`                                                 |
| 커스텀 스킴 등록               | `ios/App/App/Info.plist` (`CFBundleURLTypes`)                             |

세 곳이 같은 문자열을 공유한다 — `kr.eclps.app`. 바꿀 일이 생기면
`capacitor.config.ts`(appId) · `Info.plist` · `native.ts` 를 함께 고치고,
Supabase 리다이렉트 허용목록도 갱신한다.
