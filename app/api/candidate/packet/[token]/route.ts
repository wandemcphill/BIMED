import { NextRequest, NextResponse } from 'next/server';
import { getPacketAccess, getPacketDefinition } from '@/lib/document-packets';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

function sanitiseResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Response must be an object.');

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 60) throw new Error('Too many response fields.');

  const result: Record<string, unknown> = {};
  for (const [key, raw] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) throw new Error('Invalid response field.');
    if (typeof raw === 'string') {
      if (raw.length > 5000) throw new Error(`Response field ${key} is too long.`);
      result[key] = raw.trim();
    } else if (typeof raw === 'boolean' || typeof raw === 'number' || raw === null) {
      result[key] = raw;
    } else if (Array.isArray(raw) && raw.every((item) => typeof item === 'string' && item.length <= 300)) {
      result[key] = raw.slice(0, 100);
    } else if (typeof raw === 'object' && raw !== null) {
      const nested = sanitiseResponse(raw);
      result[key] = nested;
    } else {
      throw new Error(`Unsupported response value for ${key}.`);
    }
  }

  return result;
}

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const access = await getPacketAccess(token);
  if (!access) return NextResponse.json({ error: 'This private document link is invalid, expired or revoked.' }, { status: 404 });

  const packet = getPacketDefinition(access.packet_slug);
  if (!packet || !packet.candidateVisible) return NextResponse.json({ error: 'This document is not available to candidates.' }, { status: 404 });

  return NextResponse.json({
    packet: {
      slug: access.packet_slug,
      title: packet.title,
      mode: packet.mode,
      description: packet.description,
    },
    response: access.response_data || {},
    lastSavedAt: access.last_saved_at,
    completedAt: access.completed_at,
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const rateLimit = await checkRateLimit({ key: `candidate-packet:${token.slice(0, 24)}`, limit: 60, windowMs: 15 * 60 * 1000, request });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many saves. Please try again shortly.' }, { status: 429 });

  const access = await getPacketAccess(token);
  if (!access) return NextResponse.json({ error: 'This private document link is invalid, expired or revoked.' }, { status: 404 });

  const packet = getPacketDefinition(access.packet_slug);
  if (!packet || !packet.candidateVisible || packet.mode === 'reading') {
    return NextResponse.json({ error: 'This document does not require candidate input.' }, { status: 400 });
  }

  const body = await readJsonBody(request, MAX_JSON_BYTES.candidateApplication);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  let responseData: Record<string, unknown>;
  try {
    responseData = sanitiseResponse((body.data as Record<string, unknown>)?.response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid response.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('recruitment_document_packet_access')
    .update({ response_data: responseData, last_saved_at: now })
    .eq('id', access.id)
    .is('revoked_at', null)
    .select('response_data, last_saved_at, completed_at')
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Unable to save your progress.' }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const rateLimit = await checkRateLimit({ key: `candidate-packet-complete:${token.slice(0, 24)}`, limit: 15, windowMs: 15 * 60 * 1000, request });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many submissions. Please try again shortly.' }, { status: 429 });

  const access = await getPacketAccess(token);
  if (!access) return NextResponse.json({ error: 'This private document link is invalid, expired or revoked.' }, { status: 404 });

  const packet = getPacketDefinition(access.packet_slug);
  if (!packet || !packet.candidateVisible || packet.mode === 'reading') {
    return NextResponse.json({ error: 'This document cannot be submitted from this page.' }, { status: 400 });
  }

  const body = await readJsonBody(request, MAX_JSON_BYTES.candidateApplication);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  let responseData: Record<string, unknown>;
  try {
    responseData = sanitiseResponse((body.data as Record<string, unknown>)?.response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid response.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('recruitment_document_packet_access')
    .update({ response_data: responseData, last_saved_at: now, completed_at: now })
    .eq('id', access.id)
    .is('revoked_at', null)
    .select('response_data, last_saved_at, completed_at')
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Unable to submit this document.' }, { status: 500 });
  return NextResponse.json({ ok: true, ...data });
}