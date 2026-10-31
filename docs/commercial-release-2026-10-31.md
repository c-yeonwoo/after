# After · 상용 출시 마감

기준일: 2026-10-31. 코드 배포와 유료 서비스 개통을 별도로 판정한다.
이 문서는 [전체 기능 회귀](final-regression-2026-10-31.md)와
[기능·데이터 연결 점검](flow-data-audit-2026-10-31.md)의 후속이다.

## 코드로 해결한 배포 차단

- 기존 main의 Release gate에서 `npm audit --audit-level=moderate`가 실패했다.
  검사를 삭제하거나 기준을 낮추지 않았다.
- [minimatch 경고](https://github.com/advisories/GHSA-g3hv-75wg-m249)의
  공식 패치 11.0.1로 통일했다. 구형 ESLint의 ESM default import를 깨뜨리지
  않도록 ESLint 10·TypeScript-ESLint·Hooks 플러그인을 호환되는 버전으로 함께 갱신했다.
- 추가로 확인한 [glob 취소 경고](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)는
  Capacitor → rimraf의 glob만 공식 패치 14.0.2로 고정했다. Capacitor를 구버전으로
  내리거나 `npm audit fix --force`를 사용하지 않았다.
- 기존 Hooks 두 규칙과 심각도는 유지한다. 새 플러그인의 Compiler 전용 권고 규칙을
  일괄 도입하는 작업과 보안 패치를 섞지 않는다. ESLint 10의 기존 코드 지적 한 건은
  푸시 토큰의 불필요한 초기 대입 제거로 수정했다. 토큰 삭제 동작은 같다.
- `check:tooling`에 실제 TypeScript flat config의 Hooks 검사, CLI가 사용하는
  rimraf의 선택 삭제·보존, glob의 중단 후 탐색 중지 회귀를 추가했다.
  취소 회귀는 구버전에서 디렉터리 읽기 17회로 실패하고 패치에서 1회로 통과했다.

## 검증

| 항목 | 결과/범위 |
| --- | --- |
| 전체 npm audit | 경고 0개. 개발 의존성 포함, moderate 기준 유지 |
| 운영 의존성 | 버전 변경 없음. 기존 seroval 1.6.11 고정 유지 |
| Node 22 실제 실행 | 새 glob/ESLint, 기존 Capacitor/Xcode·seroval 검사 총 7개 통과 |
| 전체 `npm run check` | 독립 임시 설치에서 타입·린트·품질·권한 경계·대비·빌드 통과 |
| 기능 전체 회귀 | 직전 확정 버전의 DB 1,190 assertions·Chromium/WebKit 각 47개 전체 사이클·174개 합성 화면 등 통과. 상세는 연결 문서 참조 |
| GitHub CI·배포 | 이번 커밋의 실행과 실제 운영 `app-version`을 배포 후 기록. 로컬 성공으로 대신하지 않음 |

실행 근거: `/private/tmp/after-launch-glob-before.log`,
`/private/tmp/after-launch-tooling-check-final.log`,
`/private/tmp/after-launch-tooling-audit.json`.
임시 로그는 영구 보관을 보장하지 않는다. 새 회귀는 실제 회원·실제 결제·유료 모델을 사용하지 않는다.

## 남은 출시 조건과 순서

| 우선순위 | 항목 | 현재 상태 | 다음 완료 증거 |
| --- | --- | --- | --- |
| P0 | CI 및 웹·DB·Edge 배포 | 수정 후 배포 확인 대상 | 정확한 main의 quality/deploy 성공·운영 app-version 일치 |
| P0 | 대표 관리자 MFA·복구 | 인증앱 1개 등록은 대표 확인. 재로그인·복구 미확인 | 새 로그인 2단계 통과·예비 인증/복구 경로 직접 확인 |
| P0 · 유료 개통 전 | 통신사 성인/본인확인 | KCP 심사 중이라는 마지막 대표 회신 유지 | 키 설정·실제 인증 성공/취소·미성년/중복·콜백 재처리 확인 |
| P0 · 유료 개통 전 | Toss 결제 | 유지 결정. 실제 청구·취소 완료 증거 없음 | 계약 승인·운영 키·소액 결제/취소·티켓/내역/웹훅 멱등성 대조 |
| P0 · 유료 개통 전 | 약관·환불·AI 개인정보 검토 | 코드 고지와 권한 경계는 구현. 전문가 검토는 미확인 | 실제 계약·청약철회·국외 이전/위탁 고지 검토 결과 |
| P1 · 모집 확대 전 | 카카오 메시지 | 채널 생성 확인(애프터선셋). 템플릿·실수신 미확인 | 비즈니스/템플릿 승인·양측 실제 수신·중복 방지 확인 |
| P1 · 모집 확대 전 | 최신 화면 실기기·AI 만족도·48시간 운영 | 자동 회귀와 과거 대표 확인은 존재. 새 실관찰은 별도 | iOS/Android 1회 사이클·합성 라이브 AI/참가자 관찰·운영 큐 기록 |

코드 배포만으로 외부 계약을 완료할 수 없다. PG·인증·메시지·운영 비서 플래그는
개통 증거 없이 켜지 않는다. 무료/수동 POC와 유료 상용 서비스의 오픈 판정을
서로 바꾸어 표현하지 않는다. 외부 심사 기간은 개발 일정으로 확약하지 않는다.

회귀가 끝난 기능에 새 디자인/리팩토링을 추가하지 않는다. 지금부터는 배포 실패와
출시 차단 결함만 수정하고, 외부 승인 후 위 순서대로 실연동을 확인한다.
