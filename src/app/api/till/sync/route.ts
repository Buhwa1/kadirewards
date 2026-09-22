import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readTillSession } from "@/lib/till-session";
import { humanError, ERRORS } from "@/lib/format";

/**
 * Drain the till's offline queue. Each item carries its own idempotency key,
 * so a queue that was half-sent before the connection dropped replays safely.
 *
 * A "permanent" failure is one the rules rejected (cooldown, daily cap, unknown
 * card). Retrying those forever would be noise, so the till surfaces them to
 * the cashier instead. Anything else stays queued.
 */
const PERMANENT = Object.keys(ERRORS);

export async function POST(req: Request) {
  const session = await readTillSession();
  if (!session) return NextResponse.json({ error: "Till locked." }, { status: 401 });

  const { items } = (await req.json().catch(() => ({ items: [] }))) as {
    items: {
      idem: string;
      identifier: string;
      amount: number;
      name?: string;
      referral?: string;
      occurred_at: string;
    }[];
  };

  const admin = supabaseAdmin();
  const results: { idem: string; ok: boolean; error?: string; permanent?: boolean; data?: unknown }[] = [];

  // sequential on purpose: the cooldown rule is order-sensitive
  for (const item of items.slice(0, 200)) {
    const { data, error } = await admin.rpc("award", {
      p_business: session.business_id,
      p_identifier: item.identifier,
      p_amount: item.amount,
      p_idem: item.idem,
      p_staff: session.staff_id,
      p_device: session.device_id,
      p_occurred_at: item.occurred_at,
      p_channel: "till",
      p_name: item.name ?? null,
      p_referral: item.referral ?? null,
    });

    if (error) {
      const permanent = PERMANENT.some((code) => error.message.includes(code));
      results.push({ idem: item.idem, ok: false, error: humanError(error.message), permanent });
    } else {
      results.push({ idem: item.idem, ok: true, data });
    }
  }

  await admin
    .from("till_devices")
    .upsert(
      {
        business_id: session.business_id,
        device_id: session.device_id,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "business_id,device_id" }
    );

  return NextResponse.json({ results });
}
