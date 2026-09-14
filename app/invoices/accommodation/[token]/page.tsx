import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { invoiceHtml, receiptHtml, appUrl } from '@/lib/accommodation-billing';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ receipt?: string }> };

export default async function AccommodationInvoicePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { receipt: receiptMode } = await searchParams;
  const client = db();
  const { data: invoice } = await client.from('recruitment_accommodation_invoices').select('*').eq('public_token', token).maybeSingle();
  if (!invoice || invoice.status === 'cancelled') notFound();
  const { data: permit } = await client.from('recruitment_staff_permit_cases').select('staff_id').eq('id', invoice.permit_case_id).maybeSingle();
  if (!permit) notFound();
  const { data: staff } = await client.from('recruitment_staff').select('full_name,bimed_id,email').eq('id', permit.staff_id).maybeSingle();
  if (!staff) notFound();
  const { data: receipt } = await client.from('recruitment_accommodation_receipts').select('*').eq('invoice_id', invoice.id).maybeSingle();
  const publicUrl = `${appUrl()}/invoices/accommodation/${token}`;
  const html = receipt && receiptMode === '1'
    ? receiptHtml({ receipt, invoice, staff, publicUrl: `${publicUrl}?receipt=1` })
    : invoiceHtml({ invoice, staff, publicUrl });

  return <main style={{ minHeight: '100vh', background: '#eef2f5', padding: 20, fontFamily: 'Arial,sans-serif' }}>
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}><button onClick={() => window.print()} style={{ padding: '10px 14px', border: 0, borderRadius: 8, background: '#0f766e', color: '#fff', fontWeight: 800 }}>Print / Save as PDF</button>{receipt && receiptMode !== '1' && <a href={`${publicUrl}?receipt=1`} style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#334e68', textDecoration: 'none', fontWeight: 800 }}>View payment receipt</a>}</div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </main>;
}
