"use client";

import { useMemo, useState, useTransition } from "react";
import { logManualOutreach } from "./actions";

/**
 * The free win-back.
 *
 * No API, no templates, no business verification, no per-message fee: a wa.me
 * link opens WhatsApp on the owner's own phone with the message already typed,
 * and they press send. It arrives from the number their customers recognise,
 * which for a small shop lands better than anything sent from a platform.
 *
 * For shops one through five this is usually the better tool. The paid
 * broadcast is there for when the list is too long to work through by hand.
 */

export type Lapsed = {
  id: string;
  name: string | null;
  phone: string;
  points_balance: number;
  last_visit_at: string | null;
  messaged_at: string | null;
};

const DEFAULT_TEMPLATE =
  "Hi {name}, it's {business}. We haven't seen you in a while — you still have {points} points on your card. Come by this week and we'll take good care of you.";

function fill(template: string, c: Lapsed, business: string) {
  const first = (c.name ?? "").trim().split(/\s+/)[0];
  return template
    .replace(/\{name\}/g, first || "there")
    .replace(/\{business\}/g, business)
    .replace(/\{points\}/g, String(c.points_balance));
}

function daysSince(iso: string | null) {
  if (!iso) return "never visited";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return `${d} days ago`;
}

export default function ManualOutreach({
  customers,
  businessName,
}: {
  customers: Lapsed[];
  businessName: string;
}) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [showDone, setShowDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [justSent, setJustSent] = useState<string[]>([]);

  const { todo, done } = useMemo(() => {
    const isDone = (c: Lapsed) => Boolean(c.messaged_at) || justSent.includes(c.id);
    return {
      todo: customers.filter((c) => !isDone(c)),
      done: customers.filter(isDone),
    };
  }, [customers, justSent]);

  const list = showDone ? done : todo;

  function open(c: Lapsed) {
    const body = fill(template, c, businessName);
    // wa.me wants the number without a leading +
    const url = `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener");

    setJustSent((prev) => [...prev, c.id]);
    const data = new FormData();
    data.set("customer_id", c.id);
    data.set("body", body);
    startTransition(() => {
      logManualOutreach(data);
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b hairline px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Message them yourself</h2>
          <span className="chip bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[color:var(--accent)]">
            Free
          </span>
        </div>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
          Opens WhatsApp on your phone with the message ready to send. It comes from your own
          number, so people recognise it — and it costs nothing, because you are the one sending.
        </p>
      </div>

      <div className="border-b hairline px-6 py-5">
        <label className="label" htmlFor="outreach-template">
          Message
        </label>
        <textarea
          id="outreach-template"
          rows={3}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="input"
        />
        <p className="mt-2 text-xs text-ink-mute">
          <code className="rounded bg-canvas px-1 py-0.5">{"{name}"}</code>,{" "}
          <code className="rounded bg-canvas px-1 py-0.5">{"{business}"}</code> and{" "}
          <code className="rounded bg-canvas px-1 py-0.5">{"{points}"}</code> are filled in for
          each person.
        </p>
      </div>

      <div className="flex items-center justify-between border-b hairline px-6 py-3 text-sm">
        <span className="text-ink-mute">
          {showDone
            ? `${done.length} already messaged`
            : `${todo.length} to go${pending ? " · saving…" : ""}`}
        </span>
        <button
          onClick={() => setShowDone((v) => !v)}
          className="text-xs font-medium text-[color:var(--accent)] hover:underline"
        >
          {showDone ? "← Back to the list" : `Already messaged (${done.length})`}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="px-6 py-14 text-center text-sm text-ink-mute">
          {showDone
            ? "Nobody yet."
            : customers.length === 0
              ? "Nobody has lapsed yet. Come back when someone has been away 60 days."
              : "All done — you have been through everyone."}
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.05]">
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.name || c.phone}</div>
                <div className="mt-0.5 text-xs text-ink-mute">
                  {c.points_balance.toLocaleString("en-UG")} points · last seen{" "}
                  {daysSince(c.last_visit_at)}
                </div>
              </div>
              {showDone ? (
                <span className="chip bg-canvas text-ink-mute">Sent</span>
              ) : (
                <button onClick={() => open(c)} className="btn-primary shrink-0 px-3 text-xs">
                  Open WhatsApp
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!showDone && todo.length > 0 && (
        <p className="border-t hairline px-6 py-3 text-xs text-ink-mute">
          Works best on your phone — open this dashboard there and each tap jumps straight into
          WhatsApp.
        </p>
      )}
    </div>
  );
}
