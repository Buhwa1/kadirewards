import Link from "next/link";
import { requireBusiness } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { money, compact, since } from "@/lib/format";
import { prettyPhone } from "@/lib/phone";
import type { Stats, Txn, Customer } from "@/lib/types";
import VisitsChart from "./VisitsChart";

export const dynamic = "force-dynamic";

type StaffRow = { id: string; name: string; awards: number; revenue: number; redemptions: number };

export default async function Overview() {
  const { business, program } = await requireBusiness();
  const supabase = await supabaseServer();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [
    { data: statsRaw },
    { data: recent },
    { data: top },
    { data: atRisk },
    { data: staffList },
    { data: staffTxns },
  ] = await Promise.all([
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
    // At-risk: had visits before, but last visit 14–60 days ago (still recoverable)
    supabase
      .from("customers")
      .select("id, name, phone, card_code, visits, last_visit_at, points_balance, total_spend")
      .eq("business_id", business.id)
      .lt("last_visit_at", fourteenDaysAgo)
      .gt("last_visit_at", sixtyDaysAgo)
      .gt("visits", 1)
      .order("last_visit_at", { ascending: true })
      .limit(8),
    supabase.from("staff").select("id, name").eq("business_id", business.id).eq("active", true),
    supabase
      .from("transactions")
      .select("staff_id, kind, amount")
      .eq("business_id", business.id)
      .gte("occurred_at", thirtyDaysAgo)
      .not("staff_id", "is", null),
  ]);

  const stats = (statsRaw ?? {}) as Stats;
  const txns = (recent ?? []) as (Txn & {
    customers: { name: string | null; phone: string | null; card_code: string } | null;
  })[];
  const leaders = (top ?? []) as Customer[];
  const risk = (atRisk ?? []) as {
    id: string;
    name: string | null;
    phone: string | null;
    card_code: string;
    visits: number;
    last_visit_at: string;
    points_balance: number;
    total_spend: number;
  }[];

  // Aggregate staff performance from transactions
  const staffMap = new Map<string, StaffRow>();
  for (const s of staffList ?? []) {
    staffMap.set(s.id, { id: s.id, name: s.name, awards: 0, revenue: 0, redemptions: 0 });
  }
  for (const t of staffTxns ?? []) {
    if (!t.staff_id) continue;
    const row = staffMap.get(t.staff_id);
    if (!row) continue;
    if (t.kind === "award") {
      row.awards += 1;
      row.revenue += Number(t.amount) || 0;
    } else if (t.kind === "redeem") {
      row.redemptions += 1;
    }
  }
  const staffPerf = Array.from(staffMap.values()).sort((a, b) => b.awards - a.awards);

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
      sub: `${stats.redemptions ?? 0} redeemed in 30d`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-lede">Last 30 days across every till.</p>
        </div>
        <Link href="/dashboard/poster" className="btn-primary text-sm">
          Print sign-up QR
        </Link>
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

      {/* At-risk customers — high-value win-back */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h3 className="section-title">At-risk regulars</h3>
            <p className="mt-0.5 text-xs text-ink-mute">
              Visited before, quiet for 2–8 weeks — worth a WhatsApp.
            </p>
          </div>
          <Link href="/dashboard/campaigns" className="text-xs font-medium text-brand-700 hover:text-ink">
            Win them back
          </Link>
        </div>
        {risk.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-mute">
            No one in this window right now. Good sign.
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {risk.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/customers/${c.id}`}
                    className="block truncate text-sm font-medium hover:text-brand-700"
                  >
                    {c.name || prettyPhone(c.phone) || c.card_code}
                  </Link>
                  <div className="text-xs text-ink-mute">
                    {c.visits} visits · last {since(c.last_visit_at)} ·{" "}
                    {money(c.total_spend, business.currency)} lifetime
                  </div>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-ink-mute">
                  {c.points_balance} pts
                </span>
              </li>
            ))}
          </ul>
        )}
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
                      {t.kind === "redeem" && (t.note || "Redemption")}
                      {t.kind === "bonus" && (t.note || "Bonus")}
                      {t.kind === "adjust" && (t.note || "Adjustment")}
                      {t.kind === "expire" && "Points expired"}
                      {" · "}
                      {since(t.created_at)}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      t.points_delta > 0
                        ? "text-brand-700"
                        : t.points_delta < 0
                          ? "text-red-700"
                          : ""
                    }`}
                  >
                    {t.points_delta !== 0
                      ? `${t.points_delta > 0 ? "+" : ""}${t.points_delta}`
                      : t.stamps_delta !== 0
                        ? `${t.stamps_delta > 0 ? "+" : ""}${t.stamps_delta}`
                        : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="border-b border-black/[0.06] px-5 py-4">
              <h3 className="section-title">Top members</h3>
            </div>
            {leaders.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-mute">No customers yet.</p>
            ) : (
              <ul className="divide-y divide-black/[0.05]">
                {leaders.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="w-5 font-mono text-[11px] text-ink-mute">
                      {String(i + 1).padStart(2, "0")}
                    </span>
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
                    <span className="font-display text-base font-medium tabular-nums">
                      {compact(c.points_lifetime)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Staff performance */}
          <div className="card">
            <div className="border-b border-black/[0.06] px-5 py-4">
              <h3 className="section-title">Staff (30d)</h3>
              <p className="mt-0.5 text-xs text-ink-mute">Sales attributed to each PIN</p>
            </div>
            {staffPerf.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-mute">
                Add staff under Staff &amp; till.
              </p>
            ) : (
              <ul className="divide-y divide-black/[0.05]">
                {staffPerf.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-ink-mute">
                        {s.awards} awards · {s.redemptions} redemptions
                      </div>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {money(s.revenue, business.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
