// Aliased only by the standalone loopback Vite launcher. Never imported by product builds.
import { supabase } from "../../src/lib/supabase.ts";

export async function loadTossPayments(key) {
  if (
    !import.meta.env.DEV ||
    location.origin !== "http://127.0.0.1:5191" ||
    key !== "local_manual_mock"
  )
    throw Error("Local mock unavailable");
  return {
    widgets: () => {
      let amount = 0;
      return {
        setAmount: async (value) => {
          if (value.currency !== "KRW" || !Number.isSafeInteger(value.value) || value.value <= 0)
            throw Error("Invalid mock amount");
          amount = value.value;
        },
        renderPaymentMethods: async ({ selector }) => {
          const host = document.querySelector(selector);
          const label = document.createElement("p");
          label.textContent = "로컬 모의 카드 · 실제 카드 정보/청구 없음";
          label.className = "rounded-control bg-muted p-4 text-sm";
          host.replaceChildren(label);
          return { destroy: async () => label.remove() };
        },
        renderAgreement: async ({ selector }) => {
          const host = document.querySelector(selector);
          const label = document.createElement("p");
          label.textContent = "모의 결제입니다. 실제 Toss 결제창이나 API에 연결하지 않습니다.";
          label.className = "text-sm leading-relaxed text-muted-foreground";
          host.replaceChildren(label);
          return { destroy: async () => label.remove() };
        },
        requestPayment: async (options) => {
          const success = new URL(options.successUrl),
            fail = new URL(options.failUrl);
          if (
            success.origin !== location.origin ||
            success.pathname !== "/payment/success" ||
            fail.origin !== location.origin ||
            fail.pathname !== "/payment/fail"
          )
            throw Error("Invalid mock return URL");
          const accepted = await new Promise((resolve) => {
            const dialog = document.createElement("dialog");
            dialog.className =
              "m-auto w-[calc(100%_-_2.5rem)] max-w-sm rounded-surface bg-card p-5 text-foreground shadow-xl backdrop:bg-black/40";
            Object.assign(dialog.style, {
              margin: "auto",
              inset: "0",
              maxHeight: "calc(100dvh - 2.5rem)",
              overflowY: "auto",
            });
            dialog.setAttribute("aria-labelledby", "local-payment-title");
            const title = document.createElement("h2");
            title.id = "local-payment-title";
            title.className = "text-xl font-semibold";
            title.textContent = "모의 결제 확인";
            const info = document.createElement("p");
            info.className = "mt-3 text-sm leading-relaxed";
            info.textContent = `${options.orderName} · ${amount.toLocaleString("ko-KR")}원. 실제 청구 없이 이 테스트 계정에만 티켓이 발급돼요.`;
            const cancel = document.createElement("button");
            cancel.className = "mt-5 min-h-11 w-full rounded-control bg-muted px-4 font-semibold";
            cancel.textContent = "모의 결제 취소";
            const approve = document.createElement("button");
            approve.className =
              "mt-2 min-h-11 w-full rounded-control bg-primary px-4 font-semibold text-primary-foreground";
            approve.textContent = "청구 없이 모의 결제 승인";
            const finish = (value) => {
              dialog.close();
              dialog.remove();
              resolve(value);
            };
            cancel.onclick = () => finish(false);
            approve.onclick = () => finish(true);
            dialog.addEventListener("cancel", (event) => {
              event.preventDefault();
              finish(false);
            });
            dialog.append(title, info, cancel, approve);
            document.body.append(dialog);
            dialog.showModal();
            cancel.focus();
          });
          if (!accepted) {
            fail.searchParams.set("code", "USER_CANCEL");
            location.assign(fail.href);
            return;
          }
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const response = await fetch("/__lab/payment/authorize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token ?? ""}`,
            },
            body: JSON.stringify({ orderId: options.orderId, amount }),
          });
          const receipt = await response.json();
          if (!response.ok) throw Error("Mock authorization refused");
          success.searchParams.set("orderId", options.orderId);
          success.searchParams.set("amount", String(amount));
          success.searchParams.set("paymentKey", receipt.paymentKey);
          location.assign(success.href);
        },
      };
    },
  };
}
