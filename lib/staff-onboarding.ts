import type { SupabaseClient } from '@supabase/supabase-js';

export type BimedStaffOnboardingAudience = 'local_staff' | 'international_staff' | 'clinical_staff';

type ApplicationForStaffOnboarding = {
  living_in_ireland?: string | null;
  role_applied?: string | null;
};

type TaskSeed = {
  task_key: string;
  category: string;
  title: string;
  description: string;
  required: boolean;
  acknowledgement_required: boolean;
  sort_order: number;
  document_path?: string;
};

export function inferBimedStaffOnboardingAudience(application: ApplicationForStaffOnboarding): BimedStaffOnboardingAudience {
  const role = (application.role_applied || '').toLowerCase();
  if (role.includes('physio')) return 'clinical_staff';
  return application.living_in_ireland === 'No' ? 'international_staff' : 'local_staff';
}

function commonTasks(): TaskSeed[] {
  return [
    {
      task_key: 'signed_employment_contract',
      category: 'Employment',
      title: 'Signed employment contract',
      description: 'Review your signed BIMED employment contract and confirm that you have retained a copy for your records.',
      required: true,
      acknowledgement_required: true,
      sort_order: 10,
      document_path: '/staff/documents/contract',
    },
    {
      task_key: 'employee_handbook',
      category: 'Handbook',
      title: 'Employee handbook',
      description: 'Read the current BIMED employee handbook and acknowledge that you have reviewed the workplace guidance.',
      required: true,
      acknowledgement_required: true,
      sort_order: 20,
      document_path: '/documents/employee-handbook',
    },
    {
      task_key: 'role_job_description',
      category: 'Role',
      title: 'Role and job description',
      description: 'Review the current job description for your BIMED role and confirm that you understand the role expectations.',
      required: true,
      acknowledgement_required: true,
      sort_order: 30,
    },
    {
      task_key: 'staff_portal_orientation',
      category: 'Workforce',
      title: 'Staff Portal orientation',
      description: 'Review Messages, Rota, Attendance, Payslips, Profile, Notifications and the support tools available in your Staff Portal.',
      required: true,
      acknowledgement_required: true,
      sort_order: 40,
      document_path: '/staff',
    },
    {
      task_key: 'safeguarding_and_escalation',
      category: 'Training',
      title: 'Safeguarding and escalation',
      description: 'Review BIMED safeguarding, incident reporting and escalation guidance and confirm that you understand where to raise concerns.',
      required: true,
      acknowledgement_required: true,
      sort_order: 50,
      document_path: '/staff/help',
    },
    {
      task_key: 'support_and_emergency_contacts',
      category: 'Support',
      title: 'Support and emergency contacts',
      description: 'Confirm that you know how to contact BIMED Admin / HR and where to find urgent workplace support.',
      required: true,
      acknowledgement_required: true,
      sort_order: 60,
      document_path: '/staff/help',
    },
  ];
}

export function buildBimedStaffOnboardingTasks(application: ApplicationForStaffOnboarding): TaskSeed[] {
  const tasks = commonTasks();
  if (application.living_in_ireland === 'No') {
    tasks.push({
      task_key: 'international_relocation',
      category: 'Relocation',
      title: 'Overseas relocation guidance',
      description: 'Read the BIMED overseas relocation, accommodation, permit and travel guidance that applies to your recruitment pathway.',
      required: true,
      acknowledgement_required: true,
      sort_order: 70,
      document_path: '/staff/relocation',
    });
    tasks.push({
      task_key: 'employment_permit_workspace',
      category: 'Immigration',
      title: 'Employment permit and sponsorship workspace',
      description: 'Review your current permit/sponsorship workspace and understand which actions are controlled by BIMED and which require your response.',
      required: true,
      acknowledgement_required: true,
      sort_order: 80,
      document_path: '/staff/permit',
    });
  }
  if ((application.role_applied || '').toLowerCase().includes('physio')) {
    tasks.push({
      task_key: 'professional_registration',
      category: 'Professional',
      title: 'Professional registration pathway',
      description: 'Review the professional registration and role-specific requirements recorded for your Physiotherapist pathway.',
      required: true,
      acknowledgement_required: false,
      sort_order: 90,
    });
  }
  return tasks;
}

export async function ensureBimedStaffOnboardingPackage(
  client: SupabaseClient,
  staffId: string,
  application: ApplicationForStaffOnboarding,
) {
  const audience = inferBimedStaffOnboardingAudience(application);
  const title = audience === 'international_staff'
    ? 'International Staff Onboarding Centre'
    : audience === 'clinical_staff'
      ? 'Clinical Staff Onboarding Centre'
      : 'BIMED Staff Onboarding Centre';

  const { data: packageRow, error: packageError } = await client
    .from('recruitment_staff_onboarding_packages')
    .upsert({
      staff_id: staffId,
      audience,
      title,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'staff_id' })
    .select('id,staff_id,audience,title,status,assigned_at,completed_at,created_at,updated_at')
    .single();
  if (packageError || !packageRow) throw packageError || new Error('Unable to create staff onboarding package.');

  const tasks = buildBimedStaffOnboardingTasks(application).map((task) => ({
    package_id: packageRow.id,
    ...task,
  }));

  const { error: taskError } = await client
    .from('recruitment_staff_onboarding_tasks')
    .upsert(tasks, { onConflict: 'package_id,task_key', ignoreDuplicates: true });
  if (taskError) throw taskError;

  return packageRow;
}

export async function getBimedStaffOnboardingPackage(
  client: SupabaseClient,
  staffId: string,
) {
  const { data: packageRow, error: packageError } = await client
    .from('recruitment_staff_onboarding_packages')
    .select('id,staff_id,audience,title,status,assigned_at,completed_at,created_at,updated_at')
    .eq('staff_id', staffId)
    .maybeSingle();
  if (packageError) throw packageError;
  if (!packageRow) return null;

  const { data: tasks, error: taskError } = await client
    .from('recruitment_staff_onboarding_tasks')
    .select('id,package_id,task_key,category,title,description,required,status,acknowledgement_required,acknowledged_at,completed_at,document_path,notes,sort_order')
    .eq('package_id', packageRow.id)
    .order('sort_order', { ascending: true });
  if (taskError) throw taskError;

  const required = (tasks || []).filter((task) => task.required);
  const done = required.filter((task) =>
    (task.status === 'completed' || task.status === 'waived') &&
    (!task.acknowledgement_required || Boolean(task.acknowledged_at))
  ).length;

  return {
    package: packageRow,
    tasks: tasks || [],
    progress: required.length ? Math.round((done / required.length) * 100) : 100,
  };
}
