import type { Metadata } from 'next';
import AdminDocumentEditor from '@/components/AdminDocumentEditor';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Document Editor',
  description: 'Edit issued contract, job description and handbook wording',
};

export default function AdminDocumentsPage() {
  return (
    <main className="wrap">
      <AdminDocumentEditor />
    </main>
  );
}
