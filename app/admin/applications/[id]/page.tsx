import Header from '@/components/Header';
import AdminApplicationDetail from '@/components/AdminApplicationDetail';

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
        <AdminApplicationDetail applicationId={id} />
      </main>
    </>
  );
}
