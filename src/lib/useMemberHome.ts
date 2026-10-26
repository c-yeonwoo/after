import { homeStateV2, paymentsEnabled } from "./api";
import { myMeetWindow } from "./meetWindow";
import { useMemberLiveQuery } from "./useMemberLiveQuery";

/** One account-scoped snapshot shared by home and the full conversation. */
export function useMemberHome(owner: string | undefined, enabled = true) {
  return useMemberLiveQuery(
    "member-home",
    owner,
    async (signal) => {
      const [state, payments, window] = await Promise.allSettled([
        homeStateV2(signal),
        paymentsEnabled(),
        myMeetWindow(),
      ]);
      if (state.status === "rejected") throw state.reason;
      if (state.value.me?.id && state.value.me.id !== owner)
        throw new Error("로그인한 계정이 바뀌었어요.");
      return {
        state: state.value,
        payments: payments.status === "fulfilled" ? payments.value : null,
        window: window.status === "fulfilled" ? window.value : null,
      };
    },
    enabled,
  );
}
