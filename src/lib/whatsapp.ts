import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WhatsApp sending.
 *
 * Two things make this more involved than "POST some text":
 *
 * 1. Meta only allows free-form text inside a 24-hour window opened by the
 *    customer messaging the business first. Everything Kadi sends is
 *    business-initiated, so it must go out as a pre-approved template.
 *
 * 2. Which number a shop sends from depends on the plan:
 *      - Option A (shared): nothing in business_whatsapp; the platform-wide
 *        credentials in the environment are used and every shop sends from
 *        your number. Meta bills you.
 *      - Option B (own): the shop connected their own WhatsApp Business
 *        account, so their row holds the sender and their own template names.
 *        Meta bills them.
 *    Same code path either way — resolveSender() just returns different values.
 */

export type MessageKind = "receipt" | "redeem" | "milestone" | "birthday" | "referral" | "broadcast";

export type Sender = {
  phoneNumberId: string;
  token: string;
  lang: string;
  templates: Partial<Record<MessageKind, string>>;
  source: "own" | "shared";
};

const ENV_TEMPLATES: Partial<Record<MessageKind, string | undefined>> = {
  receipt: process.env.WHATSAPP_TEMPLATE_RECEIPT,
  milestone: process.env.WHATSAPP_TEMPLATE_MILESTONE,
  birthday: process.env.WHATSAPP_TEMPLATE_BIRTHDAY,
  referral: process.env.WHATSAPP_TEMPLATE_REFERRAL,
  broadcast: process.env.WHATSAPP_TEMPLATE_BROADCAST,
};

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => !!v)) as T;
}

/**
 * Work out who a given business sends as. Requires a service-role client —
 * business_whatsapp has RLS on and no policy, so nothing else can read it.
 */
export async function resolveSender(
  admin: SupabaseClient,
  businessId: string
): Promise<Sender | null> {
  const { data } = await admin
    .from("business_whatsapp")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (data?.phone_number_id && data?.access_token) {
    return {
      phoneNumberId: data.phone_number_id as string,
      token: data.access_token as string,
      lang: (data.template_lang as string) ?? "en",
      source: "own",
      templates: clean({
        receipt: data.template_receipt as string,
        milestone: data.template_milestone as string,
        birthday: data.template_birthday as string,
        referral: data.template_referral as string,
        broadcast: data.template_broadcast as string,
      }),
    };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) return null;

  return {
    phoneNumberId,
    token,
    lang: process.env.WHATSAPP_TEMPLATE_LANG ?? "en",
    source: "shared",
    templates: clean(ENV_TEMPLATES) as Partial<Record<MessageKind, string>>,
  };
}

export type SendResult =
  | { ok: true; providerId?: string }
  | { ok: false; retry: boolean; error: string };

/**
 * Send one message. Uses the approved template for its kind when one is
 * configured; falls back to plain text, which only lands inside an open
 * 24-hour service window (useful in development, and for a shop that replies
 * to inbound messages).
 */
export async function sendWhatsApp(
  sender: Sender,
  msg: { to: string; kind: MessageKind; body: string; params: string[] }
): Promise<SendResult> {
  const template = sender.templates[msg.kind];

  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: msg.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: template,
          language: { code: sender.lang },
          components: msg.params.length
            ? [
                {
                  type: "body",
                  parameters: msg.params.map((text) => ({ type: "text", text })),
                },
              ]
            : [],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: msg.to.replace(/^\+/, ""),
        type: "text",
        text: { preview_url: true, body: msg.body },
      };

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/v21.0/${sender.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sender.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // network trouble — keep it queued and try again next drain
    return { ok: false, retry: true, error: e instanceof Error ? e.message : "network error" };
  }

  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number };
    messages?: { id?: string }[];
  };

  if (!res.ok) {
    // 4xx is a bad request or a bad template — retrying won't fix it.
    // 429 and 5xx are worth another go.
    const retry = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      retry,
      error: json.error?.message ?? `HTTP ${res.status}`,
    };
  }

  return { ok: true, providerId: json.messages?.[0]?.id };
}
