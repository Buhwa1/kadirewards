// Mirror of the SQL normalize_phone() so the till can validate before it
// queues an offline sale. Keep the two in sync.

const CALLING_CODES: Record<string, string> = {
  UG: "256",
  KE: "254",
  TZ: "255",
  RW: "250",
  ZM: "260",
  GH: "233",
  NG: "234",
};

export function callingCode(country = "UG") {
  return CALLING_CODES[country.toUpperCase()] ?? "256";
}

export function normalizePhone(raw: string, country = "UG"): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^0-9+]/g, "");
  const cc = callingCode(country);

  if (d.startsWith("+")) return d;
  if (d.startsWith(cc) && d.length >= cc.length + 8) return `+${d}`;
  if (d.startsWith("0")) return `+${cc}${d.slice(1)}`;
  if (d.length >= 8 && d.length <= 10) return `+${cc}${d}`;
  return null;
}

export function prettyPhone(e164: string | null | undefined) {
  if (!e164) return "—";
  const m = e164.match(/^\+(\d{3})(\d{3})(\d{3})(\d+)$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

/** Is this string a phone number, or a card code? The till branches on it. */
export function looksLikePhone(input: string) {
  return /^[0-9+][0-9 +()\-]*$/.test(input.trim());
}

export function normalizeCardCode(input: string) {
  const s = input.trim();
  const payload = s.toUpperCase().startsWith("KADI:") ? s.split(":")[2] ?? "" : s;
  return payload.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
