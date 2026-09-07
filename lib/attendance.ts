export const CLOCK_IN_EARLY_MINUTES = 120;

export function isValidAttendanceWindow(startAt: string, endAt: string, now = new Date()) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const current = now.getTime();
  if (![start, end, current].every(Number.isFinite)) return false;
  return current >= start - CLOCK_IN_EARLY_MINUTES * 60_000 && current <= end;
}

export function attendanceDurationMinutes(clockInAt: string, clockOutAt: string, breakMinutes = 0) {
  const start = new Date(clockInAt).getTime();
  const end = new Date(clockOutAt).getTime();
  if (![start, end].every(Number.isFinite) || end <= start) return 0;
  const breaks = Number.isFinite(Number(breakMinutes)) ? Math.max(0, Number(breakMinutes)) : 0;
  return Math.max(0, Math.round((end - start) / 60_000) - breaks);
}

export function isValidBreakMinutes(value: unknown) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 720;
}
