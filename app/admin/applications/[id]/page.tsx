import Header from '@/components/Header';
import AdminApplicationDetail from '@/components/AdminApplicationDetail';
import AdminVerificationPanel from '@/components/AdminVerificationPanel';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ApplicationPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <>
      <Header />
      <main className="wrap">
        <AdminVerificationPanel applicationId={id} />
        <AdminApplicationDetail applicationId={id} />
      </main>
    </>
  );
}
