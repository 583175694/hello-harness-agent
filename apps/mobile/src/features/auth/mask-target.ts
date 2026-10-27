export function maskPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const mobile =
    digits.startsWith('86') && digits.length === 13 ? digits.slice(2) : digits;
  if (mobile.length !== 11) return phone;
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}
