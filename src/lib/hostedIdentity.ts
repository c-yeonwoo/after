import { assertPortoneIdentityResult } from "./portoneIdentityResult";

export type IdentityLaunch =
  | {
      identityVerificationId: string;
      provider: "kcp_direct";
      callUrl: string;
      registrationKey: string;
    }
  | { identityVerificationId: string; provider?: undefined; storeId: string; channelKey: string };

export async function launchHostedIdentity(
  start: IdentityLaunch,
  returnPath: "/signup" | "/verify-phone",
  onCancel: () => void,
) {
  if (start.provider === "kcp_direct") {
    const url = new URL(start.callUrl);
    const allowedOrigins = import.meta.env.DEV
      ? ["https://cert.kcp.co.kr", "https://testcert.kcp.co.kr"]
      : ["https://cert.kcp.co.kr"];
    if (!allowedOrigins.includes(url.origin) || url.username || url.password)
      throw Error("not verified");
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url.href;
    form.hidden = true;
    for (const [name, value] of Object.entries({
      reg_cert_key: start.registrationKey,
      kcp_page_submit_yn: "Y",
    })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
    // Mobile engines can cancel a queued navigation if the form is detached here.
    // Keep pending proof until the same tab returns from the hosted form.
    throw Error("verification redirecting");
  }
  const sdk = await import("@portone/browser-sdk/v2");
  const result = await sdk.requestIdentityVerification({
    identityVerificationId: start.identityVerificationId,
    storeId: start.storeId,
    channelKey: start.channelKey,
    redirectUrl: window.location.origin + returnPath,
  });
  if (result?.code !== undefined) onCancel();
  assertPortoneIdentityResult(start.identityVerificationId, result);
}
