import type { Metadata } from 'next';
import PolicyDocument from '@/components/PolicyDocument';
import { employeeHandbookTemplate } from '@/lib/document-templates';
import { getDocumentOverride, mergeDocumentTemplate } from '@/lib/document-overrides';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Employee Handbook',
  description: 'Print-ready employee handbook for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

export default async function EmployeeHandbookPage() {
  let template = employeeHandbookTemplate;
  try {
    const override = await getDocumentOverride('handbook', null);
    template = mergeDocumentTemplate(employeeHandbookTemplate, override);
  } catch {
    // Fall back to the code-defined handbook if the override lookup fails.
  }

  return <PolicyDocument template={template} />;
}
