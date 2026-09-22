"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createBusiness, type OnboardState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" disabled={pending}>
      {pending ? "Setting up…" : "Create my programme"}
    </button>
  );
}

export default function Onboarding() {
  const [state, formAction] = useActionState<OnboardState, FormData>(createBusiness, {});
  const [type, setType] = useState<"points" | "stamps">("points");

  return (
    <main className="mx-auto max-w-xl px-5 py-12 sm:py-16">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">Step 1 of 1</p>
      <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">Set up your programme</h1>
      <p className="page-lede">Two minutes. You can change every one of these later.</p>

      <form action={formAction} className="card mt-8 space-y-5 p-6 sm:p-8">
        <div>
          <label className="label" htmlFor="name">
            Business name
          </label>
          <input id="name" name="name" required className="input" placeholder="Kikoni Coffee House" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="category">
              Type of business
            </label>
            <select id="category" name="category" className="input">
              <option value="restaurant">Restaurant / café</option>
              <option value="retail">Shop / supermarket</option>
              <option value="salon">Salon / barber</option>
              <option value="pharmacy">Pharmacy</option>
              <option value="services">Services</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Business phone
            </label>
            <input id="phone" name="phone" className="input" placeholder="0772 123 456" inputMode="tel" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="country">
              Country
            </label>
            <select id="country" name="country" className="input" defaultValue="UG">
              <option value="UG">Uganda</option>
              <option value="KE">Kenya</option>
              <option value="TZ">Tanzania</option>
              <option value="RW">Rwanda</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="currency">
              Currency
            </label>
            <select id="currency" name="currency" className="input" defaultValue="UGX">
              <option value="UGX">UGX</option>
              <option value="KES">KES</option>
              <option value="TZS">TZS</option>
              <option value="RWF">RWF</option>
            </select>
          </div>
        </div>

        <div>
          <span className="label">How do customers earn?</span>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["points", "Points", "Earn per shilling spent. Best for shops and restaurants."],
                ["stamps", "Stamps", "Buy N, get one free. Best for barbers, cafés, car washes."],
              ] as const
            ).map(([value, title, desc]) => (
              <button
                type="button"
                key={value}
                onClick={() => setType(value)}
                className={`rounded-xl p-4 text-left transition-colors duration-150 ${
                  type === value
                    ? "bg-brand-50 shadow-[0_0_0_1px_#1B4D3E]"
                    : "bg-canvas shadow-[0_0_0_1px_rgba(22,21,19,0.1)]"
                }`}
              >
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-1 text-xs leading-relaxed text-ink-soft">{desc}</div>
              </button>
            ))}
          </div>
          <input type="hidden" name="type" value={type} />
        </div>

        {type === "points" ? (
          <div>
            <label className="label" htmlFor="per_thousand">
              Points per 1,000 spent
            </label>
            <input
              id="per_thousand"
              name="per_thousand"
              type="number"
              min={0.1}
              step={0.1}
              defaultValue={1}
              className="input"
            />
            <p className="mt-1.5 text-xs text-ink-mute">
              A 25,000 sale earns 25 points. Roughly 1% back if 100 points buys a 25,000 reward.
            </p>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="stamps_required">
              Stamps needed for a free one
            </label>
            <input
              id="stamps_required"
              name="stamps_required"
              type="number"
              min={2}
              max={30}
              defaultValue={10}
              className="input"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 border-t border-black/[0.06] pt-5">
          <div>
            <label className="label" htmlFor="staff_name">
              First cashier
            </label>
            <input id="staff_name" name="staff_name" className="input" placeholder="Sarah" />
          </div>
          <div>
            <label className="label" htmlFor="pin">
              Their till PIN
            </label>
            <input
              id="pin"
              name="pin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              className="input tracking-[0.4em]"
              placeholder="••••"
            />
          </div>
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{state.error}</p>
        )}

        <Submit />
      </form>
    </main>
  );
}
