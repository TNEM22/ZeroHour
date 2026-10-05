/**
 * Calendar-correct countdown.
 *
 * Months are not a fixed number of milliseconds, so the months field is counted
 * as whole calendar months and only the remainder is divided into days, hours,
 * minutes and seconds. That is what makes "4 months 27 days" line up with what
 * a calendar actually says.
 */

export const MS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Add whole months, clamping the day: 31 Jan + 1 month is 28 Feb, not 3 Mar. */
export function addMonths(date, n) {
  const day = date.getDate();
  const d = new Date(date.getTime());
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return d;
}

const ZERO = { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

export function breakdown(now, target) {
  if (!(target > now)) return { ...ZERO, arrived: true, remaining: 0 };

  // Start from the raw month difference, then correct in both directions: the
  // day-of-month clamp means the estimate can land on either side of the truth.
  let months = (target.getFullYear() - now.getFullYear()) * 12 +
               (target.getMonth() - now.getMonth());
  if (months < 0) months = 0;
  while (months > 0 && addMonths(now, months) > target) months--;
  while (addMonths(now, months + 1) <= target) months++;

  let rest = target - addMonths(now, months);
  const days = Math.floor(rest / MS.day);
  rest -= days * MS.day;
  const hours = Math.floor(rest / MS.hour);
  rest -= hours * MS.hour;
  const minutes = Math.floor(rest / MS.minute);
  rest -= minutes * MS.minute;
  const seconds = Math.floor(rest / MS.second);

  return { months, days, hours, minutes, seconds, arrived: false, remaining: target - now };
}

export const pad2 = (n) => String(n).padStart(2, '0');

export const UNITS = ['months', 'days', 'hours', 'minutes', 'seconds'];
