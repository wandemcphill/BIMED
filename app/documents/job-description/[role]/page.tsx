import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PolicyDocument from '@/components/PolicyDocument';
import { jobDescriptionTemplates, getJobDescriptionTemplate } from '@/lib/document-templates';
import { resolveJobDescriptionTemplate } from '@/lib/job-description-prefill';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ applicationId?: string }>;
};

export function generateStaticParams() {
  return jobDescriptionTemplates.map((template) => ({ role: template.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { role } = await params;
  const template = getJobDescriptionTemplate(role);
  return {
    title: template ? `Bimed Healthcare | ${template.documentTitle}` : 'Bimed Healthcare | Job Description',
    description: 'Print-ready job description for Bimed Healthcare',
  };
}

export default async function JobDescriptionPage({ params, searchParams }: PageProps) {
  const { role } = await params;
  const { applicationId } = await searchParams;
  const result = await resolveJobDescriptionTemplate(role, applicationId);
  if (result.status === 'not_found') {
    notFound();
  }

  return <PolicyDocument template={result.template} />;
}
