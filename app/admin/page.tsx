import Header from '@/components/Header';
import AdminDashboard from '@/components/AdminDashboard';

export default function AdminPage() {
  return (
    <>
      <Header />
      <div style={{ padding: '12px 5vw 0', background: '#f7f9fc' }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <a href="/admin/staff" style={{ padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', textDecoration: 'none', fontWeight: 800 }}>
            Workforce Staff
          </a>
          <a href="/admin/messages" style={{ padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', textDecoration: 'none', fontWeight: 800 }}>
            BIMED Messages
          </a>
          <a href="/admin/permit" style={{ padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', textDecoration: 'none', fontWeight: 800 }}>
            Overseas permits
          </a>
          <a href="/admin/staff/new" style={{ padding: '9px 12px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>
            Create internal staff
          </a>
        </div>
      </div>
      <AdminDashboard />
    </>
  );
}
