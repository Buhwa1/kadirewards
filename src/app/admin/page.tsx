import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { money, compact, since } from "@/lib/format";
import type { Business } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { email } = await requirePlatformAdmin();
  const admin = supabaseAdmin();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [
    { count: businessCount },
    { count: customerCount },
    { count: txnCount },
    { data: businesses },
    { count: activeSubs },
    { count: trialing },
    { count: pastDue },
    { data: recentBiz },
  ] = await Promise.all([
    admin.from("businesses").select("*", { count: "exact", head: true }),
    admin.from("customers").select("*", { count: "exact", head: true }),
    admin
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .gte("occurred_at", thirtyDaysAgo)
      .eq("kind", "award"),
    admin
      .from("businesses")
      .select("id, name, slug, plan, subscription_status, country, currency, created_at, trial_ends_at, paid_through")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .eq("subscription_status", "active"),
    admin
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .eq("subscription_status", "trialing"),
    admin
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .eq("subscription_status", "past_due"),
    admin
      .from("businesses")
      .select("id, name, slug, created_at, subscription_status, plan, country")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false }),
  ]);

  // Per-business customer counts (batch)
  const bizIds = (businesses ?? []).map((b) => b.id);
  const customerCounts = new Map<string, number>();
  if (bizIds.length > 0) {
    const { data: custRows } = await admin.from("customers").select("business_id").in("business_id", bizIds);
    for (const row of custRows ?? []) {
      customerCounts.set(row.business_id, (customerCounts.get(row.business_id) ?? 0) + 1);
    }
  }

  const tiles = [
    { label: "Businesses", value: compact(businessCount ?? 0), sub: `${recentBiz?.length ?? 0} joined in 30d` },
    { label: "Customers (all)", value: compact(customerCount ?? 0), sub: "across every shop" },
    { label: "Awards (30d)", value: compact(txnCount ?? 0), sub: "till transactions" },
    { label: "Active paid", value: compact(activeSubs ?? 0), sub: `${trialing ?? 0} trialing · ${pastDue ?? 0} past due` },
  ];

  const list = (businesses ?? []) as Pick<
    Business,
    "id" | "name" | "slug" | "plan" | "subscription_status" | "country" | "currency" | "created_at" | "trial_ends_at" | "paid_through"
  >[];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-black/[0.06] bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="k-mark h-8 w-8 rounded-md text-[13px]">K</div>
            <div>
              <div className="text-sm font-semibold">Kadi Admin</div>
              <div className="text-[11px] text-ink-mute">{email}</div>
            </div>
          </div>
          <Link href="/dashboard" className="text-sm text-ink-mute hover:text-ink">
            My business →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 lg:px-8">
        <div>
          <h1 className="page-title">Platform overview</h1>
          <p className="page-lede">All shops on Kadi. Read-only super-admin view.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="stat">
              <div className="stat-label">{t.label}</div>
              <div className="stat-value">{t.value}</div>
              <div className="mt-2 text-xs text-ink-mute">{t.sub}</div>
            </div>
          ))}
        </div>

        {(recentBiz?.length ?? 0) > 0 && (
          <div className="card">
            <div className="border-b border-black/[0.06] px-5 py-4">
              <h3 className="section-title">Joined in the last 30 days</h3>
            </div>
            <ul className="divide-y divide-black/[0.05]">
              {(recentBiz ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-ink-mute">
                      {b.country} · {b.plan} · {b.subscription_status} · {since(b.created_at)}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-ink-mute">/{b.slug}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card overflow-x-auto">
          <div className="border-b border-black/[0.06] px-5 py-4">
            <h3 className="section-title">All businesses</h3>
          </div>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06] text-[11px] uppercase tracking-[0.12em] text-ink-mute">
                <th className="px-5 py-3 font-medium">Business</th>
                <th className="px-3 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Customers</th>
                <th className="px-3 py-3 font-medium">Country</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {list.map((b) => (
                <tr key={b.id} className="hover:bg-canvas/50">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{b.name}</div>
                    <div className="font-mono text-[11px] text-ink-mute">/{b.slug}</div>
                  </td>
                  <td className="px-3 py-3.5 capitalize">{b.plan}</td>
                  <td className="px-3 py-3.5">
                    <StatusChip status={b.subscription_status} />
                  </td>
                  <td className="px-3 py-3.5 tabular-nums">{customerCounts.get(b.id) ?? 0}</td>
                  <td className="px-3 py-3.5">{b.country}</td>
                  <td className="px-5 py-3.5 text-ink-mute">{since(b.created_at)}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-ink-mute">
                    No businesses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-ink-mute">
          Set <code className="rounded bg-canvas px-1">PLATFORM_ADMIN_EMAILS</code> to a
          comma-separated list of emails that can open this page.
        </p>
      </main>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-brand-50 text-brand-700",
    trialing: "bg-canvas text-ink-soft",
    past_due: "bg-red-50 text-red-800",
    canceled: "bg-canvas text-ink-mute",
  };
  return (
    <span className={`chip ${styles[status] ?? "bg-canvas text-ink-mute"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
