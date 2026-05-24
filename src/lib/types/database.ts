// リピトル データベース型定義

export type PlanType = "starter" | "standard" | "pro";
export type UserRole = "owner" | "staff";
export type CouponType = "discount_percent" | "discount_yen" | "free_item" | "custom";
export type CouponStatus = "active" | "used" | "expired";
export type TriggerType = "first_visit" | "nth_visit" | "days_absent" | "manual";
export type ReservationStatus = "confirmed" | "cancelled" | "completed" | "no_show";

// --- テーブル型 ---

export interface Organization {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Shop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  genre: string | null;
  plan_type: PlanType;
  organization_id: string | null;
  line_channel_id: string | null;
  line_channel_secret: string | null;
  line_channel_access_token: string | null;
  messages_sent_this_month: number;
  messages_limit: number;
  customers_limit: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  shop_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  shop_id: string;
  organization_id: string | null;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  visit_count: number;
  first_visit_at: string;
  last_visit_at: string | null;
  tags: string[];
  memo: string | null;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface VisitLog {
  id: string;
  customer_id: string;
  shop_id: string;
  organization_id: string | null;
  visited_at: string;
  staff_id: string | null;
  memo: string | null;
}

export interface CouponTemplate {
  id: string;
  shop_id: string;
  organization_id: string | null;
  title: string;
  description: string;
  coupon_type: CouponType;
  discount_value: number | null;
  image_url: string | null;
  valid_days: number;
  is_active: boolean;
  created_at: string;
}

export interface CouponIssued {
  id: string;
  template_id: string;
  customer_id: string;
  shop_id: string;
  organization_id: string | null;
  status: CouponStatus;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  coupon_code: string;
}

export interface AutoTrigger {
  id: string;
  shop_id: string;
  trigger_type: TriggerType;
  trigger_value: number;
  coupon_template_id: string;
  message_text: string;
  is_active: boolean;
  created_at: string;
}

export interface StampCard {
  id: string;
  shop_id: string;
  organization_id: string | null;
  name: string;
  total_stamps: number;
  mid_stamps: number | null;
  reward_coupon_template_id: string | null;
  mid_reward_coupon_template_id: string | null;
  min_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface CustomerStamp {
  id: string;
  stamp_card_id: string;
  customer_id: string;
  shop_id: string | null;
  current_stamps: number;
  completed_count: number;
  mid_reward_claimed: boolean;
  updated_at: string;
}

export interface MonthlyCouponLog {
  id: string;
  shop_id: string;
  customer_id: string;
  coupon_template_id: string;
  month_number: number;
  issued_at: string;
}

export interface Reservation {
  id: string;
  shop_id: string;
  organization_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  line_user_id: string | null;
  party_size: number;
  reserved_at: string;
  status: ReservationStatus;
  reminder_sent: boolean;
  memo: string | null;
  created_at: string;
}

export interface MessageLog {
  id: string;
  shop_id: string;
  organization_id: string | null;
  customer_id: string | null;
  message_type: string;
  content: string;
  sent_at: string;
  success: boolean;
  error_message: string | null;
}
