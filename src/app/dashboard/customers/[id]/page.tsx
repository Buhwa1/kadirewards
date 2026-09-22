import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { money, since, compact } from "@/lib/format";
import { prettyPhone } from "@/lib/phone";
import type { Customer, Tier, Txn } from "@/lib/types";
import { adjustPoints, setBlocked, updateCustomer } from "./actions";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business, program } = await requireBusiness();
  const supabase = await supabaseServer();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!customer) notFound();
  const c = customer as Customer;

  const [{ data: txnRows }, { data: tier }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(50),
    c.tier_id
      ? supabase.from("tiers").select("*").eq("id", c.tier_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const txns = (txnRows ?? []) as Txn[];
  const t = tier as Tier | null;
  const cardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${c.card_token ?? ""}`;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/customers" className="text-sm text-ink-mute hover:text-ink">
        ← Customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">
            {c.name || prettyPhone(c.phone) || "Card holder"}
          </h1>
          <p className="mt-1.5 text-sm text-ink-mute">
            {prettyPhone(c.phone)} · card <span className="font-mono font-medium">{c.card_code}</span> ·
            joined {since(c.created_at)}
            {c.blocked && <span className="chip ml-2 bg-red-50 text-red-800">Blocked</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={cardUrl} target="_blank" rel="noreferrer" className="btn-ghost">
            Open their card
          </a>
          <form action={setBlocked}>
            <input type="hidden" name="customer_id" value={c.id} />
            <input type="hidden" name="blocked" value={String(!c.blocked)} />
            <button className={c.blocked ? "btn-ghost" : "btn-danger"}>
              {c.blocked ? "Unblock" : "Block card"}
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="stat">
          <div className="stat-label">{program?.type === "stamps" ? "Stamps" : "Points"}</div>
          <div className="stat-value">
            {program?.type === "stamps" ? c.stamps : compact(c.points_balance)}
          </div>
          {t && (
            <div className="mt-1.5 text-xs" style={{ color: t.color }}>
              {t.name} · {t.multiplier}× earn
            </div>
          )}
        </div>
        <div className="stat">
          <div className="stat-label">Lifetime points</div>
          <div className="stat-value">{compact(c.points_lifetime)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Visits</div>
          <div className="stat-value">{c.visits}</div>
          <div className="mt-1.5 text-xs text-ink-mute">last {since(c.last_visit_at)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total spend</div>
          <div className="stat-value">{money(c.total_spend, business.currency)}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="border-b border-black/[0.06] px-5 py-4">
            <h3 className="section-title">History</h3>
          </div>
          {txns.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-ink-mute">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {txns.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <div className="text-sm font-medium capitalize">
                      {tx.kind === "award" ? `Sale ${money(tx.amount, business.currency)}` : tx.kind}
                      {tx.note && <span className="font-normal text-ink-soft"> · {tx.note}</span>}
                    </div>
                    <div className="text-xs text-ink-mute">
                      {new Date(tx.occurred_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {tx.channel !== "till" && ` · ${tx.channel}`}
                      {tx.multiplier > 1 && ` · ${tx.multiplier}×`}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold tabular-nums ${
                      tx.points_delta > 0 ? "text-brand-700" : tx.points_delta < 0 ? "text-red-700" : ""
                    }`}
                  >
                    {tx.points_delta !== 0
                      ? `${tx.points_delta > 0 ? "+" : ""}${tx.points_delta}`
                      : tx.stamps_delta !== 0
                        ? `${tx.stamps_delta > 0 ? "+" : ""}${tx.stamps_delta} stamp`
                        : "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          <form action={updateCustomer} className="card space-y-4 p-5">
            <h3 className="section-title">Details</h3>
            <input type="hidden" name="customer_id" value={c.id} />
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" defaultValue={c.name ?? ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="birthday">
                Birthday
              </label>
              <input
                id="birthday"
                name="birthday"
                type="date"
                defaultValue={c.birthday ?? ""}
                className="input"
              />
              <p className="mt-1.5 text-xs text-ink-mute">
                Used for the automatic birthday bonus, if it is switched on.
              </p>
            </div>
            <label className="flex min-h-11 items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="whatsapp_opt_in"
                defaultChecked={c.whatsapp_opt_in}
                className="h-4 w-4 rounded"
              />
              Send WhatsApp receipts
            </label>
            <button className="btn-ghost w-full">Save</button>
          </form>

          <form action={adjustPoints} className="card space-y-4 p-5">
            <h3 className="section-title">Adjust points</h3>
            <p className="text-xs text-ink-mute">
              Goodwill, or fixing a mistake. Negative numbers take points away.
            </p>
            <input type="hidden" name="customer_id" value={c.id} />
            <input name="points" type="number" placeholder="e.g. 50 or -20" className="input" required />
            <input name="note" placeholder="Reason (shown in history)" className="input" />
            <button className="btn-ghost w-full">Apply</button>
          </form>

          <div className="card p-5">
            <h3 className="section-title">Referral code</h3>
            <p className="mt-3 font-mono text-2xl font-medium tracking-[0.28em]">{c.referral_code}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-mute">
              Friends who enter this when they join earn both of them bonus points.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
