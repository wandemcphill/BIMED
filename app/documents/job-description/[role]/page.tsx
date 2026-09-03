import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PolicyDocument from '@/components/PolicyDocument';
import { getJobDescriptionTemplate, jobDescriptionTemplates } from '@/lib/document-templates';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ role: string }>;
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

export default async function JobDescriptionPage({ params }: PageProps) {
  const { role } = await params;
  const template = getJobDescriptionTemplate(role);
  if (!template) {
    notFound();
  }

  return <PolicyDocument template={template} />;
}
