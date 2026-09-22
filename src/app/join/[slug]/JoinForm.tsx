"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinForm({ slug, referral }: { slug: string; referral: string }) {
  const router = useRouter();
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
        body: JSON.stringify({ slug, phone, name, referral: ref }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Could not join.");
      else router.push(json.card_url);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mt-5 space-y-4 p-6">
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
        />
      </div>
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

      {error && <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{error}</p>}

      <button className="btn-primary w-full text-base" disabled={busy}>
        {busy ? "Creating your card…" : "Get my card"}
      </button>
    </form>
  );
}
