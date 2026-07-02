import { apiRequest } from '@/utils/backend';

const CHECKOUT_FETCH_TIMEOUT_MS = 35_000;

export type SellerSponsor = {
  id?: string;
  _id: string;
  id_car: string | Record<string, unknown>;
  start_date: string;
  end_date: string;
  duration: number;
  price: number;
  status: boolean;
  payment_status?: 'pending' | 'paid' | 'failed' | 'cancelled';
};

/** Paid, active, and still within the sponsorship window (same as web dashboard). */
export function isSponsorActive(s: SellerSponsor, now: number): boolean {
  return (
    s.payment_status === 'paid' &&
    s.status === true &&
    new Date(s.end_date).getTime() > now
  );
}

export function isPendingSponsorPayment(s: SellerSponsor): boolean {
  return s.payment_status === 'pending' && s.status !== true;
}

export function isSponsorCancelled(s: SellerSponsor): boolean {
  return !s.status && !isPendingSponsorPayment(s) && s.payment_status !== 'paid';
}

export function isSponsorExpiredPaid(s: SellerSponsor, now: number): boolean {
  return (
    s.status === true &&
    s.payment_status === 'paid' &&
    new Date(s.end_date).getTime() <= now
  );
}

export function formatSponsorCountdown(
  endDate: string,
  now: number,
  expiredLabel: string,
): string {
  const diff = new Date(endDate).getTime() - now;
  if (diff <= 0) return expiredLabel;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}j`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}min`);
  return parts.join(' ');
}

export async function pollSponsorPaymentStatus(
  sponsorId: string,
  maxAttempts = 8,
  intervalMs = 1500,
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const res = await apiRequest(`/sponsor/payment/status/${sponsorId}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && data.payment_status === 'paid' && data.status) {
        return true;
      }
    } catch {
      /* retry */
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

export async function fetchSponsorCheckoutUrl(
  sponsorId: string,
  t: (key: string) => string,
): Promise<{ checkout_url?: string; already_paid?: boolean; message?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECKOUT_FETCH_TIMEOUT_MS);

  try {
    const res = await apiRequest('/sponsor/payment/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsor_id: sponsorId }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (!res.ok || data.ok !== true) {
      const errors = data.errors;
      const detail =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(errors) && typeof errors[0] === 'string'
            ? errors[0]
            : undefined;
      return {
        message:
          detail ||
          (res.status
            ? `${t('cars.sponsor.checkoutFailed')} (${res.status})`
            : t('cars.sponsor.checkoutFailed')),
      };
    }

    return {
      checkout_url: typeof data.checkout_url === 'string' ? data.checkout_url : undefined,
      already_paid: data.already_paid === true,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { message: t('cars.sponsor.checkoutTimeout') };
    }
    return { message: t('cars.sponsor.paymentConnectionError') };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifySponsorPaidStatus(sponsorId: string): Promise<boolean> {
  try {
    const res = await apiRequest(`/sponsor/payment/status/${sponsorId}`);
    const data = await res.json().catch(() => null);
    return !!(res.ok && data?.ok && data.payment_status === 'paid' && data.status);
  } catch {
    return false;
  }
}
