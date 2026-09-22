export function money(n: number | string | null | undefined, currency = "UGX") {
  const v = Number(n ?? 0);
  if (currency === "UGX" || currency === "TZS" || currency === "RWF") {
    return `${currency} ${Math.round(v).toLocaleString("en-UG")}`;
  }
  return `${currency} ${v.toLocaleString("en-UG", { minimumFractionDigits: 2 })}`;
}

export function compact(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  return v.toLocaleString("en-UG");
}

export function since(iso: string | null | undefined) {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Human copy for the error codes the SQL functions raise. */
export const ERRORS: Record<string, string> = {
  IDENTIFIER_REQUIRED: "Enter a phone number or scan a card.",
  CARD_NOT_FOUND: "No card with that code at this shop.",
  CUSTOMER_NOT_FOUND: "That customer isn't enrolled yet.",
  CUSTOMER_BLOCKED: "This card is blocked. Ask a manager.",
  NO_ACTIVE_PROGRAM: "No active rewards programme. Set one up first.",
  SUBSCRIPTION_INACTIVE: "Subscription inactive — renew to keep awarding points.",
  INVALID_AMOUNT: "Enter a valid sale amount.",
  AMOUNT_ABOVE_LIMIT: "That amount is above the per-sale limit.",
  COOLDOWN_ACTIVE: "This card was just awarded. Wait a moment before scanning again.",
  DAILY_LIMIT_REACHED: "Daily limit reached for this card.",
  REWARD_UNAVAILABLE: "That reward isn't available.",
  REWARD_EXPIRED: "That reward has expired.",
  REWARD_OUT_OF_STOCK: "That reward is out of stock.",
  BAD_REDEEM_CODE: "Wrong or expired code. Ask the customer to refresh their card.",
  PER_CUSTOMER_LIMIT: "This customer has already used that reward the maximum number of times.",
  INSUFFICIENT_POINTS: "Not enough points for that reward.",
  INSUFFICIENT_STAMPS: "Not enough stamps for that reward.",
  BAD_PIN: "PIN not recognised.",
};

export function humanError(message: string | undefined | null) {
  if (!message) return "Something went wrong.";
  for (const key of Object.keys(ERRORS)) {
    if (message.includes(key)) return ERRORS[key];
  }
  return message;
}
