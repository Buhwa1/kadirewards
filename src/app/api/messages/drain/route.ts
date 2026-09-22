import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveSender, sendWhatsApp, type MessageKind, type Sender } from "@/lib/whatsapp";
import { authorizeJob } from "@/lib/job-auth";

/**
 * Drain the WhatsApp outbox. Call from cron:
 *   curl -X POST -H "Authorization: Bearer $JOB_SECRET" .../api/messages/drain
 *
 * Answers GET as well, because Vercel Cron only issues GET.
 *
 * Messages are grouped by business so each shop's sender is resolved once —
 * shops on the shared number (Option A) and shops with their own WhatsApp
 * account (Option B) drain through the same loop.
 */
export async function POST(req: Request) {
  if (!authorizeJob(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: batch } = await admin
    .from("messages")
    .select("*")
    .eq("status", "queued")
    .order("created_at")
    .limit(100);

  if (!batch?.length) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: 0, examined: 0 });
  }

  const senders = new Map<string, Sender | null>();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const m of batch) {
    const businessId = m.business_id as string;

    if (!senders.has(businessId)) {
      senders.set(businessId, await resolveSender(admin, businessId));
    }
    const sender = senders.get(businessId)!;

    // No credentials anywhere: leave it queued rather than losing it, so the
    // dashboard still shows what would have gone out.
    if (!sender) {
      skipped++;
      continue;
    }

    const result = await sendWhatsApp(sender, {
      to: m.to_phone as string,
      kind: m.kind as MessageKind,
      body: m.body as string,
      params: (m.params as string[]) ?? [],
    });

    if (result.ok) {
      sent++;
      await admin
        .from("messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_id: result.providerId ?? null,
        })
        .eq("id", m.id as string);
    } else if (result.retry) {
      skipped++;
      await admin.from("messages").update({ error: result.error }).eq("id", m.id as string);
    } else {
      failed++;
      await admin
        .from("messages")
        .update({ status: "failed", error: result.error })
        .eq("id", m.id as string);
    }
  }

  return NextResponse.json({ sent, failed, skipped, examined: batch.length });
}

export const GET = POST;
