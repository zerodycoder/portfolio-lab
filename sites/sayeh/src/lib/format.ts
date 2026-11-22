export const money = (n: number): string => `$${n.toFixed(2).replace(/\.00$/, '')}`;

export const pad = (n: number): string => String(n).padStart(2, '0');

export const clock = (minutes: number): string => `${pad(Math.floor(minutes / 60) % 24)}:${pad(Math.floor(minutes % 60))}`;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export const dayName = (d: Date): string => DAYS[d.getDay()];
export const shortDate = (d: Date): string => `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const longDate = (d: Date): string => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** We roast on Mondays and Thursdays and ship the same afternoon; orders after noon wait for the next roast. */
export function nextRoast(from = new Date()): Date {
  const d = new Date(from);
  for (let i = 0; i < 8; i++) {
    const day = d.getDay();
    if ((day === 1 || day === 4) && (i > 0 || d.getHours() < 12)) {
      d.setHours(9, 0, 0, 0);
      return d;
    }
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

export const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

/** Business days for delivery after the roast (skipping weekends). */
export function delivered(roast: Date, businessDays: number): Date {
  const d = new Date(roast);
  let left = businessDays;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
