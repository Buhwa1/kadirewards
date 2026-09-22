/**
 * Authorises the two scheduled routes (/api/messages/drain, /api/jobs/daily).
 *
 * Accepts either:
 *  - `Authorization: Bearer $JOB_SECRET` — what you send from cron-job.org,
 *    GitHub Actions, a crontab, or curl by hand.
 *  - `Authorization: Bearer $CRON_SECRET` — what Vercel Cron sends by itself
 *    when CRON_SECRET is set as an environment variable.
 *
 * Both routes also answer GET, because Vercel Cron only issues GET requests.
 */
export function authorizeJob(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;

  const accepted = [process.env.JOB_SECRET, process.env.CRON_SECRET].filter(
    (s): s is string => Boolean(s && s.length >= 8)
  );

  return accepted.some((secret) => timingSafeEqual(token, secret));
}

/** Constant-time compare, so a wrong secret can't be guessed a byte at a time. */
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
