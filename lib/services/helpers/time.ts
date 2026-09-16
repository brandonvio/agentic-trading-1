/** ISO timestamp for 00:00:00 UTC on the day containing `d`. */
export function startOfUtcDayIso(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** Add whole hours to a date and return ISO. */
export function addHoursIso(d: Date, hours: number): string {
  return new Date(d.getTime() + hours * 3_600_000).toISOString();
}
