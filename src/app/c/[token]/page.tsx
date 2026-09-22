import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { money, since } from "@/lib/format";
import { prettyPhone } from "@/lib/phone";
import type { Business, Customer, Program, Reward, Tier, Txn } from "@/lib/types";
import RedeemCode from "./RedeemCode";

export const dynamic = "force-dynamic";

export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();

  const { data } = await admin
    .from("customers")
    .select("*, businesses(*)")
    .eq("card_token", token)
    .maybeSingle();
  if (!data) notFound();

  const c = data as unknown as Customer & { businesses: Business };
  const business = c.businesses;

  const [{ data: program }, { data: rewards }, { data: tier }, { data: history }] = await Promise.all([
    admin.from("programs").select("*").eq("business_id", business.id).eq("active", true).maybeSingle(),
    admin
      .from("rewards")
      .select("*")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("cost_points")
      .order("cost_stamps"),
    c.tier_id ? admin.from("tiers").select("*").eq("id", c.tier_id).maybeSingle() : Promise.resolve({ data: null }),
    admin
      .from("transactions")
      .select("*")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const p = program as Program | null;
  const t = tier as Tier | null;
  const stamps = p?.type === "stamps";
  const required = p?.stamps_required ?? 10;
  const filled = stamps ? c.stamps % required : 0;

  const qr = await QRCode.toString(`KADI:${business.slug}:${c.card_code}`, {
    type: "svg",
    margin: 0,
    width: 200,
    color: { dark: "#161513", light: "#0000" },
  });

  const nextReward = (rewards as Reward[] | null)
    ?.filter((r) => (stamps ? r.cost_stamps : r.cost_points) > (stamps ? c.stamps : c.points_balance))
    .sort((a, b) => (stamps ? a.cost_stamps - b.cost_stamps : a.cost_points - b.cost_points))[0];

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white"
        style={{ background: business.brand_color }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/65">{business.name}</div>
            <div className="mt-1.5 font-display text-xl font-medium">{c.name || prettyPhone(c.phone)}</div>
          </div>
          {t && (
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium tracking-wide">{t.name}</span>
          )}
        </div>

        {stamps ? (
          <>
            <div className="relative mt-7 grid grid-cols-5 gap-2">
              {Array.from({ length: required }).map((_, i) => (
                <div
                  key={i}
                  className={`grid aspect-square place-items-center rounded-full border text-sm font-medium ${
                    i < filled ? "border-white bg-white text-ink" : "border-white/35"
                  }`}
                >
                  {i < filled ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="12" cy="12" r="8" />
                    </svg>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="relative mt-4 text-sm text-white/80">
              {required - filled} more for a free one.
            </p>
          </>
        ) : (
          <>
            <div className="relative mt-8 font-display text-5xl font-medium tabular-nums tracking-tight">
              {c.points_balance.toLocaleString("en-UG")}
            </div>
            <div className="relative text-sm text-white/65">points available</div>
          </>
        )}

        <div className="relative mt-8 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">Card</div>
            <div className="font-mono text-lg font-medium tracking-[0.22em]">{c.card_code}</div>
          </div>
          <div
            className="rounded-lg bg-paper p-2"
            dangerouslySetInnerHTML={{ __html: qr }}
            style={{ width: 88, height: 88 }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="card px-2 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">Visits</div>
          <div className="mt-1 font-display text-lg font-medium tabular-nums">{c.visits}</div>
        </div>
        <div className="card px-2 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">Lifetime</div>
          <div className="mt-1 font-display text-lg font-medium tabular-nums">{c.points_lifetime.toLocaleString("en-UG")}</div>
        </div>
        <div className="card px-2 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">Earn rate</div>
          <div className="mt-1 font-display text-lg font-medium">{t ? `${t.multiplier}×` : "1×"}</div>
        </div>
      </div>

      {nextReward && (
        <div className="card mt-3 p-5">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">Next reward</div>
          <div className="mt-1.5 font-semibold">{nextReward.title}</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-brand-600"
              style={{
                width: `${Math.min(
                  100,
                  ((stamps ? c.stamps : c.points_balance) /
                    (stamps ? nextReward.cost_stamps : nextReward.cost_points)) *
                    100
                )}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-mute">
            {(stamps ? nextReward.cost_stamps - c.stamps : nextReward.cost_points - c.points_balance)}{" "}
            more {stamps ? "stamps" : "points"} to go.
          </p>
        </div>
      )}

      <div className="mt-3">
        <RedeemCode token={token} />
      </div>

      <div className="card mt-3">
        <div className="border-b border-black/[0.06] px-5 py-3.5">
          <h3 className="section-title">Available rewards</h3>
        </div>
        <ul className="divide-y divide-black/[0.05]">
          {(rewards as Reward[] | null)?.map((r) => {
            const cost = stamps ? r.cost_stamps : r.cost_points;
            const have = stamps ? c.stamps : c.points_balance;
            return (
              <li key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className={`text-sm font-medium ${have >= cost ? "" : "text-ink-mute"}`}>
                    {r.title}
                  </div>
                  {r.description && <div className="text-xs text-ink-mute">{r.description}</div>}
                </div>
                <span
                  className={`chip ${have >= cost ? "bg-brand-50 text-brand-700" : "bg-canvas text-ink-mute"}`}
                >
                  {cost} {stamps ? "stamps" : "pts"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card mt-3">
        <div className="border-b border-black/[0.06] px-5 py-3.5">
          <h3 className="section-title">Recent</h3>
        </div>
        <ul className="divide-y divide-black/[0.05]">
          {(history as Txn[] | null)?.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
              <div>
                <div className="font-medium">
                  {tx.kind === "award"
                    ? money(tx.amount, business.currency)
                    : tx.note ?? tx.kind}
                </div>
                <div className="text-xs text-ink-mute">{since(tx.created_at)}</div>
              </div>
              <span
                className={`font-semibold tabular-nums ${
                  tx.points_delta > 0 ? "text-brand-700" : tx.points_delta < 0 ? "text-red-700" : ""
                }`}
              >
                {tx.points_delta !== 0
                  ? `${tx.points_delta > 0 ? "+" : ""}${tx.points_delta}`
                  : `${tx.stamps_delta > 0 ? "+" : ""}${tx.stamps_delta}`}
              </span>
            </li>
          ))}
          {(history?.length ?? 0) === 0 && (
            <li className="px-5 py-10 text-center text-sm text-ink-mute">Nothing yet.</li>
          )}
        </ul>
      </div>

      <div className="card mt-3 p-6 text-center">
        <h3 className="section-title">Bring a friend</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          They give this code when they join — you both get bonus points.
        </p>
        <p className="mt-4 font-mono text-2xl font-medium tracking-[0.28em]">{c.referral_code}</p>
      </div>

      <p className="mt-8 text-center text-xs text-ink-mute">
        Keep this link. It is your card. · {business.name}
      </p>
    </main>
  );
}
