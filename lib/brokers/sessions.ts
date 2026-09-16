/**
 * Trading-session helpers for the mock venues. Sessions are described in
 * US Eastern time (the convention for US equities/futures/FX desks); the
 * adapters only *flag* session state in `health()` and never reject on it.
 */

export interface EasternTime {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  hour: number;
  minute: number;
  /** Minutes since midnight ET. */
  minutesOfDay: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Breaks a UTC instant into Eastern wall-clock components (DST-aware). */
export function easternTime(at: Date): EasternTime {
  const parts = formatter.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { weekday: WEEKDAYS[get("weekday")] ?? 0, hour, minute, minutesOfDay: hour * 60 + minute };
}

/** US equity regular trading hours: Mon–Fri 09:30–16:00 ET. */
export function isEquityRth(at: Date): boolean {
  const et = easternTime(at);
  return et.weekday >= 1 && et.weekday <= 5 && et.minutesOfDay >= 570 && et.minutesOfDay < 960;
}

/** Spot FX: open Sunday 17:00 ET through Friday 17:00 ET. */
export function isFxSessionOpen(at: Date): boolean {
  const et = easternTime(at);
  if (et.weekday === 6) return false;
  if (et.weekday === 0) return et.minutesOfDay >= 1020;
  if (et.weekday === 5) return et.minutesOfDay < 1020;
  return true;
}

/** CME Globex: Sunday 18:00 ET – Friday 17:00 ET with a daily 17:00–18:00 ET maintenance halt. */
export function isFuturesSessionOpen(at: Date): boolean {
  const et = easternTime(at);
  if (et.weekday === 6) return false;
  if (et.weekday === 0) return et.minutesOfDay >= 1080;
  if (et.weekday === 5) return et.minutesOfDay < 1020;
  return et.minutesOfDay < 1020 || et.minutesOfDay >= 1080;
}
