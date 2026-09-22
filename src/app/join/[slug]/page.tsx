import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Business, Program, Reward } from "@/lib/types";
import JoinForm from "./JoinForm";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  const { ref } = await searchParams;
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("businesses")
    .select("*")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!data) notFound();
  const business = data as Business;

  const [{ data: program }, { data: rewards }] = await Promise.all([
    admin.from("programs").select("*").eq("business_id", business.id).eq("active", true).maybeSingle(),
    admin
      .from("rewards")
      .select("*")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("cost_points")
      .limit(4),
  ]);

  const p = program as Program | null;

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <div
        className="relative overflow-hidden rounded-2xl p-7 text-white"
        style={{ background: business.brand_color }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
        <p className="relative text-[11px] uppercase tracking-[0.18em] text-white/60">Join</p>
        <h1 className="relative mt-2 font-display text-3xl font-medium tracking-tight">{business.name}</h1>
        <p className="relative mt-3 text-sm leading-relaxed text-white/80">
          {p?.type === "stamps"
            ? `Collect ${p.stamps_required} stamps, get one free.`
            : `Earn points every time you shop. ${
                p ? Math.round(p.points_per_currency * 1000) : 1
              } point per ${business.currency} 1,000.`}
        </p>
        {(p?.welcome_bonus ?? 0) > 0 && (
          <p className="relative mt-4 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            {p!.welcome_bonus} points just for joining
          </p>
        )}
      </div>

      <JoinForm slug={business.slug} referral={ref ?? ""} />

      {(rewards as Reward[] | null)?.length ? (
        <div className="card mt-5">
          <div className="border-b border-black/[0.06] px-5 py-3.5">
            <h2 className="section-title">What you can earn</h2>
          </div>
          <ul className="divide-y divide-black/[0.05]">
            {(rewards as Reward[]).map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                <span>{r.title}</span>
                <span className="chip bg-canvas text-ink-soft">
                  {p?.type === "stamps" ? `${r.cost_stamps} stamps` : `${r.cost_points} pts`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-8 text-center text-xs text-ink-mute">
        No app to download. Your phone number is your card.
      </p>
    </main>
  );
}
