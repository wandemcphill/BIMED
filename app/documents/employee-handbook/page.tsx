import type { Metadata } from 'next';
import PolicyDocument from '@/components/PolicyDocument';
import { employeeHandbookTemplate } from '@/lib/document-templates';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Employee Handbook',
  description: 'Print-ready employee handbook for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

export default function EmployeeHandbookPage() {
  return <PolicyDocument template={employeeHandbookTemplate} />;
}
