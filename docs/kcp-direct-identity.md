# NHN KCP 휴대폰 본인확인 직접 연동

가입 전 약관에 동의한 사람과 로그인한 기존 회원 모두 같은 KCP V2 인증창을 사용한다. 결제는 기존 토스 경로를 사용한다. 운영 웹 전환 전에는 기존 문자 인증으로 가입한다.

1. KCP 파트너관리자에서 휴대폰 본인확인 V2를 사용으로 설정한다. 인증결과 URL 도메인은 `tsytwxtuczceyojkiaty.supabase.co`다. 실제 복귀 주소는 `/functions/v1/kcp-identity-return`이며 주문별 식별자와 가입·회원 구분을 쿼리에 붙인다.
2. 운영 Supabase Edge Secrets에 `KCP_SITE_CODE`(본인확인용 사이트코드)와 `KCP_ENC_KEY`(가맹점 인증키)를 입력한다. 서버 코드·마이그레이션·콜백 배포 후 `CARRIER_IDENTITY_PROVIDER=kcp_direct`로 선택한다. KCP 테스트 가맹점과 테스트 모드는 운영에서 거절된다. 키는 프런트엔드에 등록하지 않는다.
3. 한 명의 LIVE 실기기 검증은 운영 도메인의 `/kcp-preview`에서 진행한다. Edge Secret `KCP_DEVICE_TESTER_EMAIL`에 지정한 주소로만 실제 이메일 코드를 보낸다. 이메일 확인·약관 동의 후 가입용 KCP 창을 열며 결과는 임시 가입 세션에 기록한다. 기존 회원 프로필을 수정하거나 신규 프로필을 만들지 않는다. 미리보기 로그인은 탭 단위로 일반 로그인과 분리된다. 테스트를 닫으려면 허용 이메일을 해제한다. 전환 승인 후에만 서버의 `KCP_LIVE_ACCESS=public`과 웹 빌드 변수 `CARRIER_IDENTITY_ENABLED=true`를 적용한다. 공개 전환 시 Supabase Auth의 Phone 로그인을 활성화하고 Send SMS hook으로 `public.deny_auth_sms`를 선택한 뒤 전화번호 확인을 필수로 둔다. 기존 회원의 재인증을 확인한 후 DB의 `identity_required=true`와 웹을 함께 전환한다. 공개 전환 전에는 새 휴대폰 계정을 발급하지 않는다.
4. 공개 가입은 약관 동의와 KCP 성인 확인을 거친다. 카카오 회원은 로그인한 계정에 연결하고, 일반 회원은 KCP에서 확인된 휴대폰 번호에 비밀번호를 설정한다. 이메일 코드 없이 프로필을 준비한다. 기존 이메일 회원의 로그인과 복구는 유지한다.
5. Edge는 짧은 유효시간의 등록키를 주문과 묶는다. 콜백의 주문과 키를 대조하고, 원래 가입 세션 또는 회원으로만 KCP 서버 결과를 조회한다. 최종 응답에서 성별·생년월일·전화번호·DI만 기존 완료 함수로 전달한다. 브라우저의 성공 표시만으로 가입이 인증되지는 않는다.

개발용 KCP 테스트는 loopback Supabase에서만 `KCP_TEST_MODE=true`, `KCP_TEST_RETURN_ORIGIN`(KCP가 접근 가능한 HTTPS 로컬 터널), `KCP_TEST_APP_ORIGIN`(처음 진입한 웹 origin)을 설정한다. 로그인·세션 복원에는 같은 브라우저 탭과 origin이 필요하다.

## 공식 Node.js 샘플과의 대조

2026-11-28에 운영 버전 `3a421ceda208`의 Edge 구현과 NHN KCP가 제공한 Node.js V2 샘플 `utils/Crypto.js`(SHA-256 앞 12자리 `cb13ecba5893`)를 대조했다. 로컬에서 임의로 만든 키와 합성 데이터만 사용했다.

| 검증 | 결과 |
| --- | --- |
| 가입·기존 회원 거래등록 | 애프터의 실제 요청 본문을 공식 `decryptJson`으로 복호화해 사이트코드, 주문번호, 복귀 주소와 부가값을 대조했다. |
| 인증 결과 조회 | 공식 `encryptJson`으로 만든 남녀 응답을 애프터의 결과조회 함수가 읽었다. 성별·생년월일·전화번호·DI가 기대값과 일치했고, 다른 키로 만든 복호화 시도는 거절됐다. |
| 암호문 형식 | 한글·이모지를 포함한 48가지 길이의 JSON에 같은 키와 난수를 사용했을 때 암호문 바이트가 모두 일치했다. |
| 모바일 브라우저 | Chromium과 WebKit에서 합성 인증창으로 폼을 POST한 뒤 가입·기존 회원 모두 시작한 탭으로 복귀했다. |

운영 서버는 Web Crypto를 사용한다. 위 결과는 제공 모듈과의 기술적 호환성을 확인한 기록이다. KCP 테스트 서버에서 거래등록과 통신사 선택 화면을 확인했고, **운영 계약으로 실휴대폰 인증을 끝내고 서버가 결과를 조회해 가입을 재개하는 단계는 미검증**이다. 일반 가입을 전환하기 전, 제한된 미리보기에서 취소와 성공을 각각 확인한다.

[거래등록](https://developer.kcp.co.kr/reference/cert-regist) · [결과조회](https://developer.kcp.co.kr/reference/cert-result) · [본인확인 V2 가이드](https://developer.kcp.co.kr/guide/cert)
