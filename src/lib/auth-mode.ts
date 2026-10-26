/** Explicit opt-in, a development build, and a loopback backend are all required. */
export function localAuthBypassEnabled(dev: boolean, flag: unknown, backend: string): boolean {
  if (!dev || flag !== "true") return false;
  try {
    const url = new URL(backend);
    return (
      url.protocol === "http:" &&
      !url.username &&
      !url.password &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
