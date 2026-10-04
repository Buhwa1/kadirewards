"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinForm({ slug, referral }: { slug: string; referral: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"join" | "open">("join");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState(referral);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          phone,
          name: mode === "join" ? name : undefined,
          referral: mode === "join" ? ref : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Could not continue.");
      else router.push(json.card_url);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-5 space-y-4 p-6">
      <div className="flex rounded-xl bg-canvas p-1">
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
            mode === "join" ? "bg-paper text-ink shadow-sm" : "text-ink-mute"
          }`}
        >
          New here
        </button>
        <button
          type="button"
          onClick={() => setMode("open")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
            mode === "open" ? "bg-paper text-ink shadow-sm" : "text-ink-mute"
          }`}
        >
          Open my card
        </button>
      </div>

      {mode === "open" && (
        <p className="text-sm leading-relaxed text-ink-soft">
          Enter the same phone number you used before. We&apos;ll open your rewards card — no QR
          needed.
        </p>
      )}

      <div>
        <label className="label" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          required
          className="input text-lg"
          placeholder="0772 123 456"
          autoComplete="tel"
        />
      </div>

      {mode === "join" && (
        <>
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="label" htmlFor="ref">
              Referral code
            </label>
            <input
              id="ref"
              value={ref}
              onChange={(e) => setRef(e.target.value.toUpperCase())}
              className="input font-mono tracking-widest"
              placeholder="Optional"
            />
          </div>
        </>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{error}</p>}

      <button className="btn-primary w-full text-base" disabled={busy}>
        {busy
          ? mode === "open"
            ? "Opening…"
            : "Creating your card…"
          : mode === "open"
            ? "Open my card"
            : "Get my card"}
      </button>
    </form>
  );
}