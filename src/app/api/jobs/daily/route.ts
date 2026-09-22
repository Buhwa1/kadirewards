import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { authorizeJob } from "@/lib/job-auth";

/**
 * Nightly housekeeping: expire stale points, queue birthday bonuses, and flag
 * subscriptions that have run past their paid-through date.
 *   0 3 * * *  curl -X POST -H "Authorization: Bearer $JOB_SECRET" .../api/jobs/daily
 *
 * Answers GET as well, because Vercel Cron only issues GET.
 */
export async function POST(req: Request) {
  if (!authorizeJob(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.rpc("run_daily_jobs");

  const now = new Date().toISOString();
  await admin
    .from("businesses")
    .update({ subscription_status: "past_due" })
    .eq("subscription_status", "active")
    .lt("paid_through", now);

  await admin
    .from("businesses")
    .update({ subscription_status: "past_due" })
    .eq("subscription_status", "trialing")
    .lt("trial_ends_at", now);

  return NextResponse.json({ ok: !error, error: error?.message ?? null });
}

export const GET = POST;
