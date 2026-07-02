/** Sponsor snippet attached to cars from GET /car/active */
export type PublicCarSponsor = {
  id?: string;
  start_date?: string | Date;
  end_date?: string | Date;
  duration?: number;
  price?: number;
};

/** True only while sponsorship is within its paid start/end window. */
export function isPublicCarSponsorActive(
  sponsor: PublicCarSponsor | undefined | null,
  now: number = Date.now(),
): boolean {
  if (!sponsor?.end_date) return false;

  const end = new Date(sponsor.end_date).getTime();
  if (!Number.isFinite(end) || end <= now) return false;

  if (sponsor.start_date) {
    const start = new Date(sponsor.start_date).getTime();
    if (Number.isFinite(start) && start > now) return false;
  }

  return true;
}
