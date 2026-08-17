import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    /*
      끈다. 이 앱에서 스크롤하는 것은 **문서가 아니라** 각 화면의 본문
      요소(AppScreen 의 <main>)다. 라우터의 복원은 window(또는
      data-scroll-restoration-id 를 붙인 요소)를 다루므로 우리 스크롤러에는
      닿지 않는다 — 얻는 것은 없고, 복원 타이밍이 우리 리셋과 겨루기만 했다.

      화면이 바뀌면 맨 위에서 시작한다(AppScreen). 네이티브 화면 전환이 그렇다.
    */
    scrollRestoration: false,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
