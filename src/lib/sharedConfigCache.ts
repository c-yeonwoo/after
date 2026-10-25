import { createReadCache } from "./readCache";

// UI copy only; payment creation/confirmation always checks the live server mode.
export const paymentModeCache = createReadCache<boolean>(60_000);
