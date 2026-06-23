export type Tariff = {
  id: string;
  name: string;
  price: number;
  period_months: number;
  is_active: boolean;
  created_at: string;
};

export type GiftStatus = "pending" | "approved" | "rejected";

export type GiftApplication = {
  id: string;
  tariff_id: string;
  status: GiftStatus;
  is_activated: boolean;
  activation_code: string | null;
  activated_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type Purchase = {
  id: string;
  tariff_id: string;
  amount: number;
  created_at: string;
};

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatPeriod(months: number): string {
  return `${months} ${months === 1 ? "month" : "months"}`;
}
