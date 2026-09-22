"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TillSession } from "@/lib/till-session";
import { money } from "@/lib/format";
import { looksLikePhone, normalizePhone, prettyPhone } from "@/lib/phone";
import { deviceId, flushQueue, newIdem, queue } from "@/lib/offline";
import type { QueuedAward } from "@/lib/types";
import QrScanner from "./QrScanner";

type Mode = "sell" | "redeem";
type Step = "amount" | "identify" | "customer" | "done";

type LookupResult = {
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    card_code: string;
    points_balance: number;
    stamps: number;
    visits: number;
    blocked: boolean;
  };
  tier: { name: string; color: string; multiplier: number } | null;
  program: { type: "points" | "stamps"; stamps_required: number } | null;
  rewards: { id: string; title: string; cost_points: number; cost_stamps: number }[];
};

export default function TillApp({ session }: { session: TillSession }) {
  const [mode, setMode] = useState<Mode>("sell");
  const [step, setStep] = useState<Step>("amount");

  const [amount, setAmount] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [newName, setNewName] = useState("");
  const [referral, setReferral] = useState("");

  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    offline?: boolean;
    points?: number;
    stamps?: number;
    balance?: number;
    name?: string;
    card?: string;
    duplicate?: boolean;
    reward?: string;
  }>(null);

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [chosenReward, setChosenReward] = useState<string | null>(null);

  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<QueuedAward[]>([]);
  const [showQueue, setShowQueue] = useState(false);

  const refreshQueue = useCallback(async () => {
    const all = await queue.all();
    setPending(all.filter((q) => q.status !== "failed").length);
    setFailed(all.filter((q) => q.status === "failed"));
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    await flushQueue();
    await refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue();
    const up = () => {
      setOnline(true);
      sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = setInterval(sync, 30_000);
    sync();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(timer);
    };
  }, [sync, refreshQueue]);

  function reset() {
    setAmount("");
    setIdentifier("");
    setNewName("");
    setReferral("");
    setRedeemCode("");
    setChosenReward(null);
    setLookup(null);
    setResult(null);
    setError(null);
    setStep(mode === "sell" ? "amount" : "identify");
  }

  function switchMode(next: Mode) {
    setMode(next);
    setAmount("");
    setIdentifier("");
    setLookup(null);
    setResult(null);
    setError(null);
    setStep(next === "sell" ? "amount" : "identify");
  }

  async function award() {
    const value = Number(amount || 0);
    const raw = identifier.trim();
    if (!raw) return setError("Enter a phone number or scan a card.");
    if (looksLikePhone(raw) && !normalizePhone(raw, session.country)) {
      return setError("That doesn't look like a valid phone number.");
    }

    setBusy(true);
    setError(null);

    const item: QueuedAward = {
      idem: newIdem(),
      identifier: raw,
      amount: value,
      name: newName.trim() || undefined,
      referral: referral.trim() || undefined,
      occurred_at: new Date().toISOString(),
      device_id: deviceId(),
      status: "pending",
      attempts: 0,
    };

    await queue.put(item);
    await refreshQueue();

    if (!navigator.onLine) {
      setResult({ offline: true });
      setStep("done");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/till/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const json = await res.json();

      if (!res.ok) {
        await queue.remove(item.idem);
        await refreshQueue();
        setError(json.error ?? "Could not award points.");
        setBusy(false);
        return;
      }

      await queue.remove(item.idem);
      await refreshQueue();
      setResult({
        points: json.points_awarded,
        stamps: json.stamps_awarded,
        balance: json.customer?.points_balance,
        name: json.customer?.name ?? undefined,
        card: json.customer?.card_code,
        duplicate: json.duplicate,
      });
      setStep("done");
    } catch {
      setResult({ offline: true });
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  async function doLookup() {
    const raw = identifier.trim();
    if (!raw) return setError("Enter a phone number or scan a card.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/till/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: raw }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Customer not found.");
      } else {
        setLookup(json);
        setStep("customer");
      }
    } catch {
      setError("Redeeming needs internet — the balance has to be checked live.");
    } finally {
      setBusy(false);
    }
  }

  async function doRedeem() {
    if (!chosenReward) return setError("Pick a reward first.");
    if (redeemCode.length !== 6) return setError("Ask the customer for the 6-digit code on their card.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/till/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          reward_id: chosenReward,
          code: redeemCode,
          idem: newIdem(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not redeem.");
      } else {
        setResult({ reward: json.reward, balance: json.customer?.points_balance });
        setStep("done");
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    await fetch("/api/till/logout", { method: "POST" });
    window.location.reload();
  }

  const stamps = lookup?.program?.type === "stamps";

  return (
    <div className="till-root">
      {scanning && (
        <QrScanner
          onResult={(v) => {
            setIdentifier(v);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}

      <header className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#121110]/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3.5">
          <div>
            <div className="text-sm font-semibold leading-tight">{session.business_name}</div>
            <div className="text-xs text-white/40">{session.staff_name}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQueue((s) => !s)}
              className="chip min-h-9 bg-white/10 text-white/80"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  online ? (pending > 0 ? "bg-amber-400" : "bg-[#c5d4cc]") : "bg-red-400"
                }`}
              />
              {online ? (pending > 0 ? `${pending} to sync` : "Online") : "Offline"}
            </button>
            <button onClick={lock} className="btn-ghost h-9 px-3 text-xs">
              Lock
            </button>
          </div>
        </div>

        {showQueue && (
          <div className="mx-auto max-w-lg border-t border-white/[0.08] px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{pending} sale(s) waiting to sync</span>
              <button onClick={sync} className="btn-ghost h-9 px-3 text-xs" disabled={!online}>
                Sync now
              </button>
            </div>
            {failed.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-red-300">Rejected — needs your attention</p>
                {failed.map((f) => (
                  <div key={f.idem} className="flex items-center justify-between gap-2 rounded-lg bg-red-950/40 px-3 py-2">
                    <div className="min-w-0 text-xs">
                      <div className="font-medium">
                        {f.identifier} · {money(f.amount, session.currency)}
                      </div>
                      <div className="text-red-300">{f.error}</div>
                    </div>
                    <button
                      onClick={async () => {
                        await queue.remove(f.idem);
                        refreshQueue();
                      }}
                      className="text-xs font-medium text-red-200"
                    >
                      Discard
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-lg px-4 pb-10 pt-5">
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.06] p-1">
          {(
            [
              ["sell", "Award points"],
              ["redeem", "Redeem reward"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => switchMode(value)}
              className={`min-h-11 rounded-lg text-sm font-medium transition-colors duration-150 ${
                mode === value ? "bg-[#c5d4cc] text-[#121110]" : "text-white/45"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-950/50 px-4 py-3 text-sm font-medium text-red-200">{error}</p>
        )}

        {step === "amount" && (
          <>
            <div className="rounded-xl bg-[#1c1b19] px-5 py-7 text-center shadow-[0_0_0_1px_rgba(244,241,234,0.08)]">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
                Sale amount
              </div>
              <div className="mt-2 font-display text-4xl font-medium tabular-nums tracking-tight">
                {amount ? money(Number(amount), session.currency) : `${session.currency} 0`}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {[5000, 10000, 20000, 50000].map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className="min-h-11 rounded-lg bg-white/[0.06] text-xs font-medium text-white/80"
                >
                  {q / 1000}k
                </button>
              ))}
            </div>

            <Keypad
              onPress={(k) => {
                if (k === "del") return setAmount((a) => a.slice(0, -1));
                if (k === "00") return setAmount((a) => (a ? a + "00" : ""));
                setAmount((a) => (a.length < 9 ? a + k : a));
              }}
            />

            <button
              onClick={() => {
                setError(null);
                setStep("identify");
              }}
              disabled={!amount || Number(amount) <= 0}
              className="btn-primary mt-4 w-full py-4 text-base"
            >
              Next — find the customer
            </button>
          </>
        )}

        {step === "identify" && (
          <>
            {mode === "sell" && (
              <div className="mb-5 flex items-center justify-between rounded-xl bg-[#c5d4cc]/10 px-4 py-3">
                <span className="text-sm text-white/55">Sale</span>
                <span className="font-display text-lg font-medium tabular-nums">{money(Number(amount), session.currency)}</span>
              </div>
            )}

            <label className="label" htmlFor="identifier">
              Phone number or card code
            </label>
            <input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input text-lg"
              placeholder="0772 123 456 or 4F7QX2"
              inputMode="text"
              autoFocus
            />

            <button onClick={() => setScanning(true)} className="btn-ghost mt-3 w-full">
              Scan card QR
            </button>

            {mode === "sell" && (
              <details className="mt-4 rounded-xl bg-[#1c1b19] p-4 shadow-[0_0_0_1px_rgba(244,241,234,0.08)]">
                <summary className="cursor-pointer text-sm font-medium">New customer? (optional)</summary>
                <div className="mt-3 space-y-3">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="input"
                    placeholder="Their name"
                  />
                  <input
                    value={referral}
                    onChange={(e) => setReferral(e.target.value.toUpperCase())}
                    className="input font-mono tracking-widest"
                    placeholder="Referral code from a friend"
                  />
                </div>
              </details>
            )}

            <Keypad
              onPress={(k) => {
                if (k === "del") return setIdentifier((s) => s.slice(0, -1));
                if (k === "00") return setIdentifier((s) => s + "00");
                setIdentifier((s) => s + k);
              }}
            />

            <div className="mt-4 flex gap-2">
              <button onClick={reset} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                onClick={mode === "sell" ? award : doLookup}
                disabled={busy || !identifier.trim()}
                className="btn-primary flex-[2] text-base"
              >
                {busy ? "Working…" : mode === "sell" ? "Award points" : "Find customer"}
              </button>
            </div>
          </>
        )}

        {step === "customer" && lookup && (
          <>
            <div className="rounded-xl bg-[#1c1b19] p-5 shadow-[0_0_0_1px_rgba(244,241,234,0.08)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {lookup.customer.name || prettyPhone(lookup.customer.phone) || lookup.customer.card_code}
                  </div>
                  <div className="text-xs text-white/40">
                    {lookup.customer.visits} visits · card {lookup.customer.card_code}
                  </div>
                </div>
                {lookup.tier && (
                  <span
                    className="chip"
                    style={{ backgroundColor: `${lookup.tier.color}33`, color: lookup.tier.color }}
                  >
                    {lookup.tier.name}
                  </span>
                )}
              </div>
              <div className="mt-5 font-display text-3xl font-medium tabular-nums tracking-tight">
                {stamps
                  ? `${lookup.customer.stamps} stamps`
                  : `${lookup.customer.points_balance.toLocaleString("en-UG")} points`}
              </div>
            </div>

            <h3 className="mt-7 text-sm font-semibold">Choose a reward</h3>
            <div className="mt-2 space-y-2">
              {lookup.rewards.length === 0 && (
                <p className="text-sm text-white/40">No rewards set up yet.</p>
              )}
              {lookup.rewards.map((r) => {
                const cost = stamps ? r.cost_stamps : r.cost_points;
                const have = stamps ? lookup.customer.stamps : lookup.customer.points_balance;
                const affordable = have >= cost;
                return (
                  <button
                    key={r.id}
                    disabled={!affordable}
                    onClick={() => setChosenReward(r.id)}
                    className={`flex min-h-12 w-full items-center justify-between rounded-lg px-4 text-left transition-colors duration-150 ${
                      chosenReward === r.id
                        ? "bg-[#c5d4cc] text-[#121110]"
                        : affordable
                          ? "bg-[#1c1b19] shadow-[0_0_0_1px_rgba(244,241,234,0.1)]"
                          : "bg-white/[0.03] opacity-40"
                    }`}
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {cost} {stamps ? "stamps" : "pts"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <label className="label" htmlFor="code">
                6-digit code from the customer's card
              </label>
              <input
                id="code"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                className="input text-center font-display text-2xl font-medium tracking-[0.4em]"
                placeholder="000000"
              />
              <p className="mt-1.5 text-xs text-white/40">
                They open their card link and read it to you. It changes every 10 minutes.
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={reset} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                onClick={doRedeem}
                disabled={busy || !chosenReward || redeemCode.length !== 6}
                className="btn-primary flex-[2] text-base"
              >
                {busy ? "Working…" : "Redeem"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="rounded-xl bg-[#1c1b19] p-8 text-center shadow-[0_0_0_1px_rgba(244,241,234,0.08)]">
            {result?.offline ? (
              <>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/10">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </div>
                <h2 className="mt-4 font-display text-2xl font-medium">Saved on this device</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  No internet right now. The points will land the moment the line comes back — the
                  customer keeps their sale.
                </p>
              </>
            ) : result?.reward ? (
              <>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#c5d4cc] text-[#121110]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </div>
                <h2 className="mt-4 font-display text-2xl font-medium">{result.reward} redeemed</h2>
                <p className="mt-2 text-sm text-white/55">
                  Balance now {result.balance?.toLocaleString("en-UG")} points.
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#c5d4cc] text-[#121110]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </div>
                <h2 className="mt-4 font-display text-4xl font-medium tabular-nums tracking-tight text-[#c5d4cc]">
                  {result?.stamps ? "+1 stamp" : `+${result?.points ?? 0}`}
                </h2>
                <p className="mt-2 text-sm text-white/55">
                  {result?.name ? `${result.name} · ` : ""}card {result?.card}
                </p>
                {typeof result?.balance === "number" && !result?.stamps && (
                  <p className="mt-4 text-sm font-medium">
                    Balance: {result.balance.toLocaleString("en-UG")} points
                  </p>
                )}
                {result?.duplicate && (
                  <p className="mt-3 text-xs text-white/40">
                    Already recorded — this sale was synced earlier.
                  </p>
                )}
              </>
            )}

            <button onClick={reset} className="btn-primary mt-8 w-full text-base">
              Next customer
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Keypad({ onPress }: { onPress: (key: string) => void }) {
  const held = useRef(false);
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"].map((k) => (
        <button
          key={k}
          onPointerDown={() => (held.current = true)}
          onClick={() => onPress(k)}
          className={`keypad-key ${k === "del" ? "text-base text-white/45" : ""}`}
        >
          {k === "del" ? "⌫" : k}
        </button>
      ))}
    </div>
  );
}
