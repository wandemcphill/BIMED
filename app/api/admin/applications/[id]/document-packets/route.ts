import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-session';
import { createPacketAccess, PACKETS, packetList, type PacketSlug } from '@/lib/document-packets';
import { isInternationalRoutingCandidate } from '@/lib/recruitment-config';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';
import { MAX_JSON_BYTES, readJsonBody } from '@/lib/request-validation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const { id } = await context.params;
  const client = db();
  const { data: application } = await client.from('recruitment_applications').select('id, full_name, living_in_ireland').eq('id', id).maybeSingle();
  if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  const { data: access, error } = await client.from('recruitment_document_packet_access')
    .select('id, packet_slug, created_by, issued_at, expires_at, viewed_at, revoked_at, created_at')
    .eq('application_id', id).order('issued_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load packet history.' }, { status: 500 });
  const international = isInternationalRoutingCandidate(application);
  const required = packetList(international).map((packet) => packet.slug);
  return NextResponse.json({
    application: { id: application.id, full_name: application.full_name, international },
    required,
    packets: access || [],
    packetDefinitions: PACKETS,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const body = bodyResult.data as Record<string, unknown>;
  const packetSlug = body.packet_slug;
  if (typeof packetSlug !== 'string' || !(packetSlug in PACKETS)) return NextResponse.json({ error: 'A valid packet_slug is required.' }, { status: 400 });

  const { id } = await context.params;
  const client = db();
  const { data: application } = await client.from('recruitment_applications').select('id, full_name, living_in_ireland').eq('id', id).maybeSingle();
  if (!application) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  const international = isInternationalRoutingCandidate(application);
  const packet = PACKETS[packetSlug as PacketSlug];
  if (packet.internationalOnly && !international) return NextResponse.json({ error: 'This packet is restricted to international candidates.' }, { status: 400 });

  const result = await createPacketAccess(id, packetSlug as PacketSlug, session.email);
  await recordRecruitmentAudit(client, {
    applicationId: id,
    eventType: 'candidate_packet_issued',
    actor: session.email,
    metadata: { packet_slug: packetSlug, packet_access_id: result.record.id, international, manual_issue: true },
  });
  return NextResponse.json({ packet: { slug: packetSlug, title: packet.title }, access: result.record, url: result.url });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const bodyResult = await readJsonBody(request, MAX_JSON_BYTES.admin);
  if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.error }, { status: 400 });
  const accessId = (bodyResult.data as Record<string, unknown>).access_id;
  if (typeof accessId !== 'string' || !accessId) return NextResponse.json({ error: 'access_id is required.' }, { status: 400 });
  const { id } = await context.params;
  const client = db();
  const { data, error } = await client.from('recruitment_document_packet_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', accessId).eq('application_id', id).is('revoked_at', null)
    .select('id, packet_slug, revoked_at').maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to revoke packet access.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Active packet access record not found.' }, { status: 404 });
  await recordRecruitmentAudit(client, {
    applicationId: id,
    eventType: 'candidate_packet_revoked',
    actor: session.email,
    metadata: { packet_slug: data.packet_slug, packet_access_id: data.id },
  });
  return NextResponse.json({ ok: true, access: data });
}
