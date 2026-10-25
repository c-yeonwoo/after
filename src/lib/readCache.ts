/** Short-lived, memory-only cache for non-personal display configuration.
 * Never use for authorization, balances, conversations or mutation results.
 */
export function createReadCache<T>(ttlMs: number, now = Date.now) {
  let cached: { value: T; expiresAt: number } | undefined;
  let pending: Promise<T> | undefined;
  let generation = 0;
  return {
    read(load: () => Promise<T>): Promise<T> {
      if (cached && cached.expiresAt > now()) return Promise.resolve(cached.value);
      if (pending) return pending;
      const started = generation;
      const request = Promise.resolve()
        .then(load)
        .then((value) => {
          if (generation === started) cached = { value, expiresAt: now() + ttlMs };
          return value;
        })
        .finally(() => {
          if (pending === request) pending = undefined;
        });
      pending = request;
      return request;
    },
    clear() {
      generation++;
      cached = undefined;
      pending = undefined;
    },
  };
}
