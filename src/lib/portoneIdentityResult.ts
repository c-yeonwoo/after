/** SDK completion is only a handoff; the server still verifies the identity. */
export function assertPortoneIdentityResult(
  expectedId: string,
  result: { identityVerificationId?: string; code?: string } | undefined,
) {
  // Redirect-mode SDK calls may have no in-page result. Keep the pending ID
  // so the same browser can finish verification when the provider returns.
  if (!result) throw new Error("verification redirecting");
  if (result.code !== undefined) throw new Error("not verified");
  if (result.identityVerificationId !== expectedId) throw new Error("verification result mismatch");
}
