import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Mint a fresh redemption code for the card holder. The long card_token in the
 * URL is the only credential — it never appears in the till, in the dashboard
 * list, or in a WhatsApp message body other than the customer's own link.
 */
export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string" || token.length < 24) {
    return NextResponse.json({ error: "Invalid card." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: customer } = await admin
    .from("customers")
    .select("id, blocked")
    .eq("card_token", token)
    .maybeSingle();

  if (!customer) return NextResponse.json({ error: "Invalid card." }, { status: 404 });
  if (customer.blocked) return NextResponse.json({ error: "This card is blocked." }, { status: 403 });

  const { data, error } = await admin.rpc("rotate_redeem_code", {
    p_customer: customer.id,
    p_ttl_minutes: 10,
  });
  if (error) return NextResponse.json({ error: "Could not generate a code." }, { status: 500 });

  return NextResponse.json(data);
}
