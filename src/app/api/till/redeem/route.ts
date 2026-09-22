import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readTillSession } from "@/lib/till-session";
import { humanError } from "@/lib/format";

export async function POST(req: Request) {
  const session = await readTillSession();
  if (!session) return NextResponse.json({ error: "Till locked." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const { data, error } = await admin.rpc("redeem", {
    p_business: session.business_id,
    p_identifier: String(body.identifier ?? ""),
    p_reward: String(body.reward_id ?? ""),
    p_code: body.code ?? null,
    p_staff: session.staff_id,
    p_device: session.device_id,
    p_override: false,
    p_idem: body.idem ?? null,
  });

  if (error) {
    return NextResponse.json({ error: humanError(error.message), code: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
