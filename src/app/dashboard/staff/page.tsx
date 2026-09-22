import { requireBusiness } from "@/lib/current-business";
import { supabaseServer } from "@/lib/supabase/server";
import { since } from "@/lib/format";
import type { Staff } from "@/lib/types";
import { addStaff, resetPin, toggleStaff } from "./actions";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const { business } = await requireBusiness();
  const supabase = await supabaseServer();

  const [{ data: staffRows }, { data: devices }, { data: counts }] = await Promise.all([
    supabase.from("staff").select("id, business_id, name, active, created_at").eq("business_id", business.id).order("created_at"),
    supabase.from("till_devices").select("*").eq("business_id", business.id).order("last_seen_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("staff_id")
      .eq("business_id", business.id)
      .gt("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
  ]);

  const staff = (staffRows ?? []) as Staff[];
  const perStaff = new Map<string, number>();
  for (const row of counts ?? []) {
    const id = (row as { staff_id: string | null }).staff_id;
    if (id) perStaff.set(id, (perStaff.get(id) ?? 0) + 1);
  }

  const tillUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/till?shop=${business.slug}`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div>
          <h1 className="page-title">Staff & till</h1>
          <p className="page-lede">
            Cashiers sign in to the till with a 4-digit PIN. Every sale is attributed to whoever was
            signed in, which is what makes the fraud numbers trustworthy.
          </p>
        </div>

        <div className="card divide-y divide-black/[0.05]">
          {staff.length === 0 && (
            <p className="px-5 py-16 text-center text-sm text-ink-mute">No staff yet.</p>
          )}
          {staff.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  {s.name}
                  {!s.active && <span className="chip bg-canvas text-ink-mute">Disabled</span>}
                </div>
                <div className="mt-0.5 text-xs text-ink-mute">
                  {perStaff.get(s.id) ?? 0} transactions in 30 days · added {since(s.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <form action={resetPin} className="flex gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    name="pin"
                    inputMode="numeric"
                    pattern="\d{4}"
                    maxLength={4}
                    placeholder="New PIN"
                    className="input w-28 text-center tracking-[0.3em]"
                  />
                  <button className="btn-ghost h-11 px-3 text-xs">Reset</button>
                </form>
                <form action={toggleStaff}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={String(!s.active)} />
                  <button className={s.active ? "btn-danger h-11 px-3 text-xs" : "btn-ghost h-11 px-3 text-xs"}>
                    {s.active ? "Disable" : "Enable"}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h3 className="section-title">Till devices</h3>
          {(devices ?? []).length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-mute">
              No device has signed in yet. Open <span className="font-mono text-ink">{tillUrl}</span> on the
              counter tablet and add it to the home screen.
            </p>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {(devices ?? []).map((d) => (
                <li key={(d as { id: string }).id} className="flex justify-between gap-4">
                  <span className="font-mono text-xs">
                    {(d as { device_id: string }).device_id.slice(0, 8)}…
                  </span>
                  <span className="text-ink-mute">
                    last seen {since((d as { last_seen_at: string }).last_seen_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <form action={addStaff} className="card space-y-4 p-6">
          <h2 className="section-title">Add a cashier</h2>
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" required className="input" placeholder="Sarah" />
          </div>
          <div>
            <label className="label" htmlFor="pin">
              4-digit PIN
            </label>
            <input
              id="pin"
              name="pin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              className="input text-center tracking-[0.4em]"
              placeholder="••••"
            />
            <p className="mt-1.5 text-xs text-ink-mute">
              Give each person their own. Shared PINs make theft untraceable.
            </p>
          </div>
          <button className="btn-primary w-full">Add cashier</button>
        </form>

        <div className="card p-6">
          <h3 className="section-title">Till link</h3>
          <p className="mt-3 break-all rounded-lg bg-canvas px-3 py-2.5 font-mono text-xs">
            {tillUrl}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-mute">
            Open it in Chrome on the counter tablet, then "Add to home screen". It keeps working
            without internet.
          </p>
        </div>
      </div>
    </div>
  );
}
