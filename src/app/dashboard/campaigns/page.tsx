import { requireBusiness } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { since } from "@/lib/format";
import { createMultiplier, toggleCampaign, deleteCampaign, sendBroadcast } from "./actions";
import ManualOutreach, { type Lapsed } from "./ManualOutreach";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Campaign = {
  id: string;
  name: string;
  kind: "multiplier" | "broadcast";
  multiplier: number | null;
  days_of_week: number[] | null;
  hour_start: number | null;
  hour_end: number | null;
  ends_at: string | null;
  audience: string;
  message: string | null;
  active: boolean;
  created_at: string;
};

export default async function CampaignsPage() {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();

  const lapsedSince = new Date(Date.now() - 60 * 864e5).toISOString();

  const [{ data: rows }, { data: queued }, { data: lapsedRows }, { data: manualRows }] =
    await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("status, category, channel, created_at")
      .eq("business_id", business.id)
      .gt("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    supabase
      .from("customers")
      .select("id, name, phone, points_balance, last_visit_at")
      .eq("business_id", business.id)
      .eq("blocked", false)
      .eq("whatsapp_opt_in", true)
      .not("phone", "is", null)
      .lt("last_visit_at", lapsedSince)
      .order("points_balance", { ascending: false })
      .limit(100),
    // who the owner has already worked through by hand, recently
    supabase
      .from("messages")
      .select("customer_id, sent_at")
      .eq("business_id", business.id)
      .eq("channel", "manual")
      .gt("created_at", new Date(Date.now() - 60 * 864e5).toISOString()),
  ]);

  const campaigns = (rows ?? []) as Campaign[];
  const multipliers = campaigns.filter((c) => c.kind === "multiplier");
  const broadcasts = campaigns.filter((c) => c.kind === "broadcast");

  const msgs = (queued ?? []) as { status: string; category: string; channel: string }[];
  const pending = msgs.filter((m) => m.status === "queued").length;
  const billable = msgs.filter((m) => m.status === "sent" && m.channel === "whatsapp");
  const sent30 = billable.length;
  const marketing30 = billable.filter((m) => m.category === "marketing").length;
  const manual30 = msgs.filter((m) => m.channel === "manual").length;

  const messagedAt = new Map<string, string>();
  for (const m of (manualRows ?? []) as { customer_id: string | null; sent_at: string | null }[]) {
    if (m.customer_id) messagedAt.set(m.customer_id, m.sent_at ?? "");
  }

  const lapsed: Lapsed[] = (
    (lapsedRows ?? []) as {
      id: string;
      name: string | null;
      phone: string;
      points_balance: number;
      last_visit_at: string | null;
    }[]
  ).map((c) => ({ ...c, messaged_at: messagedAt.get(c.id) ?? null }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Campaigns</h1>
        <p className="page-lede">
          Two levers: multiply points during your quiet hours, and message people who have stopped
          coming.
        </p>
      </div>

      <div className="card flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-5">
        <div>
          <div className="stat-label">Sent (30 days)</div>
          <div className="mt-1.5 font-display text-xl font-medium tabular-nums">{sent30}</div>
        </div>
        <div>
          <div className="stat-label">Of those, broadcasts</div>
          <div className="mt-1.5 font-display text-xl font-medium tabular-nums">{marketing30}</div>
        </div>
        <div>
          <div className="stat-label">Waiting to send</div>
          <div className="mt-1.5 font-display text-xl font-medium tabular-nums">{pending}</div>
        </div>
        <div>
          <div className="stat-label">Sent by hand (free)</div>
          <div className="mt-1.5 font-display text-xl font-medium tabular-nums">{manual30}</div>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-ink-mute">
          Broadcasts are billed at the marketing rate — roughly twice what an automatic nudge
          costs. One good broadcast a month beats four mediocre ones.
        </p>
      </div>

      <ManualOutreach customers={lapsed} businessName={business.name} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <form action={createMultiplier} className="card space-y-4 p-6">
            <h2 className="section-title">Points multiplier</h2>
            <p className="text-xs leading-relaxed text-ink-mute">
              Double points on a Tuesday afternoon fills a room that would otherwise be empty. It
              costs you nothing until someone shows up.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="name">
                  Name
                </label>
                <input id="name" name="name" className="input" placeholder="Quiet Tuesday" required />
              </div>
              <div>
                <label className="label" htmlFor="multiplier">
                  Multiplier
                </label>
                <select id="multiplier" name="multiplier" className="input" defaultValue="2">
                  <option value="1.5">1.5×</option>
                  <option value="2">2×</option>
                  <option value="3">3×</option>
                </select>
              </div>
            </div>
            <div>
              <span className="label">Days</span>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                  <label
                    key={d}
                    className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-canvas px-2.5 text-xs shadow-[0_0_0_1px_rgba(22,21,19,0.1)]"
                  >
                    <input type="checkbox" name="days" value={i} className="h-3.5 w-3.5" />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="hour_start">
                  From (hour)
                </label>
                <input id="hour_start" name="hour_start" type="number" min={0} max={23} className="input" placeholder="14" />
              </div>
              <div>
                <label className="label" htmlFor="hour_end">
                  Until (hour)
                </label>
                <input id="hour_end" name="hour_end" type="number" min={0} max={23} className="input" placeholder="17" />
              </div>
            </div>
            <button className="btn-primary w-full">Create multiplier</button>
          </form>

          <div className="card divide-y divide-black/[0.05]">
            {multipliers.length === 0 ? (
              <p className="px-5 py-14 text-center text-sm text-ink-mute">No multipliers yet.</p>
            ) : (
              multipliers.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.name}
                      <span className="chip bg-brand-50 text-brand-700">{c.multiplier}×</span>
                      {!c.active && <span className="chip bg-canvas text-ink-mute">Off</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-mute">
                      {c.days_of_week?.map((d) => DAYS[d]).join(", ") || "Every day"}
                      {c.hour_start !== null && ` · ${c.hour_start}:00–${c.hour_end}:00`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <form action={toggleCampaign}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={String(!c.active)} />
                      <button className="btn-ghost h-10 px-3 text-xs">{c.active ? "Pause" : "Resume"}</button>
                    </form>
                    <form action={deleteCampaign}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn-danger h-10 px-3 text-xs">Delete</button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <form action={sendBroadcast} className="card space-y-4 p-6">
            <div>
              <h2 className="section-title">Automatic broadcast</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-mute">
                Sends from the platform number and is billed per message at the marketing rate.
                Worth it when the list is too long to work through by hand — otherwise use the
                free option above.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="audience">
                Send to
              </label>
              <select id="audience" name="audience" className="input" defaultValue="lapsed">
                <option value="all">Everyone with a number</option>
                <option value="lapsed">Lapsed — no visit in 60 days</option>
                <option value="active">Active — visited in 30 days</option>
                <option value="new">Joined in the last 30 days</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="message">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                className="input"
                placeholder="We miss you! Your points are still waiting — come in this week and we'll double them."
                required
              />
              <p className="mt-1.5 text-xs text-ink-mute">
                Opted-out customers are skipped automatically. Keep it to one message a month or
                people mute you.
              </p>
            </div>
            <button className="btn-primary w-full">Queue broadcast</button>
          </form>

          <div className="card divide-y divide-black/[0.05]">
            {broadcasts.length === 0 ? (
              <p className="px-5 py-14 text-center text-sm text-ink-mute">Nothing sent yet.</p>
            ) : (
              broadcasts.map((c) => (
                <div key={c.id} className="px-5 py-4">
                  <div className="text-xs text-ink-mute">
                    {c.audience} · {since(c.created_at)}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed">{c.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
