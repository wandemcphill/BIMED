import type { Metadata } from 'next';
import Header from '@/components/Header';
import AdminForgotPassword from '@/components/AdminForgotPassword';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Reset admin password',
  description: 'Request a password reset link for the Bimed recruitment portal admin account',
  robots: { index: false, follow: false },
};

export default function AdminForgotPasswordPage() {
  return (
    <>
      <Header />
      <AdminForgotPassword />
    </>
  );
}
