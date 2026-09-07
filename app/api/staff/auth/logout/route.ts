import { NextRequest, NextResponse } from 'next/server';
import { clearStaffSessionCookie } from '@/lib/staff-auth';

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  clearStaffSessionCookie(response);
  return response;
}
