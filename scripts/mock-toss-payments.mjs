/** Local HTTP stand-in for the documented Toss confirm and cancel contract. */
import { createServer } from "node:http";

const payments = new Map();
const port = Number(process.env.MOCK_TOSS_PORT ?? 8899);

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  let body = {};
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += String(chunk);
    }
    if (raw) body = JSON.parse(raw);
  } catch {
    send(res, 400, { code: "INVALID_REQUEST", message: "invalid JSON" });
    return;
  }

  if (req.method === "POST" && req.url === "/v1/payments/confirm") {
    const { orderId, paymentKey, amount } = body;
    if (!orderId || !paymentKey || !Number.isInteger(amount) || amount <= 0) {
      send(res, 400, { code: "INVALID_REQUEST", message: "invalid order" });
      return;
    }
    const existing = payments.get(paymentKey);
    if (existing && (existing.orderId !== orderId || existing.totalAmount !== amount)) {
      send(res, 400, { code: "ALREADY_PROCESSED_PAYMENT", message: "mismatch" });
      return;
    }
    const payment = existing ?? {
      orderId,
      paymentKey,
      totalAmount: amount,
      balanceAmount: amount,
      method: "카드",
      status: "DONE",
    };
    payments.set(paymentKey, payment);
    send(res, 200, payment);
    return;
  }

  const match = req.url?.match(/^\/v1\/payments\/([^/]+)(\/cancel)?$/);
  if (match) {
    const payment = payments.get(decodeURIComponent(match[1]));
    if (!payment) {
      send(res, 404, { code: "NOT_FOUND_PAYMENT", message: "not found" });
      return;
    }
    if (req.method === "POST" && match[2] === "/cancel") {
      payment.status = "CANCELED";
      payment.balanceAmount = 0;
      payment.cancels = [{ cancelReason: body.cancelReason, cancelAmount: payment.totalAmount }];
      send(res, 200, payment);
      return;
    }
    if (req.method === "GET" && !match[2]) {
      send(res, 200, payment);
      return;
    }
  }
  send(res, 404, { code: "NOT_FOUND", message: "not found" });
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(`Mock Toss listening on ${port}\n`);
});
