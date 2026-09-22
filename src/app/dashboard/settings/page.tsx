import { requireBusiness, trialDaysLeft } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { prettyPhone } from "@/lib/phone";
import type { Tier } from "@/lib/types";
import { saveBusiness, saveProgram, saveTier, deleteTier } from "./actions";
import BillingBox from "./BillingBox";
import Notifications from "./Notifications";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { business, program } = await requireBusiness();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("tiers")
    .select("*")
    .eq("business_id", business.id)
    .order("min_points_lifetime");
  const tiers = (data ?? []) as Tier[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-lede">Business identity, earning rules, tiers and billing.</p>
      </div>

      <form action={saveBusiness} className="card space-y-4 p-6 sm:p-7">
        <h2 className="section-title">Business</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" defaultValue={business.name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Phone
            </label>
            <input id="phone" name="phone" defaultValue={business.phone ?? ""} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="address">
              Address
            </label>
            <input id="address" name="address" defaultValue={business.address ?? ""} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="brand_color">
              Card colour
            </label>
            <input
              id="brand_color"
              name="brand_color"
              type="color"
              defaultValue={business.brand_color}
              className="input h-11 p-1"
            />
          </div>
          <div>
            <label className="label" htmlFor="billing_phone">
              Mobile Money number for billing
            </label>
            <input
              id="billing_phone"
              name="billing_phone"
              defaultValue={business.billing_phone ?? ""}
              className="input"
              placeholder="0772 123 456"
            />
          </div>
        </div>
        <button className="btn-ghost">Save business</button>
      </form>

      {program && (
        <form action={saveProgram} className="card space-y-5 p-6 sm:p-7">
          <h2 className="section-title">Earning rules</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="type">
                Model
              </label>
              <select id="type" name="type" defaultValue={program.type} className="input">
                <option value="points">Points per spend</option>
                <option value="stamps">Stamp card</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="per_thousand">
                Points per 1,000 {business.currency}
              </label>
              <input
                id="per_thousand"
                name="per_thousand"
                type="number"
                step="0.1"
                min="0"
                defaultValue={program.points_per_currency * 1000}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="stamps_required">
                Stamps for a free one
              </label>
              <input
                id="stamps_required"
                name="stamps_required"
                type="number"
                min={2}
                defaultValue={program.stamps_required}
                className="input"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="stamp_min_spend">
                Min spend per stamp
              </label>
              <input
                id="stamp_min_spend"
                name="stamp_min_spend"
                type="number"
                min={0}
                defaultValue={program.stamp_min_spend}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="points_expire_days">
                Points expire after (days)
              </label>
              <input
                id="points_expire_days"
                name="points_expire_days"
                type="number"
                min={30}
                defaultValue={program.points_expire_days ?? ""}
                placeholder="never"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="award_cooldown_minutes">
                Cooldown (minutes)
              </label>
              <input
                id="award_cooldown_minutes"
                name="award_cooldown_minutes"
                type="number"
                min={0}
                defaultValue={program.award_cooldown_minutes}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="max_awards_per_day">
                Max awards per day
              </label>
              <input
                id="max_awards_per_day"
                name="max_awards_per_day"
                type="number"
                min={1}
                defaultValue={program.max_awards_per_day}
                className="input"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-ink-mute">
            Cooldown and daily cap are the anti-fraud dial: they stop a cashier ringing the same
            card twenty times after closing.
          </p>

          <div className="grid gap-4 border-t border-black/[0.06] pt-5 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="welcome_bonus">
                Welcome bonus
              </label>
              <input id="welcome_bonus" name="welcome_bonus" type="number" min={0} defaultValue={program.welcome_bonus} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="birthday_bonus">
                Birthday bonus
              </label>
              <input id="birthday_bonus" name="birthday_bonus" type="number" min={0} defaultValue={program.birthday_bonus} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="referral_bonus_referrer">
                Referrer bonus
              </label>
              <input
                id="referral_bonus_referrer"
                name="referral_bonus_referrer"
                type="number"
                min={0}
                defaultValue={program.referral_bonus_referrer}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="referral_bonus_referee">
                New friend bonus
              </label>
              <input
                id="referral_bonus_referee"
                name="referral_bonus_referee"
                type="number"
                min={0}
                defaultValue={program.referral_bonus_referee}
                className="input"
              />
            </div>
          </div>

          <button className="btn-primary">Save rules</button>
        </form>
      )}

      <div className="card p-6 sm:p-7">
        <h2 className="section-title">Tiers</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Lifetime points move a customer up a tier, and a higher tier earns faster. Three tiers is
          usually enough.
        </p>
        <div className="mt-5 space-y-3">
          {tiers.map((t) => (
            <form
              key={t.id}
              action={saveTier}
              className="flex flex-wrap items-end gap-3 rounded-xl bg-canvas p-4"
            >
              <input type="hidden" name="id" value={t.id} />
              <div className="w-36">
                <label className="label">Name</label>
                <input name="name" defaultValue={t.name} className="input" />
              </div>
              <div className="w-36">
                <label className="label">From (lifetime)</label>
                <input name="min_points_lifetime" type="number" defaultValue={t.min_points_lifetime} className="input" />
              </div>
              <div className="w-28">
                <label className="label">Earn ×</label>
                <input name="multiplier" type="number" step="0.05" defaultValue={t.multiplier} className="input" />
              </div>
              <div className="w-24">
                <label className="label">Colour</label>
                <input name="color" type="color" defaultValue={t.color} className="input h-11 p-1" />
              </div>
              <button className="btn-ghost">Save</button>
              <button formAction={deleteTier} className="btn-danger">
                Remove
              </button>
            </form>
          ))}

          <form action={saveTier} className="flex flex-wrap items-end gap-3 rounded-xl bg-canvas/60 p-4 shadow-[inset_0_0_0_1px_rgba(22,21,19,0.08)]">
            <div className="w-36">
              <label className="label">Name</label>
              <input name="name" className="input" placeholder="Platinum" />
            </div>
            <div className="w-36">
              <label className="label">From (lifetime)</label>
              <input name="min_points_lifetime" type="number" className="input" placeholder="5000" />
            </div>
            <div className="w-28">
              <label className="label">Earn ×</label>
              <input name="multiplier" type="number" step="0.05" className="input" placeholder="2" />
            </div>
            <div className="w-24">
              <label className="label">Colour</label>
              <input name="color" type="color" defaultValue="#1B4D3E" className="input h-11 p-1" />
            </div>
            <button className="btn-primary">Add tier</button>
          </form>
        </div>
      </div>

      {program && <Notifications program={program} sender={business.whatsapp_sender} />}

      <BillingBox
        plan={business.plan}
        status={business.subscription_status}
        trialDays={trialDaysLeft(business)}
        paidThrough={business.paid_through}
        billingPhone={prettyPhone(business.billing_phone)}
      />
    </div>
  );
}
