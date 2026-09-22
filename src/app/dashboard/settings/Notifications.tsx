import type { Program } from "@/lib/types";
import { saveNotifications } from "./actions";

/**
 * Every WhatsApp message here costs real money per send, so the UI leads with
 * that rather than hiding it. The defaults are the cheap, effective set: the
 * handful of messages that bring someone back, and nothing else.
 */
const SWITCHES: {
  name: keyof Program;
  title: string;
  detail: string;
  volume: string;
  recommend: "on" | "off";
}[] = [
  {
    name: "notify_milestone",
    title: "Almost there",
    detail:
      "“Just one more stamp”, sent when someone comes within reach of a reward. This is the message that brings people back.",
    volume: "About once a month per customer",
    recommend: "on",
  },
  {
    name: "notify_birthday",
    title: "Birthday bonus",
    detail: "Once a year, and people remember it. Only goes to customers whose birthday you have.",
    volume: "Once a year per customer",
    recommend: "on",
  },
  {
    name: "notify_referral",
    title: "Referral payout",
    detail:
      "Tells someone their friend shopped and they earned points. Rare, and it earns you a customer.",
    volume: "Only when a referral converts",
    recommend: "on",
  },
  {
    name: "notify_receipt",
    title: "Receipt after every sale",
    detail:
      "Feels generous, costs the most by far — a busy shop can spend more on these in a month than the subscription. Customers can already see their balance on their card link for free.",
    volume: "Every single visit",
    recommend: "off",
  },
  {
    name: "notify_redeem",
    title: "Redemption confirmation",
    detail:
      "They are standing at your counter watching you hand it over. Almost never worth sending.",
    volume: "Every redemption",
    recommend: "off",
  },
];

export default function Notifications({
  program,
  sender,
}: {
  program: Program;
  sender: string | null;
}) {
  return (
    <form action={saveNotifications} className="card space-y-5 p-6">
      <div>
        <h2 className="section-title">WhatsApp messages</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
          Each message sent costs a small fee. Turning everything on is the fastest way to spend
          more on messaging than the shop pays for the whole system, so the defaults below are the
          few that pay for themselves.
        </p>
        <p className="mt-2 text-xs text-ink-mute">
          {sender ? `Sending from ${sender}.` : "Not connected yet — messages queue until then."}
        </p>
      </div>

      <div className="space-y-2">
        {SWITCHES.map((s) => {
          const on = Boolean(program[s.name]);
          return (
            <label
              key={s.name}
              className="flex cursor-pointer items-start gap-3 rounded-lg bg-canvas p-4 shadow-[0_0_0_1px_rgba(22,21,19,0.08)] transition-colors hover:bg-black/[0.02]"
            >
              <input
                type="checkbox"
                name={s.name}
                defaultChecked={on}
                className="mt-1 h-4 w-4 shrink-0 rounded"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight">{s.title}</span>
                  <span
                    className={`chip ${
                      s.recommend === "on"
                        ? "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[color:var(--accent)]"
                        : "bg-[#f8eceb] text-red-800"
                    }`}
                  >
                    {s.recommend === "on" ? "Recommended" : "Costs the most"}
                  </span>
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{s.detail}</span>
                <span className="mt-1 block text-[11px] uppercase tracking-[0.14em] text-ink-mute">
                  {s.volume}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="grid gap-4 border-t hairline pt-5 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="milestone_points_gap">
            Nudge within (points)
          </label>
          <input
            id="milestone_points_gap"
            name="milestone_points_gap"
            type="number"
            min={1}
            defaultValue={program.milestone_points_gap}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="milestone_stamps_gap">
            Nudge within (stamps)
          </label>
          <input
            id="milestone_stamps_gap"
            name="milestone_stamps_gap"
            type="number"
            min={1}
            defaultValue={program.milestone_stamps_gap}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="milestone_cooldown_days">
            At most once every (days)
          </label>
          <input
            id="milestone_cooldown_days"
            name="milestone_cooldown_days"
            type="number"
            min={1}
            defaultValue={program.milestone_cooldown_days}
            className="input"
          />
        </div>
      </div>

      <button className="btn-primary">Save messages</button>
    </form>
  );
}
