import { requireBusiness } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import type { Reward } from "@/lib/types";
import { createReward, toggleReward, deleteReward } from "./actions";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const { business, program } = await requireBusiness();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("rewards")
    .select("*")
    .eq("business_id", business.id)
    .order("sort")
    .order("created_at");
  const rewards = (data ?? []) as Reward[];
  const stamps = program?.type === "stamps";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="page-title">Rewards</h1>
        <p className="page-lede">
          What customers can trade their {stamps ? "stamps" : "points"} for. Keep the cheapest one
          reachable in three or four visits — that is what makes people come back.
        </p>

        <div className="mt-6 space-y-3">
          {rewards.length === 0 && (
            <div className="card px-5 py-16 text-center text-sm text-ink-mute">
              No rewards yet. Add one on the right.
            </div>
          )}
          {rewards.map((r) => (
            <div key={r.id} className="card flex items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold">{r.title}</h3>
                  {!r.active && <span className="chip bg-canvas text-ink-mute">Paused</span>}
                  {r.stock !== null && (
                    <span className="chip bg-canvas text-ink-soft">{r.stock} left</span>
                  )}
                </div>
                {r.description && <p className="mt-1 text-sm text-ink-soft">{r.description}</p>}
                <p className="mt-1.5 text-xs text-ink-mute">
                  {stamps ? `${r.cost_stamps} stamps` : `${r.cost_points} points`}
                  {r.cash_value ? ` · costs you ${money(r.cash_value, business.currency)}` : ""}
                  {r.per_customer_limit ? ` · max ${r.per_customer_limit} per customer` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={toggleReward}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={String(!r.active)} />
                  <button className="btn-ghost h-10 px-3 text-xs">{r.active ? "Pause" : "Resume"}</button>
                </form>
                <form action={deleteReward}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-danger h-10 px-3 text-xs">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      <form action={createReward} className="card h-fit space-y-4 p-6">
        <h2 className="section-title">Add a reward</h2>
        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input id="title" name="title" required className="input" placeholder="Free coffee" />
        </div>
        <div>
          <label className="label" htmlFor="description">
            Description
          </label>
          <input id="description" name="description" className="input" placeholder="Any size, dine-in" />
        </div>
        {stamps ? (
          <div>
            <label className="label" htmlFor="cost_stamps">
              Stamps needed
            </label>
            <input
              id="cost_stamps"
              name="cost_stamps"
              type="number"
              min={1}
              defaultValue={program?.stamps_required ?? 10}
              className="input"
            />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="cost_points">
              Points needed
            </label>
            <input id="cost_points" name="cost_points" type="number" min={1} defaultValue={100} className="input" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="cash_value">
              Cost to you
            </label>
            <input id="cash_value" name="cash_value" type="number" min={0} className="input" placeholder="5000" />
          </div>
          <div>
            <label className="label" htmlFor="per_customer_limit">
              Limit per customer
            </label>
            <input id="per_customer_limit" name="per_customer_limit" type="number" min={1} className="input" placeholder="∞" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="stock">
            Total stock
          </label>
          <input id="stock" name="stock" type="number" min={0} className="input" placeholder="unlimited" />
        </div>
        <button className="btn-primary w-full">Add reward</button>
      </form>
    </div>
  );
}
