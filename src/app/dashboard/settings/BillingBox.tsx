"use client";

import { useState } from "react";

const PLANS = [
  { id: "starter", name: "Starter", price: 100000, blurb: "1 till · 500 customers" },
  { id: "growth", name: "Growth", price: 200000, blurb: "3 tills · unlimited customers · campaigns" },
  { id: "chain", name: "Chain", price: 350000, blurb: "Multiple branches · shared customer base" },
] as const;

export default function BillingBox({
  plan,
  status,
  trialDays,
  paidThrough,
  billingPhone,
}: {
  plan: string;
  status: string;
  trialDays: number;
  paidThrough: string | null;
  billingPhone: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function pay(planId: string) {
    setBusy(planId);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const json = await res.json();
      setMsg(
        res.ok
          ? json.message ?? "Approve the payment prompt on your phone."
          : json.error ?? "Could not start the payment."
      );
    } catch {
      setMsg("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Subscription</h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            {status === "trialing"
              ? `Free trial — ${trialDays} day${trialDays === 1 ? "" : "s"} left.`
              : status === "active"
                ? `Active until ${paidThrough ? new Date(paidThrough).toLocaleDateString("en-GB") : "—"}.`
                : status === "past_due"
                  ? "Payment failed. Points still work, but renew soon."
                  : "Cancelled — the till cannot award points."}
          </p>
        </div>
        <span className="chip bg-canvas capitalize text-ink-soft">{plan}</span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={`rounded-xl p-5 ${
              plan === p.id ? "bg-ink text-paper" : "bg-canvas"
            }`}
          >
            <div className="text-sm font-semibold">{p.name}</div>
            <div className="mt-2 font-display text-xl font-medium tabular-nums">
              UGX {p.price.toLocaleString("en-UG")}
              <span className={`text-xs font-sans font-medium ${plan === p.id ? "text-white/45" : "text-ink-mute"}`}>
                /mo
              </span>
            </div>
            <p className={`mt-2 text-xs leading-relaxed ${plan === p.id ? "text-white/60" : "text-ink-soft"}`}>
              {p.blurb}
            </p>
            <button
              onClick={() => pay(p.id)}
              disabled={busy !== null}
              className={`mt-4 w-full text-xs ${plan === p.id ? "btn h-10 bg-paper text-ink" : "btn-ghost h-10"}`}
            >
              {busy === p.id ? "Sending prompt…" : plan === p.id ? "Renew" : "Switch & pay"}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-ink-mute">
        Charged to {billingPhone} by Mobile Money. You will get a prompt on that phone to approve.
      </p>
      {msg && <p className="mt-3 rounded-lg bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">{msg}</p>}
    </div>
  );
}
