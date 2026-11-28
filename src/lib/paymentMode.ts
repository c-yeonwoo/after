import { supabase } from "@/lib/supabase";
import { paymentModeCache } from "@/lib/sharedConfigCache";

async function readPaymentMode(): Promise<boolean> {
  const { data, error } = await supabase.rpc("public_payment_mode");
  if (error) throw error;
  if (typeof data !== "boolean") throw new Error("이용 방식을 확인할 수 없어요.");
  return data;
}

export function paymentsEnabled(): Promise<boolean> {
  return typeof window === "undefined" ? readPaymentMode() : paymentModeCache.read(readPaymentMode);
}
