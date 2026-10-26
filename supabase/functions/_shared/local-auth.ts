/** Never use Origin/Host or a substring match to decide whether bypass is safe. */
export function localAuthBypassAllowed(flag: string | undefined, backend: string | undefined) {
  if (flag !== "true" || !backend) return false;
  try {
    const url = new URL(backend);
    return (
      url.protocol === "http:" &&
      !url.username &&
      !url.password &&
      ["kong", "127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
