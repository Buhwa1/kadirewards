import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Monthly subscription in UGX. This is the only list that can move money —
 * the dashboard and the landing page are display copy and must be kept in step
 * with it by hand.
 *
 * The one-off UGX 150,000 setup fee is collected in person, not here.
 */
const PRICES: Record<string, number> = { starter: 100000, growth: 200000, chain: 350000 };

/**
 * Start a Mobile Money charge for the monthly subscription. Flutterwave's
 * mobile-money-uganda charge pushes a prompt to the owner's handset; the
 * webhook below confirms it. No card, no bank visit.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { plan } = await req.json().catch(() => ({}));
  const amount = PRICES[String(plan)];
  if (!amount) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });

  const { data: membership } = await supabase
    .from("business_members")
    .select("business:businesses(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const business = membership?.business as unknown as
    | { id: string; name: string; billing_phone: string | null; currency: string }
    | undefined;
  if (!business) return NextResponse.json({ error: "No business." }, { status: 400 });
  if (!business.billing_phone) {
    return NextResponse.json(
      { error: "Add a Mobile Money number in settings first." },
      { status: 400 }
    );
  }

  const reference = `kadi-${business.id.slice(0, 8)}-${Date.now()}`;
  const admin = supabaseAdmin();

  // Record the intent first so a webhook that beats our response still matches.
  await admin.from("subscription_events").insert({
    business_id: business.id,
    provider: "flutterwave",
    reference,
    amount,
    currency: business.currency,
    status: "initiated",
    raw: { plan },
  });
  await admin.from("businesses").update({ plan }).eq("id", business.id);

  if (!process.env.FLW_SECRET_KEY) {
    return NextResponse.json({
      ok: true,
      reference,
      message:
        "Billing keys aren't configured yet, so nothing was charged. The plan is recorded — add FLW_SECRET_KEY to go live.",
    });
  }

  const res = await fetch("https://api.flutterwave.com/v3/charges?type=mobile_money_uganda", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: reference,
      amount,
      currency: business.currency,
      email: user.email,
      phone_number: business.billing_phone.replace(/^\+/, ""),
      network: "MTN",
      fullname: business.name,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== "success") {
    await admin
      .from("subscription_events")
      .update({ status: "failed", raw: json })
      .eq("reference", reference);
    return NextResponse.json(
      { error: json?.message ?? "The payment could not be started." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    reference,
    message: "Approve the prompt on your phone to finish.",
  });
}
