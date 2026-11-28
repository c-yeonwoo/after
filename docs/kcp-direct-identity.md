# NHN KCP 휴대폰 본인확인 직접 연동

가입 전 약관에 동의한 사람과 로그인한 기존 회원 모두 같은 KCP V2 인증창을 사용한다. 결제는 기존 토스 경로를 사용한다. 운영 웹 전환 전에는 기존 문자 인증으로 가입한다.

1. KCP 파트너관리자에서 휴대폰 본인확인 V2를 사용으로 설정한다. 인증결과 URL 도메인은 `tsytwxtuczceyojkiaty.supabase.co`다. 실제 복귀 주소는 `/functions/v1/kcp-identity-return`이며 주문별 식별자와 가입·회원 구분을 쿼리에 붙인다.
2. 운영 Supabase Edge Secrets에 `KCP_SITE_CODE`(본인확인용 사이트코드)와 `KCP_ENC_KEY`(가맹점 인증키)를 입력한다. 서버 코드·마이그레이션·콜백 배포 후 `CARRIER_IDENTITY_PROVIDER=kcp_direct`로 선택한다. KCP 테스트 가맹점과 테스트 모드는 운영에서 거절된다. 키는 프런트엔드에 등록하지 않는다.
3. 소수 실기기 검증에는 접근 제한이 있는 전용 애프터 미리보기 배포를 사용할 수 있다. 해당 빌드에만 `VITE_CARRIER_IDENTITY_ENABLED=true`를 적용하고, Edge의 `KCP_PREVIEW_APP_ORIGIN`에 그 배포의 정확한 HTTPS origin(예: `https://kcp-qa.aftersunset.kr`)을 지정한다. 미리보기 호스트의 접근 제한은 별도로 설정한다. 등록한 origin으로만 돌아오며, 운영 전체 전환까지 애프터 기본 웹 빌드는 기존 설정을 유지한다. 실기기에서 KCP 화면으로 이동, 취소, 성공 후 같은 브라우저로 복귀, 서버 결과조회·성인 확인, 가입 재개를 확인한다. 운영 웹에서 전체 가입을 전환할 때는 기존 GitHub Actions 변수 `CARRIER_IDENTITY_ENABLED=true`로 빌드한다. 미리보기 설정을 해제하고 기존 회원의 재인증 경로를 확인한 후 DB의 `identity_required` 전환을 별도로 결정한다.
4. Edge는 짧은 유효시간의 등록키를 주문과 묶는다. 콜백의 주문과 키를 대조하고, 원래 가입 세션 또는 회원으로만 KCP 서버 결과를 조회한다. 최종 응답에서 성별·생년월일·전화번호·DI만 기존 완료 함수로 전달한다. 브라우저의 성공 표시만으로 가입이 인증되지는 않는다.

개발용 KCP 테스트는 loopback Supabase에서만 `KCP_TEST_MODE=true`, `KCP_TEST_RETURN_ORIGIN`(KCP가 접근 가능한 HTTPS 로컬 터널), `KCP_TEST_APP_ORIGIN`(처음 진입한 웹 origin)을 설정한다. 로그인·세션 복원에는 같은 브라우저 탭과 origin이 필요하다.

KCP 배포 PDF는 제공 라이브러리의 `encryptJson`과 `decryptJson`을 안내한다. 현재 Edge는 같은 암호문 형식을 Web Crypto로 처리한다. 테스트 서버에서 거래등록을 확인했고, 결과 복호화는 합성 응답으로 검사했다. LIVE 개통 전에 KCP 제공 샘플 또는 담당자에게 이 런타임의 호환 구현 사용을 확인하고 실제 결과 복호화까지 검증한다.

[거래등록](https://developer.kcp.co.kr/reference/cert-regist) · [결과조회](https://developer.kcp.co.kr/reference/cert-result) · [본인확인 V2 가이드](https://developer.kcp.co.kr/guide/cert)
