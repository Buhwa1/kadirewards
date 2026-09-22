import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readTillSession } from "@/lib/till-session";
import { humanError } from "@/lib/format";

export async function POST(req: Request) {
  const session = await readTillSession();
  if (!session) return NextResponse.json({ error: "Till locked." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const { data, error } = await admin.rpc("award", {
    p_business: session.business_id,
    p_identifier: String(body.identifier ?? ""),
    p_amount: Number(body.amount ?? 0),
    p_idem: body.idem ?? null,
    p_staff: session.staff_id,
    p_device: session.device_id,
    p_occurred_at: body.occurred_at ?? new Date().toISOString(),
    p_channel: "till",
    p_name: body.name ?? null,
    p_referral: body.referral ?? null,
  });

  if (error) {
    return NextResponse.json({ error: humanError(error.message), code: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
