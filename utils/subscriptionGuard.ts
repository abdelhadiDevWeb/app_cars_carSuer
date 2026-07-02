/** Response shape from GET /api/abonnement/my-subscription */
export type MySubscriptionResponse = {
  ok?: boolean;
  hasSubscription?: boolean;
  subscription?: { date_end?: string | null } | null;
};

/**
 * True only when the API returned an active subscription still within its window.
 */
export function hasActiveSubscription(
  data: MySubscriptionResponse | null | undefined,
  now = Date.now(),
): boolean {
  if (!data?.ok || !data.hasSubscription || !data.subscription?.date_end) {
    return false;
  }
  const end = new Date(data.subscription.date_end).getTime();
  return Number.isFinite(end) && end > now;
}

/**
 * Show "subscription expired" only when we have a real end date in the past.
 * `hasSubscription: false` alone means "no active plan" (new user / never subscribed) — not expired.
 */
export function shouldShowSubscriptionExpiredModal(
  data: MySubscriptionResponse | null | undefined,
  now = Date.now(),
): boolean {
  if (!data?.ok || !data.subscription?.date_end) {
    return false;
  }
  const end = new Date(data.subscription.date_end).getTime();
  return Number.isFinite(end) && end <= now;
}
