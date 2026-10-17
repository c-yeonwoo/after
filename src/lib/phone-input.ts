/** Keep the input domestic and digits-only; verification still belongs to the server. */
export function phoneInputDigits(value: string): string {
  const digits = value.replace(/[^0-9+]/g, "");
  const local = digits.startsWith("+82") ? `0${digits.slice(3)}` : digits;
  return local.replace(/\D/g, "");
}
