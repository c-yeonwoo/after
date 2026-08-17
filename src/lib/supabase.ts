import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다.");
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    /*
      PKCE 로 고정한다. supabase-js 의 기본값은 아직 implicit 인데, implicit 는
      액세스 토큰을 **URL 프래그먼트**에 실어 보낸다. 브라우저 히스토리·로그에
      토큰이 남고, 무엇보다 커스텀 스킴 딥링크에서 프래그먼트는 전달이 보장되지
      않는다. PKCE 는 쿼리로 짧은 code 만 오고, 교환에 verifier 가 필요하다.
    */
    flowType: "pkce",

    /*
      코드 교환을 **우리가** 한다(consumeAuthCode).

      자동 감지에 맡기면 웹과 네이티브의 경로가 갈린다 — 네이티브에서 콜백은
      문서 주소가 아니라 딥링크 이벤트로 오므로 `window.location` 을 훑는
      자동 감지가 아무 일도 못 하고, 결국 네이티브용 처리를 따로 써야 한다.
      그러면 로그인 성공 뒤의 판정(탈퇴·제명·미완료 가입)이 경로마다 갈라진다.
      끄고 한 곳에서 처리하면 두 플랫폼이 같은 코드를 지난다.

      매직링크를 쓰지 않으므로(코드 입력 방식) 이걸 꺼서 잃는 것은 없다.
    */
    detectSessionInUrl: false,
  },
});
