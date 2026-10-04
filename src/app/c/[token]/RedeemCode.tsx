"use client";

import { useEffect, useState } from "react";

export default function RedeemCode({ token }: { token: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [expires, setExpires] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/card/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not get a code.");
      setCode(json.code);
      setExpires(new Date(json.expires_at).getTime());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!expires) return;
    const t = setInterval(() => {
      const secs = Math.max(0, Math.round((expires - Date.now()) / 1000));
      setLeft(secs);
      if (secs === 0) setCode(null);
    }, 1000);
    return () => clearInterval(t);
  }, [expires]);

  return (
    <div className="card p-6 text-center">
      <h3 className="section-title">Redeeming something?</h3>
      {code ? (
        <>
          <p className="mt-4 font-mono text-4xl font-medium tracking-[0.28em] tabular-nums">{code}</p>
          <p className="mt-2 text-xs text-ink-mute">
            Read this to the cashier. Expires in {Math.floor(left / 60)}:
            {String(left % 60).padStart(2, "0")}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Cashier looks you up by phone or card code, then you read them this one-time code. It
            stops anyone else spending your points.
          </p>
          <button onClick={mint} disabled={busy} className="btn-primary mt-5 w-full">
            {busy ? "Getting a code…" : "Show my code"}
          </button>
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}