import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Flutterwave calls this when the owner approves (or declines) the MoMo prompt. */
export async function POST(req: Request) {
  const signature = req.headers.get("verif-hash");
  if (!process.env.FLW_WEBHOOK_HASH || signature !== process.env.FLW_WEBHOOK_HASH) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const reference: string | undefined = payload?.data?.tx_ref ?? payload?.txRef;
  const status: string = String(payload?.data?.status ?? payload?.status ?? "").toLowerCase();
  if (!reference) return NextResponse.json({ ok: true });

  const admin = supabaseAdmin();
  const { data: event } = await admin
    .from("subscription_events")
    .select("business_id")
    .eq("reference", reference)
    .maybeSingle();

  await admin
    .from("subscription_events")
    .update({ status, raw: payload })
    .eq("reference", reference);

  if (event?.business_id && (status === "successful" || status === "success")) {
    const paidThrough = new Date();
    paidThrough.setMonth(paidThrough.getMonth() + 1);
    await admin
      .from("businesses")
      .update({ subscription_status: "active", paid_through: paidThrough.toISOString() })
      .eq("id", event.business_id);
  }

  return NextResponse.json({ ok: true });
}
