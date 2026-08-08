import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor — 웹 자산을 네이티브 앱에 번들한다.
 *
 * webDir 이 `npm run build:app` 의 산출물(dist/client)이다. `npm run build` 쪽
 * (.output/, Nitro·Cloudflare)은 SSR 전용이라 진입점 HTML 이 없어서 여기 못 쓴다.
 *
 * server.url 을 쓰지 않는다 — 원격 URL 을 WebView 로 띄우면 앱이 사실상 웹뷰
 * 껍데기가 되어 App Store 심사 4.2(최소 기능)에 걸릴 위험이 크고, 네트워크가
 * 없으면 첫 화면조차 안 뜬다.
 *
 * appId 는 보유 도메인(aftersunset.kr)의 역순 표기다. **App Store 에 한 번
 * 제출하면 바꿀 수 없다** — 반면 appName(스토어 표시명)은 버전마다 수정할 수
 * 있어서, 이름이 나중에 흔들려도 여기가 발목을 잡지 않는다.
 */
const config: CapacitorConfig = {
  appId: "kr.aftersunset.app",
  appName: "애프터",
  webDir: "dist/client",

  ios: {
    // 웹 쪽에서 env(safe-area-inset-*) 로 노치·홈 인디케이터를 직접 다루고
    // 있다(styles.css 의 --safe-top / --safe-bottom). Capacitor 가 컨테이너를
    // 한 번 더 밀어내면 여백이 두 번 들어가므로 인셋을 끈다.
    contentInset: "never",

    // WebView 의 UIScrollView 를 끈다.
    //
    // 키보드가 올라올 때 UIKit 은 포커스된 입력창을 보이게 하려고 **웹뷰를 감싼
    // 스크롤뷰를 직접 스크롤한다.** 이건 CSS 바깥의 동작이라 html/body 에
    // overflow:hidden 을 줘도 막히지 않았다 — 실제로 그것만으로는 채팅 헤더가
    // 여전히 68pt 밀려 올라가 상태바와 겹쳤다(실측).
    //
    // 스크롤은 이미 각 화면의 본문(overflow-y-auto)이 맡고 있어서 바깥
    // 스크롤뷰가 할 일이 없다. 꺼도 내부 스크롤은 그대로 동작한다.
    scrollEnabled: false,
  },

  plugins: {
    Keyboard: {
      /*
        키보드가 올라와도 **웹뷰 크기를 건드리지 않는다.**

        기본값(native)은 키보드 높이만큼 웹뷰 프레임을 줄이는데, 그 과정에서
        레이아웃이 통째로 위로 밀려 채팅 헤더가 상태바와 겹쳤다(날짜 배너가
        114pt → 46pt, 안전영역 59pt 침범). CSS 로 문서 스크롤을 잠그고
        ios.scrollEnabled 까지 꺼도 그대로였다 — 웹뷰 바깥에서 벌어지는 일이라
        웹에서 막을 수가 없었다.

        none 으로 두면 키보드는 화면 위에 겹쳐 뜨기만 하고 레이아웃은 가만히
        있는다. 대신 가려지는 만큼은 앱이 직접 비켜 줘야 해서, 키보드 높이를
        --keyboard-height 로 받아 쓴다(src/lib/keyboard.ts).
      */
      resize: "none",
    },
  },
};

export default config;
