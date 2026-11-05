const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const API_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(day, month, year) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysPerMonth[month - 1];
}

export function parseDisplayDate(value) {
  if (value === '') return '';
  const match = DISPLAY_DATE.exec(value);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!isCalendarDate(day, month, year)) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

export function formatDateForDisplay(value) {
  if (!value) return '';
  const match = API_DATE.exec(value);
  if (!match) return '';
  const [, yearText, monthText, dayText] = match;
  if (!isCalendarDate(Number(dayText), Number(monthText), Number(yearText))) return '';
  return `${dayText}/${monthText}/${yearText}`;
}
