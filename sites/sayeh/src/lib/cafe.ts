import { clock } from './format';

/** Opening hours in Lisbon time, minutes from midnight; index 0 is Sunday. */
export const HOURS: { day: string; open: number; close: number }[] = [
  { day: 'Sunday', open: 9 * 60, close: 17 * 60 },
  { day: 'Monday', open: 7 * 60 + 30, close: 19 * 60 },
  { day: 'Tuesday', open: 7 * 60 + 30, close: 19 * 60 },
  { day: 'Wednesday', open: 7 * 60 + 30, close: 19 * 60 },
  { day: 'Thursday', open: 7 * 60 + 30, close: 19 * 60 },
  { day: 'Friday', open: 7 * 60 + 30, close: 22 * 60 },
  { day: 'Saturday', open: 8 * 60 + 30, close: 22 * 60 },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The current day and minute in Lisbon, whatever the visitor's time zone. */
export function lisbonNow(at = new Date()): { day: number; minutes: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '0';
  const day = WEEKDAYS.indexOf(get('weekday'));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { day: day < 0 ? at.getDay() : day, minutes, label: clock(minutes) };
}

export type CafeStatus = { open: boolean; line: string; local: string; closesIn?: number };

export function cafeStatus(at = new Date()): CafeStatus {
  const now = lisbonNow(at);
  const today = HOURS[now.day];
  const local = `${now.label} in Lisbon`;
  if (now.minutes >= today.open && now.minutes < today.close) {
    const left = today.close - now.minutes;
    const soon = left <= 60 ? ` · closing in ${left} min` : '';
    return { open: true, line: `Open now, until ${clock(today.close)}${soon}`, local, closesIn: left };
  }
  if (now.minutes < today.open) return { open: false, line: `Closed · opens at ${clock(today.open)}`, local };
  const next = HOURS[(now.day + 1) % 7];
  return { open: false, line: `Closed · opens tomorrow at ${clock(next.open)}`, local };
}

export type MenuItem = { name: string; note: string; price: number };

/** What the bar pours, by time of day (Lisbon). */
export const MENU: { id: 'morning' | 'day' | 'evening'; label: string; from: number; to: number; items: MenuItem[] }[] = [
  {
    id: 'morning',
    label: 'Morning',
    from: 0,
    to: 11 * 60 + 30,
    items: [
      { name: 'Espresso', note: 'Under the Cedar', price: 1.6 },
      { name: 'Cortado', note: 'Equal parts espresso and milk', price: 2.4 },
      { name: 'Flat white', note: 'Double ristretto, silky milk', price: 3.2 },
      { name: 'Filter of the day', note: 'Hambela Shade, V60', price: 3.5 },
      { name: 'Pastel de nata', note: 'From the bakery next door, warm', price: 1.4 },
      { name: 'Toast', note: 'Sourdough, tomato, olive oil, salt', price: 4.5 },
    ],
  },
  {
    id: 'day',
    label: 'Afternoon',
    from: 11 * 60 + 30,
    to: 17 * 60,
    items: [
      { name: 'Iced filter', note: 'Karii Hill, flash-brewed over ice', price: 4 },
      { name: 'Cappuccino', note: 'The cup on our home page', price: 3 },
      { name: 'Affogato', note: 'Espresso over vanilla gelato', price: 4.5 },
      { name: 'Espresso tonic', note: 'With an orange peel', price: 4.2 },
      { name: 'Orange cake', note: 'Olive oil, almond', price: 3.8 },
    ],
  },
  {
    id: 'evening',
    label: 'Evening',
    from: 17 * 60,
    to: 24 * 60,
    items: [
      { name: 'Night Shade pour-over', note: 'Decaf, caramel and red berries', price: 3.5 },
      { name: 'Decaf flat white', note: 'All the comfort, none of the buzz', price: 3.2 },
      { name: 'Cascara soda', note: 'Coffee-cherry tea, sparkling', price: 3.8 },
      { name: 'Affogato', note: 'Night Shade over vanilla', price: 4.5 },
      { name: 'Cheese plate', note: 'Azeitão, quince, bread', price: 9 },
    ],
  },
];

export const menuAt = (minutes: number): (typeof MENU)[number] => MENU.find((m) => minutes >= m.from && minutes < m.to) ?? MENU[0];
