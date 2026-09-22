"use client";

import { useEffect, useState } from "react";
import { deviceId } from "@/lib/offline";

export default function TillLogin({ defaultSlug }: { defaultSlug: string }) {
  const [slug, setSlug] = useState(defaultSlug);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("kadi_shop");
    if (!defaultSlug && saved) setSlug(saved);
  }, [defaultSlug]);

  async function submit(nextPin: string) {
    if (nextPin.length !== 4 || !slug) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/till/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin: nextPin, device_id: deviceId() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not sign in.");
        setPin("");
      } else {
        localStorage.setItem("kadi_shop", slug);
        window.location.reload();
      }
    } catch {
      setError("No connection. The till needs internet once to unlock.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function press(key: string) {
    if (busy) return;
    if (key === "del") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) submit(next);
  }

  return (
    <main className="till-root flex flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#c5d4cc] font-display text-lg font-medium text-[#121110]">
            K
          </div>
          <h1 className="mt-5 font-display text-2xl font-medium tracking-tight">Till sign in</h1>
          <p className="mt-1.5 text-sm text-white/45">Enter your 4-digit PIN</p>
        </div>

        <label className="label" htmlFor="slug">
          Shop code
        </label>
        <input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.trim().toLowerCase())}
          className="input mb-8 text-center"
          placeholder="kikoni-coffee-house"
          autoCapitalize="none"
        />

        <div className="mb-8 flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-3 w-3 rounded-full transition-colors duration-150 ${
                pin.length > i ? "bg-[#c5d4cc]" : "bg-white/15"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="mb-5 rounded-lg bg-red-950/50 px-3.5 py-2.5 text-center text-sm text-red-200">{error}</p>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <button key={k} onClick={() => press(k)} className="keypad-key">
              {k}
            </button>
          ))}
          <div />
          <button onClick={() => press("0")} className="keypad-key">
            0
          </button>
          <button onClick={() => press("del")} className="keypad-key text-base text-white/45">
            ⌫
          </button>
        </div>
      </div>
    </main>
  );
}
