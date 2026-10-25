import assert from "node:assert/strict";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { marker, readManifest } from "./manual-cycle-fixtures.mjs";

export const manualOrigin = "http://127.0.0.1:5191";
export async function startManualServer(env, tag = "manual") {
  const manifest = readManifest(env, tag);
  assert.match(env.API_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
  const authorized = new Map();
  const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  // Process-local config only. No .env, shared Vite config or running 5190 server changes.
  Object.assign(process.env, {
    VITE_SUPABASE_URL: `${manualOrigin}/__lab/supabase`,
    VITE_SUPABASE_ANON_KEY: env.ANON_KEY,
    VITE_CARRIER_IDENTITY_ENABLED: "false",
    VITE_TOSS_CLIENT_KEY: "local_manual_mock",
  });
  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: resolve("vite.config.ts"),
    cacheDir: "node_modules/.vite-manual-cycle",
    resolve: {
      alias: [
        {
          find: /^@tosspayments\/tosspayments-sdk$/,
          replacement: resolve("scripts/lib/manual-toss-client.mjs"),
        },
      ],
    },
    optimizeDeps: { exclude: ["@tosspayments/tosspayments-sdk"] },
    server: {
      host: "127.0.0.1",
      port: 5191,
      strictPort: true,
      proxy: {
        // GoTrue rounds token iat to a second; the local PostgREST container can
        // reject that token as "issued at future" during the same second. Hold
        // only the local token response, not the request or any auth checks.
        "/__lab/supabase/auth/v1/token": {
          target: env.API_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__lab\/supabase/, ""),
          selfHandleResponse: true,
          configure(proxy) {
            proxy.on("proxyRes", async (upstream, _req, res) => {
              try {
                const chunks = [];
                for await (const chunk of upstream) chunks.push(chunk);
                const body = Buffer.concat(chunks);
                if (upstream.statusCode === 200) await delay(1100);
                if (res.destroyed || res.writableEnded) return;
                const headers = { ...upstream.headers, "cache-control": "no-store" };
                delete headers["transfer-encoding"];
                headers["content-length"] = String(body.length);
                res.writeHead(upstream.statusCode ?? 502, headers);
                res.end(body);
              } catch {
                if (!res.headersSent) send(res, 502, { error: "Local auth unavailable" });
                else res.end();
              }
            });
          },
        },
        "/__lab/supabase": {
          target: env.API_URL,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/__lab\/supabase/, ""),
        },
      },
    },
    plugins: [
      {
        name: "loopback-manual-payment-only",
        configureServer(vite) {
          // Registered before the proxy: only this function is replaced; all other
          // auth/RLS/RPC/storage calls reach the real LOCAL Supabase unchanged.
          vite.middlewares.use(async (req, res, next) => {
            const path = req.url?.split("?")[0];
            const approving = path === "/__lab/payment/authorize";
            const confirming = path === "/__lab/supabase/functions/v1/confirm-ticket-payment";
            const canceling = path === "/__lab/supabase/functions/v1/cancel-ticket-payment";
            // Reconciliation is intentionally unavailable here; never fall
            // through to an Edge function which could contact a real PG.
            if (path === "/__lab/supabase/functions/v1/reconcile-ticket-payment")
              return send(res, 409, { error: "Use the local mock checkout or order cancellation" });
            if (!approving && !confirming && !canceling) return next();
            if (req.method !== "POST") return send(res, 405, { error: "POST required" });
            if (req.headers.host !== "127.0.0.1:5191" || req.headers.origin !== manualOrigin)
              return send(res, 403, { error: "Loopback same-origin only" });
            try {
              let raw = "";
              for await (const chunk of req) {
                raw += chunk.toString();
                if (raw.length > 4096) return send(res, 413, { error: "Request too large" });
              }
              let body;
              try {
                body = JSON.parse(raw);
              } catch {
                return send(res, 400, { error: "Invalid JSON" });
              }
              const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
              if (!token) return send(res, 401, { error: "Sign in first" });
              const verified = await service.auth.getUser(token);
              const user = verified.data?.user;
              if (verified.error || !user) return send(res, 401, { error: "Invalid session" });
              if (
                user.id !== manifest.accounts.male.id ||
                user.app_metadata.manual_cycle !== marker ||
                user.app_metadata.manual_cycle_tag !== tag
              )
                return send(res, 403, { error: "Only this lab's synthetic male account can pay" });
              if (
                typeof body?.orderId !== "string" ||
                body.orderId.length > 100 ||
                (!canceling && (!Number.isSafeInteger(body.amount) || body.amount <= 0))
              )
                return send(res, 400, { error: "Invalid order" });
              const found = await service
                .from("ticket_orders")
                .select(
                  "order_id,user_id,amount,quantity,kind,payment_required,state,payment_key,payment_attention",
                )
                .eq("order_id", body.orderId)
                .maybeSingle();
              if (found.error) throw Error("Order lookup failed");
              const order = found.data;
              if (!order || order.user_id !== user.id)
                return send(res, 403, { error: "Not your order" });
              if ((!canceling && order.amount !== body.amount) || !order.payment_required)
                return send(res, 400, { error: "Amount or mode mismatch" });
              const paymentKey = `local_manual_${order.order_id}`;
              if (canceling) {
                if (order.payment_key !== paymentKey)
                  return send(res, 409, {
                    error: "Only an issued local mock order can be canceled",
                  });
                if (order.state === "canceled")
                  return send(res, 200, { canceled: true, mock: true, reused: true });
                const reserved = await service.rpc("reserve_paid_order_cancel", {
                  p_order_id: order.order_id,
                });
                if (reserved.error)
                  return send(res, 409, {
                    error: "Only a fully unused mock order can be canceled",
                  });
                const finalized = await service.rpc("finalize_paid_order_cancel", {
                  p_order_id: order.order_id,
                  p_reason: "LOCAL_MANUAL_MOCK: unused synthetic order cancellation",
                });
                if (finalized.error) throw Error("Local cancellation not finalized");
                authorized.delete(order.order_id);
                return send(res, 200, { canceled: true, mock: true });
              }
              if (approving) {
                if (order.state !== "pending" || order.payment_attention)
                  return send(res, 409, { error: "Order cannot be approved" });
                authorized.set(order.order_id, {
                  paymentKey,
                  amount: order.amount,
                  owner: user.id,
                });
                return send(res, 200, { paymentKey, mock: true });
              }
              if (body.paymentKey !== paymentKey)
                return send(res, 400, { error: "Mock key mismatch" });
              if (order.state === "confirmed" && order.payment_key === paymentKey)
                return send(res, 200, { confirmed: true, mock: true, reused: true });
              const receipt = authorized.get(order.order_id);
              if (
                order.state !== "pending" ||
                order.payment_attention ||
                !receipt ||
                receipt.owner !== user.id ||
                receipt.amount !== body.amount ||
                receipt.paymentKey !== body.paymentKey
              )
                return send(res, 409, { error: "Approve in the mock dialog first" });
              const result = await service.rpc("fulfill_paid_ticket_order", {
                p_order_id: order.order_id,
                p_payment_key: paymentKey,
                p_method: "LOCAL_MANUAL_MOCK",
              });
              if (result.error) throw Error("Local fulfillment refused");
              authorized.delete(order.order_id);
              return send(res, 200, { confirmed: true, mock: true });
            } catch {
              return send(res, 500, {
                error: "Local mock could not complete; check order before retrying",
              });
            }
          });
        },
      },
    ],
  });
  await server.listen();
  console.log(`Manual cycle ready: ${manualOrigin}/login (LOCAL MOCK / no real payment)`);
  return server;
}
