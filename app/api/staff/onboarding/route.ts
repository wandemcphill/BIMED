import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStaffSession } from '@/lib/staff-auth';

export async function GET(request: NextRequest) {
  const session = await getStaffSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const client = db();
  const { data: staff, error: staffError } = await client
    .from('recruitment_staff')
    .select('id,bimed_id,full_name,application_id,status')
    .eq('id', session.staff_id)
    .maybeSingle();

  if (staffError) return NextResponse.json({ error: 'Unable to load your onboarding record.' }, { status: 500 });
  if (!staff) return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });

  if (!staff.application_id) {
    return NextResponse.json({
      staff: { id: staff.id, bimed_id: staff.bimed_id, full_name: staff.full_name, status: staff.status },
      ready: false,
      items: [],
      missing: [],
      unavailable: true,
    });
  }

  const { data: application, error: applicationError } = await client
    .from('recruitment_applications')
    .select('id,full_name,living_in_ireland,role_applied')
    .eq('id', staff.application_id)
    .maybeSingle();

  if (applicationError) return NextResponse.json({ error: 'Unable to load your onboarding record.' }, { status: 500 });
  if (!application) return NextResponse.json({ error: 'Linked recruitment record not found.' }, { status: 404 });

  const { data: items, error: itemError } = await client
    .from('recruitment_onboarding_checklist')
    .select('id,application_id,item_key,title,description,required,status,completed_at,completed_by,notes,created_at,updated_at')
    .eq('application_id', application.id)
    .order('created_at', { ascending: true });

  if (itemError) return NextResponse.json({ error: 'Unable to load your onboarding checklist.' }, { status: 500 });

  const checklist = items || [];
  const required = checklist.filter((item) => item.required);
  const incomplete = required.filter((item) => item.status !== 'completed' && item.status !== 'waived');

  return NextResponse.json({
    staff: { id: staff.id, bimed_id: staff.bimed_id, full_name: staff.full_name, status: staff.status },
    application: { id: application.id, full_name: application.full_name, role_applied: application.role_applied },
    ready: incomplete.length === 0,
    items: checklist,
    missing: incomplete.map((item) => ({ item_key: item.item_key, title: item.title })),
    progress: required.length ? Math.round(((required.length - incomplete.length) / required.length) * 100) : 0,
  });
}
