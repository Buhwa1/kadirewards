import Link from "next/link";
import { requireBusiness } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { money, since, compact } from "@/lib/format";
import { prettyPhone, normalizePhone } from "@/lib/phone";
import type { Customer, Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEGMENTS = [
  ["all", "Everyone"],
  ["active", "Active (30d)"],
  ["lapsed", "Lapsed (60d+)"],
  ["new", "New this month"],
  ["vip", "Top spenders"],
] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; seg?: string }>;
}) {
  const sp = await searchParams;
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();
  const q = (sp.q ?? "").trim();
  const seg = sp.seg ?? "all";

  let query = supabase.from("customers").select("*").eq("business_id", business.id);

  if (q) {
    const phone = normalizePhone(q, business.country);
    const code = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const parts = [`name.ilike.%${q}%`, `card_code.ilike.%${code}%`];
    if (phone) parts.push(`phone.ilike.%${phone}%`);
    query = query.or(parts.join(","));
  }

  const now = Date.now();
  if (seg === "active") query = query.gt("last_visit_at", new Date(now - 30 * 864e5).toISOString());
  if (seg === "lapsed") query = query.lt("last_visit_at", new Date(now - 60 * 864e5).toISOString());
  if (seg === "new") query = query.gt("created_at", new Date(now - 30 * 864e5).toISOString());

  query =
    seg === "vip"
      ? query.order("total_spend", { ascending: false })
      : query.order("last_visit_at", { ascending: false, nullsFirst: false });

  const [{ data }, { data: tierRows }] = await Promise.all([
    query.limit(200),
    supabase.from("tiers").select("*").eq("business_id", business.id),
  ]);

  const customers = (data ?? []) as Customer[];
  const tiers = new Map((tierRows ?? []).map((t: Tier) => [t.id, t]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-lede">Search by name, phone or printed card code.</p>
        </div>
        <form className="flex gap-2">
          {seg !== "all" && <input type="hidden" name="seg" value={seg} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Name, phone or card code"
            className="input w-64"
          />
          <button className="btn-ghost">Search</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map(([value, label]) => (
          <Link
            key={value}
            href={`/dashboard/customers?seg=${value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`chip min-h-9 px-3 ${
              seg === value ? "bg-ink text-paper" : "bg-paper text-ink-soft shadow-[0_0_0_1px_rgba(22,21,19,0.1)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        {customers.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-ink-mute">
            {q ? "No match." : "No customers in this segment yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-black/[0.06] text-left text-[11px] uppercase tracking-[0.12em] text-ink-mute">
                <tr>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Tier</th>
                  <th className="px-3 py-3 text-right font-medium">Points</th>
                  <th className="px-3 py-3 text-right font-medium">Visits</th>
                  <th className="px-3 py-3 text-right font-medium">Spend</th>
                  <th className="px-5 py-3 text-right font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {customers.map((c) => {
                  const tier = c.tier_id ? tiers.get(c.tier_id) : null;
                  return (
                    <tr key={c.id} className="hover:bg-canvas/70">
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/customers/${c.id}`} className="font-medium hover:text-brand-700">
                          {c.name || prettyPhone(c.phone) || "Card holder"}
                        </Link>
                        <div className="text-xs text-ink-mute">
                          {c.phone ? prettyPhone(c.phone) : "no phone"} · {c.card_code}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {tier ? (
                          <span
                            className="chip"
                            style={{ backgroundColor: `${tier.color}1A`, color: tier.color }}
                          >
                            {tier.name}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-mute">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right font-medium tabular-nums">
                        {compact(c.points_balance)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums">{c.visits}</td>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        {money(c.total_spend, business.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-ink-mute">{since(c.last_visit_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
