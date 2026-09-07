import { describe, expect, it } from 'vitest';
import { attendanceDurationMinutes, isValidAttendanceWindow, isValidBreakMinutes } from '@/lib/attendance';

describe('attendance rules', () => {
  it('allows clock-in two hours before a shift and during the shift', () => {
    const start = new Date('2026-09-10T09:00:00.000Z');
    const end = new Date('2026-09-10T17:00:00.000Z');
    expect(isValidAttendanceWindow(start.toISOString(), end.toISOString(), new Date('2026-09-10T07:00:00.000Z'))).toBe(true);
    expect(isValidAttendanceWindow(start.toISOString(), end.toISOString(), new Date('2026-09-10T06:59:59.000Z'))).toBe(false);
    expect(isValidAttendanceWindow(start.toISOString(), end.toISOString(), new Date('2026-09-10T17:00:01.000Z'))).toBe(false);
  });

  it('calculates worked minutes after breaks', () => {
    expect(attendanceDurationMinutes('2026-09-10T09:00:00.000Z', '2026-09-10T17:30:00.000Z', 30)).toBe(480);
  });

  it('rejects invalid break values', () => {
    expect(isValidBreakMinutes(-1)).toBe(false);
    expect(isValidBreakMinutes(30.5)).toBe(false);
    expect(isValidBreakMinutes(721)).toBe(false);
    expect(isValidBreakMinutes(60)).toBe(true);
  });
});
