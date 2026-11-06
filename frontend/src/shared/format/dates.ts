/**
 * Date formatting rules (Technical Specs 1.6):
 * - instants come from the API in UTC and are shown in the property's timezone;
 * - stay dates (`YYYY-MM-DD`) are property-local calendar dates and are never shifted.
 */

/** Formats a UTC instant (`2026-11-02T05:00:12Z`) in the property's IANA timezone. */
export function formatInstant(isoInstant: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(isoInstant));
}

const STAY_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats a property-local stay date (`2026-11-14`) without any timezone shift. */
export function formatStayDate(stayDate: string, locale: string): string {
  const match = STAY_DATE_PATTERN.exec(stayDate);
  if (!match) {
    throw new Error(`Invalid stay date: ${stayDate}`);
  }
  const [, year, month, day] = match;
  // Built at noon UTC and formatted in UTC, so no local timezone can move the day.
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
