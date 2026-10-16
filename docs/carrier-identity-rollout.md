# 통신사 본인·성인 확인 전환 (KCP + 포트원 V2)

2026-10-16 기준 **코드는 준비, 운영 인증은 미개시**다. KCP 계약/채널/실인증 결과가 없고 `VITE_CARRIER_IDENTITY_ENABLED`와 DB의 `app_settings.identity_required`는 기본적으로 꺼져 있다. 지금의 자체 문자 OTP는 성인 본인확인 증빙이 아니다.

## 대표가 먼저 해야 할 일

1. 포트원 V2 계정에서 **KCP 휴대폰 본인확인** 서비스 계약·채널을 신청한다. 포트원은 결제창을 대체하는 것이 아니라 통신사 본인확인 연결에만 쓴다. KCP에서 인증 결과 URL `checkout-service.prod.iamport.co`와 **신규 연동방식(V2)** 사용을 설정한다. [KCP 연동 안내](https://developers.portone.io/opi/ko/integration/pg/v2/kcp-v2-identity-verification?v=v2)
2. 발급받은 `PORTONE_STORE_ID`, `PORTONE_KCP_IDENTITY_CHANNEL_KEY`, `PORTONE_API_SECRET`을 **Supabase Edge Functions secrets**에 저장한다. 저장소/메신저에 원문을 올리지 않는다. 채널은 **LIVE 타입의 KCP 휴대폰 본인확인 전용**으로 사용하고, 계약 결과에서 `birthDate`, `phoneNumber`, `di`가 실제로 제공되는지 확인한다. TEST 채널 결과는 운영 서버에서 거절한다. [포트원 결과 필드](https://developers.portone.io/opi/ko/extra/identity-verification/readme-v2)
3. 개인정보 처리방침에 본인확인 대행사, 처리 항목(검증 생년월일·번호·DI의 해시), 보유/파기 및 위탁 사항을 검토·반영한다. 실제 법률 문구와 동의 범위는 대표/전문가가 확인한다.

## 기술 롤아웃 순서

1. `20261016130000_s58_carrier_identity.sql`을 적용하고 `carrier-identity` Edge Function을 배포한다. 시크릿 미설정이면 함수는 503으로 실패한다. 배포만으로 기존 가입 흐름은 바뀌지 않는다.
2. 스테이징/실계약 테스트 계정으로 **실제 KCP 인증창**을 열어 성인, 미성년, 취소, 중복 DI/번호, 리다이렉트, 기존 회원 재인증을 확인한다. 서버는 브라우저의 성공 신호만 믿지 않고 PortOne API에서 `VERIFIED`와 검증된 고객 정보를 조회한다. 인증 ID는 서버가 사용자에게 발급하고 15분 동안 한 번만 쓴다.
3. 웹 빌드에 `VITE_CARRIER_IDENTITY_ENABLED=true`를 넣어 배포한다. 가입의 문자 OTP 화면이 본인·성인 확인으로 바뀌고, 기존 회원은 `/verify-phone`에서 재확인한다. **현재 네이티브 앱 웹뷰에는 아직 이 경로를 열지 않는다.** 앱 심사/배포 전에 외부 브라우저↔앱 복귀 흐름을 별도 구현·검증해야 한다.
4. 기존 회원이 인증할 수 있음을 확인한 뒤에만 `app_settings.identity_required=true`를 운영 DB에서 켠다. 이때 미인증자의 새 소개·평가·티켓 주문·만남·메시지는 DB 트리거에서 막힌다. 활성 주문이나 이미 열린 약속의 전환 정책은 운영자가 사전에 정해야 한다. 장애 시 이 값을 `false`로 되돌릴 수 있지만, 그러면 성인 확인 게이트가 풀리므로 심사·유료 출시 상태를 함께 중단한다.
5. 인증창, 완료 화면, 미성년 거절, 고객상담, 결제·사용 내역을 실제 화면으로 캡처해 토스 결제경로 PPT를 다시 만든다. 공급자 계약과 실인증 없이 합성 화면을 제출하지 않는다.

## 보안·품질 기준

- `finish_carrier_identity`는 service role 전용이며 본인과 결부된 인증 시도만 완료한다. 원본 DI는 저장하지 않고 SHA-256 해시를 비공개 테이블에 보관해 중복가입을 막는다. 탈퇴 시 해시·인증 메타데이터·번호를 파기한다.
- KCP에서 필수 필드가 빠졌거나 PortOne 조회가 실패하면 인증되지 않는다. 조회된 인증 ID, 설정한 채널 키, LIVE 타입이 모두 일치해야 한다. 화면이 직접 생년월일/인증 시각을 설정할 수 없다.
- `identity_required=false` 상태는 **출시 준비 상태가 아니다.** 기존 문자 OTP와 자가 입력 생년월일이 계속 유효하다. 토스 심사 제출 또는 유료 출시 전에 운영 플래그와 실제 인증 기록을 확인한다.
