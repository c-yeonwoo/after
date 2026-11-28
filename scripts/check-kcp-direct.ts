import assert from "node:assert/strict";
import {
  kcpAppOrigin,
  kcpConfig,
  registerKcp,
  queryKcp,
  encryptKcp,
} from "../supabase/functions/_shared/kcp-direct";
import { handleKcpReturn } from "../supabase/functions/_shared/kcp-return";

const vars: Record<string, string> = {
  SUPABASE_URL: "https://project.supabase.co",
  KCP_SITE_CODE: "Z9999",
  KCP_ENC_KEY: "synthetic-key",
};
const config = kcpConfig((k) => vars[k]);
const id = "av" + "a".repeat(32);
for (const override of [
  { KCP_SITE_CODE: "AO7F3" },
  { KCP_TEST_MODE: "true" },
  { KCP_ENC_KEY: "" },
  { SUPABASE_URL: "" },
]) {
  const changed = { ...vars, ...override };
  assert.throws(() => kcpConfig((k) => changed[k]), /not configured/);
}
const allowed = (name: string) =>
  name === "KCP_PREVIEW_APP_ORIGIN" ? "https://kcp-qa.aftersunset.kr" : undefined;
for (const origin of [
  "https://www.aftersunset.kr",
  "https://aftersunset.kr",
  "https://kcp-qa.aftersunset.kr",
]) {
  assert.equal(kcpAppOrigin(config, origin, allowed), origin);
}
assert.throws(() => kcpAppOrigin(config, "https://elsewhere.example", allowed));
assert.throws(() => kcpAppOrigin(config, "https://kcp-qa.aftersunset.kr", () => undefined));
const salt = Uint8Array.from(Buffer.from("00112233445566778899aabbccddeeff", "hex"));
const vector = await encryptKcp({ ordr_idxx: "av1", message: "테스트" }, config, salt);
assert.equal(vector.encData, "HliaRb4NEk0zWJHrlF54lholBVyInWJ8G6ZEWoFIyen3kmPerSgeeRI2bkchx2iZ");
const reg = {
  res_cd: "0000",
  call_url: "https://cert.kcp.co.kr/hosted",
  reg_cert_key: "synthetic-key",
};
const launch = await registerKcp(config, id, "signup", async (url, opt) => {
  assert.equal(url, "https://cert.kcp.co.kr/api/reg/certDataReg.do");
  assert.equal(opt?.redirect, "error");
  assert.ok(new Headers(opt?.headers).get("rv"));
  assert.ok(!String(opt?.body).includes(id));
  return Response.json(reg);
});
assert.equal(launch.callUrl, reg.call_url);
await assert.rejects(
  registerKcp(config, id, "member", async () =>
    Response.json({ ...reg, call_url: "https://example.org/" }),
  ),
);
const customer = {
  res_cd: "0000",
  phone_no: "01012345678",
  birth_day: "19940215",
  sex_code: "02",
  DI: "di-one",
  CI: "unused",
  user_name: "unused",
};
async function result(input: unknown) {
  const data = await encryptKcp(input, config);
  return queryKcp(config, id, reg.reg_cert_key, async (url, opt) => {
    assert.equal(url, "https://cert.kcp.co.kr/api/query/getCertData.do");
    assert.equal(new Headers(opt?.headers).get("rv"), null);
    assert.deepEqual(JSON.parse(String(opt?.body)), {
      ordr_idxx: id,
      reg_cert_key: reg.reg_cert_key,
    });
    return Response.json({ res_cd: "0000", enc_cert_data: data.encData, rv: data.rv });
  });
}
assert.deepEqual(await result(customer), {
  birth: "1994-02-15",
  phone: "+821012345678",
  gender: "female",
  di: "di-one",
});
assert.equal((await result({ ...customer, sex_code: "01" })).gender, "male");
for (const invalid of [
  { res_cd: "CANCEL" },
  { DI: "" },
  { sex_code: "00" },
  { birth_day: "not-a-date" },
  { birth_day: "20230231" },
  { phone_no: "bad" },
])
  await assert.rejects(result({ ...customer, ...invalid }));
const body = { res_cd: "0000", reg_cert_key: reg.reg_cert_key, param_opt_1: id };
let accepts = 0;
async function back(
  fields: Record<string, string>,
  flow = "signup",
  appOrigin = "https://aftersunset.kr",
  preview = false,
) {
  const req = new Request(
    config.callback + "?flow=" + flow + "&id=" + id + (preview ? "&preview=1" : ""),
    {
      method: "POST",
      body: new URLSearchParams(fields),
    },
  );
  return handleKcpReturn(req, async (order, kind, key) => {
    if (key) accepts++;
    return { appOrigin, accepted: id === order && kind === flow && key === reg.reg_cert_key };
  });
}
for (const flow of ["signup", "member"]) {
  const resp = await back(body, flow);
  assert.equal(resp.status, 303);
  assert.equal(
    resp.headers.get("location"),
    "https://aftersunset.kr/" +
      (flow === "signup" ? "signup" : "verify-phone") +
      "?identityVerificationId=" +
      id,
  );
}
for (const result of [body, { ...body, res_cd: "cancel" }]) {
  const returned = new URL(
    (await back(result, "signup", "https://aftersunset.kr", true)).headers.get("location")!,
  );
  assert.equal(returned.pathname, "/kcp-preview");
  assert.equal(returned.searchParams.has("code"), result.res_cd !== "0000");
}
for (const changes of [{ res_cd: "cancel" }, { reg_cert_key: "" }, { param_opt_1: "other" }]) {
  const before = accepts;
  assert.match((await back({ ...body, ...changes })).headers.get("location")!, /code=NOT_VERIFIED/);
  assert.equal(accepts, before);
}
assert.match(
  (await back({ ...body, reg_cert_key: "unknown" })).headers.get("location")!,
  /code=NOT_VERIFIED/,
);
assert.equal((await back(body, "unknown")).status, 400);
assert.match(
  (await back(body, "signup", "https://www.aftersunset.kr")).headers.get("location")!,
  /^https:\/\/www\.aftersunset\.kr\/signup/,
);
assert.equal((await back({ ...body, junk: "a".repeat(9000) })).status, 413);
console.log(
  "KCP direct: registration, cipher vector, verified fields and owner-bound callback contract pass",
);
