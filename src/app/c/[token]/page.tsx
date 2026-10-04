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

  const [{ data: program }, { data: rewards }, { data: tier }, { data: allTiers }, { data: history }] =
    await Promise.all([
      admin.from("programs").select("*").eq("business_id", business.id).eq("active", true).maybeSingle(),
      admin
        .from("rewards")
        .select("*")
        .eq("business_id", business.id)
        .eq("active", true)
        .order("cost_points")
        .order("cost_stamps"),
      c.tier_id
        ? admin.from("tiers").select("*").eq("id", c.tier_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("tiers")
        .select("*")
        .eq("business_id", business.id)
        .order("min_points_lifetime", { ascending: true }),
      admin
        .from("transactions")
        .select("*")
        .eq("customer_id", c.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const p = program as Program | null;
  const tiers = ([...(allTiers ?? [])] as Tier[]).sort(
    (a, b) => a.min_points_lifetime - b.min_points_lifetime
  );
  const stamps = p?.type === "stamps";
  const required = p?.stamps_required ?? 10;
  const filled = stamps ? c.stamps % required : 0;

  // Current tier from lifetime points (same rule as DB tier_for) — not a stale tier_id
  const t =
    [...tiers].reverse().find((x) => x.min_points_lifetime <= c.points_lifetime) ??
    (tier as Tier | null) ??
    null;

  // Card colour follows current tier; otherwise shop brand colour
  const faceColor = t?.color || business.brand_color;

  // Next tier = first threshold strictly above lifetime points
  const nextTier = tiers.find((x) => x.min_points_lifetime > c.points_lifetime) ?? null;
  const prevTierMin = t?.min_points_lifetime ?? 0;
  const nextTierMin = nextTier?.min_points_lifetime ?? null;
  const tierProgress =
    nextTierMin != null && nextTierMin > prevTierMin
      ? Math.min(
          100,
          Math.max(0, ((c.points_lifetime - prevTierMin) / (nextTierMin - prevTierMin)) * 100)
        )
      : 100;

  // QR with opaque white background so it never blends into the card
  const qr = await QRCode.toString(`KADI:${business.slug}:${c.card_code}`, {
    type: "svg",
    margin: 1,
    width: 280,
    color: { dark: "#161513", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });

  const nextReward = (rewards as Reward[] | null)
    ?.filter((r) => (stamps ? r.cost_stamps : r.cost_points) > (stamps ? c.stamps : c.points_balance))
    .sort((a, b) => (stamps ? a.cost_stamps - b.cost_stamps : a.cost_points - b.cost_points))[0];

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      {/* Card face — no QR here so nothing gets clipped */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl text-white shadow-lift"
        style={{
          background: `linear-gradient(135deg, ${faceColor} 0%, color-mix(in srgb, ${faceColor} 70%, #0a0a0a) 100%)`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/25" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/70">
                {business.name}
              </div>
              <div className="mt-1 truncate font-display text-lg font-medium leading-tight sm:text-xl">
                {c.name || prettyPhone(c.phone) || "Member"}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide text-white shadow-sm"
                style={{
                  background: t?.color
                    ? `color-mix(in srgb, ${t.color} 85%, #000)`
                    : "rgba(255,255,255,0.22)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.25)",
                }}
              >
                {t?.name ?? "Member"}
              </span>
              <div
                className="h-7 w-9 rounded-[5px] shadow-inner"
                style={{
                  background: "linear-gradient(145deg, #f0d78c 0%, #c9a227 45%, #a67c00 100%)",
                }}
                aria-hidden
              />
            </div>
          </div>

          <div className="mt-6">
            {stamps ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: required }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-3.5 w-3.5 rounded-full border ${
                        i < filled ? "border-white bg-white" : "border-white/40"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/75">
                  {required - filled === 0
                    ? "Ready for a free reward"
                    : `${required - filled} more for a free reward`}
                </p>
              </>
            ) : (
              <>
                <div className="font-display text-4xl font-medium tabular-nums tracking-tight sm:text-5xl">
                  {c.points_balance.toLocaleString("en-UG")}
                </div>
                <div className="text-xs text-white/70">points available</div>
              </>
            )}
          </div>

          <div className="mt-6 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/50">Card</div>
              <div className="font-mono text-lg font-medium tracking-[0.22em]">{c.card_code}</div>
              {c.phone && (
                <div className="mt-0.5 truncate text-[11px] text-white/55">{prettyPhone(c.phone)}</div>
              )}
            </div>
            {t && (
              <div className="text-right text-[11px] text-white/70">
                <div>{t.multiplier}× earn</div>
              </div>
            )}
          </div>

          {/* Tier progress */}
          {nextTier ? (
            <div className="mt-5">
              <div className="flex justify-between text-[10px] text-white/60">
                <span>{t?.name ?? "Member"}</span>
                <span>
                  {(nextTierMin! - c.points_lifetime).toLocaleString("en-UG")} pts to {nextTier.name}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-white/80"
                  style={{ width: `${tierProgress}%` }}
                />
              </div>
            </div>
          ) : t ? (
            <div className="mt-5 text-[10px] text-white/60">Top tier · {t.name}</div>
          ) : null}
        </div>
      </div>


      {/* Tier ladder — makes current tier obvious */}
      {tiers.length > 0 && (
        <div className="card mt-3 px-4 py-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">
            Your tier
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {tiers.map((tierRow) => {
              const active = t?.id === tierRow.id;
              const reached = c.points_lifetime >= tierRow.min_points_lifetime;
              return (
                <div
                  key={tierRow.id}
                  className={`flex min-w-[5.5rem] flex-1 flex-col rounded-xl px-3 py-2.5 ${
                    active
                      ? "ring-2 ring-offset-1"
                      : reached
                        ? "bg-canvas"
                        : "bg-canvas/50 opacity-60"
                  }`}
                  style={
                    active
                      ? {
                          background: `color-mix(in srgb, ${tierRow.color} 18%, white)`,
                          boxShadow: `0 0 0 2px ${tierRow.color}`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: tierRow.color }}
                    />
                    <span className={`text-sm font-semibold ${active ? "text-ink" : "text-ink-soft"}`}>
                      {tierRow.name}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-mute">
                    {tierRow.min_points_lifetime === 0
                      ? "Starting tier"
                      : `${tierRow.min_points_lifetime.toLocaleString("en-UG")}+ lifetime pts`}
                  </div>
                  <div className="text-[11px] text-ink-mute">{tierRow.multiplier}× earn</div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-mute">
            Tier is based on <strong className="font-medium text-ink-soft">lifetime points</strong> (all
            points ever earned), not your current balance. You have{" "}
            <strong className="font-medium text-ink-soft">
              {c.points_lifetime.toLocaleString("en-UG")}
            </strong>
            .
            {nextTier && (
              <>
                {" "}
                Need{" "}
                <strong className="font-medium text-ink-soft">
                  {(nextTierMin! - c.points_lifetime).toLocaleString("en-UG")}
                </strong>{" "}
                more to reach {nextTier.name}.
              </>
            )}
          </p>
        </div>
      )}

      {/* QR lives outside the card face — full size, never clipped */}
      <div className="card mt-3 flex flex-col items-center gap-3 p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">
          Show at the till
        </p>
        <div
          className="overflow-hidden rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(22,21,19,0.08)]"
          style={{ width: 200, height: 200 }}
        >
          <div
            className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        </div>
        <p className="text-center text-xs text-ink-mute">
          Or tell the cashier your phone number / card code{" "}
          <span className="font-mono font-medium text-ink">{c.card_code}</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="card px-2 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">Visits</div>
          <div className="mt-1 font-display text-lg font-medium tabular-nums">{c.visits}</div>
        </div>
        <div className="card px-2 py-3.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-mute">Lifetime</div>
          <div className="mt-1 font-display text-lg font-medium tabular-nums">
            {c.points_lifetime.toLocaleString("en-UG")}
          </div>
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
          {(rewards?.length ?? 0) === 0 && (
            <li className="px-5 py-10 text-center text-sm text-ink-mute">No rewards yet.</li>
          )}
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
                  {tx.kind === "award" ? money(tx.amount, business.currency) : tx.note ?? tx.kind}
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

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-mute">
        Lost this page? Open the shop&apos;s join link and enter the same phone number — your card
        opens again.
        <br />
        {business.name}
      </p>
    </main>
  );
}