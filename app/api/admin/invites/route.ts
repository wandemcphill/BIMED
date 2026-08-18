import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';

export async function POST(request: NextRequest) {
  if (request.headers.get('x-admin-password') !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const body = await request.json();

  if (!body.email) {
    return NextResponse.json({ error: 'Candidate email is required.' }, { status: 400 });
  }

  const token = makeToken();
  const client = db();
  const { data, error } = await client
    .from('recruitment_invites')
    .insert({
      token_hash: hashToken(token),
      candidate_email: body.email,
      candidate_name: body.name || null,
      role: body.role || null,
      expires_at: body.expiryDate || null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    invite: data,
    link: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/apply/${token}`,
  });
}
