/** Mask a phone number for merchant-facing lists (e.g. +91 **** 2371). */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    const last4 = digits.slice(-4);
    const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "+91 ";
    return `${cc}**** ${last4}`;
  }
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 3)}••••${phone.slice(-4)}`;
}

/** E.164-ish digits for wa.me links. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
