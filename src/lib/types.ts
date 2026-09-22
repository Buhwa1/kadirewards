export type Business = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  country: string;
  timezone: string;
  logo_url: string | null;
  brand_color: string;
  plan: "starter" | "growth" | "chain";
  whatsapp_mode: "shared" | "own" | "off";
  whatsapp_sender: string | null;
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string;
  paid_through: string | null;
  billing_phone: string | null;
  created_at: string;
};

export type Program = {
  id: string;
  business_id: string;
  name: string;
  type: "points" | "stamps";
  points_per_currency: number;
  stamps_required: number;
  stamp_min_spend: number;
  points_expire_days: number | null;
  award_cooldown_minutes: number;
  max_awards_per_day: number;
  max_award_amount: number | null;
  welcome_bonus: number;
  birthday_bonus: number;
  referral_bonus_referrer: number;
  referral_bonus_referee: number;
  notify_receipt: boolean;
  notify_redeem: boolean;
  notify_milestone: boolean;
  notify_birthday: boolean;
  notify_referral: boolean;
  milestone_points_gap: number;
  milestone_stamps_gap: number;
  milestone_cooldown_days: number;
  active: boolean;
};

export type Tier = {
  id: string;
  business_id: string;
  name: string;
  min_points_lifetime: number;
  multiplier: number;
  color: string;
  sort: number;
};

export type Customer = {
  id: string;
  business_id: string;
  phone: string | null;
  card_code: string;
  card_token?: string;
  name: string | null;
  birthday: string | null;
  redeem_code: string | null;
  redeem_code_expires_at: string | null;
  points_balance: number;
  points_lifetime: number;
  stamps: number;
  tier_id: string | null;
  referral_code: string;
  referred_by: string | null;
  whatsapp_opt_in: boolean;
  blocked: boolean;
  visits: number;
  total_spend: number;
  first_visit_at: string | null;
  last_visit_at: string | null;
  created_at: string;
};

export type Reward = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  cost_points: number;
  cost_stamps: number;
  cash_value: number | null;
  stock: number | null;
  per_customer_limit: number | null;
  active: boolean;
  expires_at: string | null;
  sort: number;
};

export type Txn = {
  id: string;
  business_id: string;
  customer_id: string;
  staff_id: string | null;
  kind: "award" | "redeem" | "bonus" | "adjust" | "expire";
  points_delta: number;
  stamps_delta: number;
  amount: number;
  reward_id: string | null;
  multiplier: number;
  channel: string;
  note: string | null;
  device_id: string | null;
  occurred_at: string;
  created_at: string;
};

export type Staff = {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type Stats = {
  customers: number;
  new_customers: number;
  active_30d: number;
  lapsed_60d: number;
  visits: number;
  revenue: number;
  repeat_rate: number;
  points_outstanding: number;
  redemptions: number;
  messages_30d: number;
  messages_marketing_30d: number;
  messages_manual_30d: number;
  messages_queued: number;
  daily: { day: string; visits: number; revenue: number }[];
};

/** One queued sale on the till, held in IndexedDB until the network returns. */
export type QueuedAward = {
  idem: string;
  identifier: string;
  amount: number;
  name?: string;
  referral?: string;
  occurred_at: string;
  device_id: string;
  status: "pending" | "syncing" | "failed";
  error?: string;
  attempts: number;
};
