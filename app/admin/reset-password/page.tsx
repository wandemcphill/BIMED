import type { Metadata } from 'next';
import Header from '@/components/Header';
import AdminResetPassword from '@/components/AdminResetPassword';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Choose a new password',
  description: 'Set a new password for the Bimed recruitment portal admin account',
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

/**
 * The reset token arrives as a query parameter and is handed straight to the client
 * component for submission. It is never logged or rendered into the page.
 */
export default async function AdminResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  return (
    <>
      <Header />
      <AdminResetPassword token={token || ''} />
    </>
  );
}
