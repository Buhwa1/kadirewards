import Link from "next/link";
import { requireBusiness } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { money, compact, since } from "@/lib/format";
import { prettyPhone } from "@/lib/phone";
import type { Stats, Txn, Customer } from "@/lib/types";
import VisitsChart from "./VisitsChart";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const { business, program } = await requireBusiness();
  const supabase = await supabaseServer();

  const [{ data: statsRaw }, { data: recent }, { data: top }] = await Promise.all([
    supabase.rpc("business_stats", { p_business: business.id, p_days: 30 }),
    supabase
      .from("transactions")
      .select("*, customers(name, phone, card_code)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("customers")
      .select("*")
      .eq("business_id", business.id)
      .order("points_lifetime", { ascending: false })
      .limit(5),
  ]);

  const stats = (statsRaw ?? {}) as Stats;
  const txns = (recent ?? []) as (Txn & {
    customers: { name: string | null; phone: string | null; card_code: string } | null;
  })[];
  const leaders = (top ?? []) as Customer[];

  if (!program) {
    return (
      <div className="card px-8 py-16 text-center">
        <h2 className="font-display text-2xl font-medium">No active programme</h2>
        <p className="mt-2 text-sm text-ink-soft">Create one in Settings to start awarding points.</p>
        <Link href="/dashboard/settings" className="btn-primary mt-6">
          Go to settings
        </Link>
      </div>
    );
  }

  const tiles = [
    { label: "Customers", value: compact(stats.customers), sub: `${stats.new_customers} new in 30d` },
    { label: "Active (30d)", value: compact(stats.active_30d), sub: `${stats.lapsed_60d} lapsed 60d+` },
    { label: "Visits (30d)", value: compact(stats.visits), sub: `${stats.repeat_rate}% come back` },
    { label: "Tracked sales (30d)", value: money(stats.revenue, business.currency), sub: "through the till" },
    {
      label: "Points outstanding",
      value: compact(stats.points_outstanding),
      sub: `${stats.redemptions} redeemed in 30d`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-lede">Last 30 days across every till.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="stat">
            <div className="stat-label">{t.label}</div>
            <div className="stat-value">{t.value}</div>
            <div className="mt-2 text-xs text-ink-mute">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <VisitsChart data={stats.daily ?? []} currency={business.currency} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
            <h3 className="section-title">Latest activity</h3>
            <Link href="/dashboard/customers" className="text-xs font-medium text-brand-700 hover:text-ink">
              All customers
            </Link>
          </div>
          {txns.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-ink-mute">
              Nothing yet. Open the till and ring up a sale.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {txns.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {t.customers?.name || prettyPhone(t.customers?.phone) || t.customers?.card_code}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-mute">
                      {t.kind === "award" && `Sale ${money(t.amount, business.currency)}`}
                      {t.kind === "redeem" && `Redeemed ${t.note ?? "a reward"}`}
                      {t.kind === "bonus" && (t.note ?? "Bonus")}
                      {t.kind === "adjust" && `Adjusted — ${t.note ?? ""}`}
                      {t.kind === "expire" && "Points expired"}
                      {" · "}
                      {since(t.created_at)}
                      {t.multiplier > 1 && t.kind === "award" && ` · ${t.multiplier}×`}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      t.points_delta > 0 ? "text-brand-700" : t.points_delta < 0 ? "text-red-700" : "text-ink-mute"
                    }`}
                  >
                    {t.points_delta > 0 ? "+" : ""}
                    {t.points_delta !== 0 ? t.points_delta : t.stamps_delta > 0 ? "+1 stamp" : "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="border-b border-black/[0.06] px-5 py-4">
            <h3 className="section-title">Best customers</h3>
          </div>
          {leaders.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-ink-mute">No customers yet.</p>
          ) : (
            <ul className="divide-y divide-black/[0.05]">
              {leaders.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="w-5 font-mono text-[11px] text-ink-mute">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="block truncate text-sm font-medium hover:text-brand-700"
                    >
                      {c.name || prettyPhone(c.phone) || c.card_code}
                    </Link>
                    <div className="text-xs text-ink-mute">
                      {c.visits} visits · {money(c.total_spend, business.currency)}
                    </div>
                  </div>
                  <span className="font-display text-base font-medium tabular-nums">{compact(c.points_lifetime)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
