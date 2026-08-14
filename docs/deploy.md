# 배포

웹은 **Cloudflare Workers**, 앱은 Capacitor(iOS), DB·인증은 Supabase.

---

## 왜 Cloudflare 인가

고른 것이 아니라 **이미 그 길로 빌드되고 있었다.** `vite.config.ts` 가 웹 빌드에
`nitro({ preset: "cloudflare-module" })` 를 넣는다. Vercel 로 가려면 프리셋을 바꾸고
어댑터를 다시 검증해야 한다.

Supabase 는 **프런트엔드를 호스팅하지 않는다** — DB·인증·스토리지·Edge Functions 만
맡는다. 그래서 웹을 올릴 곳이 따로 필요하다.

---

## 한 번만 하는 준비

### 1. 네임서버를 Cloudflare 로 옮긴다

도메인은 가비아에서 산 그대로 두고 **DNS 만 Cloudflare 가 맡는다.** 등록기관과 DNS
호스팅은 별개라 도메인을 다시 살 필요가 없다.

1. Cloudflare 에서 `aftersunset.kr` 을 사이트로 추가 → 배정된 네임서버 2개를 받는다
   (`xxx.ns.cloudflare.com` 형태).
2. 가비아 → My가비아 → 도메인 → 해당 도메인 → **네임서버 변경**에 그 2개를 넣는다.
3. Cloudflare 가 확인하면 사이트 상태가 `Active` 가 된다.

`.kr` 은 보통 수십 분 안에 반영되지만 규격상 최대 48시간이다.

> **옮기기 전에 기존 DNS 레코드를 Cloudflare 에 먼저 넣어야 한다.** 네임서버가
> 바뀌는 순간 가비아의 레코드는 더 이상 쓰이지 않는다. 지금 이 도메인은 레코드가
> 비어 있어 잃을 것이 없지만(A·MX·TXT 모두 없음), 나중에 메일을 붙인 뒤 옮기면
> **메일이 끊긴다.**

### 2. 메일 DNS (Resend)

**IP 도 배포도 필요 없다.** SPF·DKIM 은 TXT 레코드일 뿐이다. 네임서버를 옮겼다면
Cloudflare DNS 에, 아직이라면 가비아에 넣는다.

| 타입 | 이름 | 값 |
|---|---|---|
| TXT | `@` | Resend 가 주는 SPF 문자열 |
| TXT | `resend._domainkey` | Resend 가 주는 공개키 |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

가비아는 이름 칸에 도메인을 다시 쓰면 `resend._domainkey.aftersunset.kr.aftersunset.kr`
이 된다 — **`resend._domainkey` 만** 넣는다.

Cloudflare DNS 에 넣을 때는 이 레코드들의 **프록시를 끈다**(회색 구름). TXT 는
프록시 대상이 아니라 자동으로 DNS-only 지만, MX 를 나중에 추가하면 주의한다.

### 3. Supabase 주소 설정

배포 주소가 정해진 뒤에 맞춘다. 이게 어긋나면 메일 링크가 로컬을 가리킨다.

| 위치 | 값 |
|---|---|
| Supabase → Authentication → URL Configuration → Site URL | `https://aftersunset.kr` |
| 같은 화면 → Redirect URLs | `https://aftersunset.kr/**` |
| Edge Functions 시크릿 → `APP_URL` | `https://aftersunset.kr` |
| Vault → `edge_function_base_url` | 프로젝트의 함수 기본 URL |
| Vault → `service_role_key` | 프로젝트 service_role 키 |

마지막 둘이 없으면 알림 아웃박스가 쌓이기만 한다(`drain_notification_outbox` 가
notice 를 남기고 건너뛴다).

---

## 배포

```bash
npm run deploy       # 빌드 + 업로드
npm run deploy:dry   # 업로드 없이 번들만 확인 (계정 없이도 된다)
npm run preview:cf   # 실제 workerd 런타임으로 로컬 실행
```

첫 배포는 `wrangler login` 을 한 번 요구한다.

### 커스텀 도메인 연결

첫 배포가 끝나고 **네임서버 이전이 완료된 뒤에**, `wrangler.jsonc` 의 `routes`
주석을 풀고 다시 배포한다.

```jsonc
"routes": [
  { "pattern": "aftersunset.kr", "custom_domain": true },
  { "pattern": "www.aftersunset.kr", "custom_domain": true }
]
```

`custom_domain: true` 면 wrangler 가 **DNS 레코드까지 만든다.** A 레코드를 손으로
넣을 일이 없고, 그래서 **IP 를 알 필요도 없다** — 요즘 호스팅은 IP 를 주지 않는다.

순서를 지켜야 한다. 이전이 끝나기 전에 이 블록을 켜면 wrangler 가 zone 을 못 찾아
배포가 실패한다.

---

## 알아 둘 것

### 런타임 시크릿이 없다

`VITE_*` 는 `vite.config.ts` 의 `envDefine` 이 **빌드 시점에 정적 치환**한다(서버
번들까지). 워커에 바인딩할 환경변수가 없다.

- anon 키는 공개값이다. RLS 가 실제 방어선이다.
- service_role 키는 프런트·SSR 어디에도 들어가지 않는다. Edge Functions 만 갖는다.
- **값을 바꾸려면 `.env.production.local` 을 고치고 다시 빌드해야 한다.**
  `wrangler secret` 으로는 바뀌지 않는다.

### 정적 자산은 워커를 거치지 않는다

`assets.directory` 가 `.output/public` 이라 Cloudflare 가 직접 낸다. 요금과 지연이
모두 줄어든다.

`.output/public` 에 **`index.html` 이 없어야 한다.** 있으면 그 파일이 `/` 를 가로채
SSR 이 안 돌아가고, 랜딩의 SEO 를 잃는다(랜딩은 로그인 전 화면이라 서버가 그려야
한다). 지금은 없다 — 앱 빌드(`build:app`)만 SPA 셸로 `index.html` 을 만들고 그건
`dist/client` 로 나간다.

### 앱 빌드와 섞이지 않는다

| | 명령 | 산출물 | 타깃 |
|---|---|---|---|
| 웹 | `npm run build` | `.output/` | Cloudflare Workers (SSR) |
| 앱 | `npm run build:app` | `dist/client` | Capacitor iOS (SPA) |

앱 번들에는 어드민이 들어가지 않는다(`vite.config.ts` 가 `^admin\.` 라우트를
제외한다). 웹에는 들어간다 — 운영자는 웹으로만 접속한다.

> ⚠️ `npm run build:app` 은 production 모드라 **운영 Supabase** 를 가리킨다. 로컬
> 데이터로 앱을 확인하려면 `BUILD_TARGET=app npx vite build --mode development`.

---

## 검증된 것 (2026-08-14)

`npm run deploy:dry` + `wrangler dev` 로 실제 workerd 런타임에서 확인했다.

- 번들 103 모듈 / 2.4 MiB, **gzip 528 KiB** — Workers 한도 안에 넉넉히 든다
- `/` 가 SSR 로 응답하고 `<title>` 과 랜딩 본문이 HTML 에 들어 있다
- 정적 자산 200, `_headers` 의 `immutable` 캐시 규칙이 적용된다
- `ASSETS` 바인딩 정상

아직 안 한 것: 실제 업로드(계정 필요), 커스텀 도메인 연결(네임서버 이전 필요).
