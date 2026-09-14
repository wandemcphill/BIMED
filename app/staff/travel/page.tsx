'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Passenger = { full_name: string; date_of_birth: string };
type TravelData = any;

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 20, boxShadow: '0 8px 28px rgba(15,23,42,.04)', marginTop: 18 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff' };
const button: React.CSSProperties = { padding: '11px 15px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900 };
const secondary: React.CSSProperties = { padding: '10px 13px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', textDecoration: 'none', fontWeight: 800 };

export default function StaffTravelPage() {
  const router = useRouter();
  const [data, setData] = useState<TravelData | null>(null);
  const [travelDate, setTravelDate] = useState('');
  const [passengers, setPassengers] = useState<Passenger[]>([{ full_name: '', date_of_birth: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const response = await fetch('/api/staff/travel', { cache: 'no-store' });
    const result = await response.json();
    if (response.status === 401) { router.replace('/staff/login'); return; }
    if (!response.ok) { setError(result.error || 'Unable to load travel planning.'); return; }
    setData(result);
    if (result.permit?.flight_travel_date) setTravelDate(result.permit.flight_travel_date);
    if (Array.isArray(result.permit?.flight_passengers) && result.permit.flight_passengers.length) setPassengers(result.permit.flight_passengers);
  }
  useEffect(() => { void load(); }, []);

  function updatePassenger(index: number, field: keyof Passenger, value: string) {
    setPassengers((items) => items.map((item, current) => current === index ? { ...item, [field]: value } : item));
  }
  async function submit() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/staff/travel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ travel_date: travelDate, passengers }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit travel request.');
      setMessage('Travel request submitted to Overseas Recruitment. BIMED will handle the actual flight booking and airport pickup after clearance.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit travel request.'); }
    finally { setBusy(false); }
  }

  const addPassenger = () => setPassengers((items) => items.length >= 3 ? items : [...items, { full_name: '', date_of_birth: '' }]);
  const removePassenger = (index: number) => setPassengers((items) => items.length <= 1 ? items : items.filter((_, current) => current !== index));
  const itinerary = data?.itinerary;
  const pickup = data?.pickup;

  if (!data) return <main style={{ padding: 30, fontFamily: 'system-ui' }}>Loading travel planning…</main>;

  return <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui', padding: 28 }}>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button onClick={() => router.push('/staff')} style={secondary as any}>← Staff Portal</button><button onClick={() => router.push('/staff/permit')} style={secondary as any}>Employment permit</button></div>
      <div style={{ marginTop: 18 }}><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: '#0f766e' }}>PRE-ARRIVAL TRAVEL</div><h1 style={{ margin: '4px 0' }}>Travel to Dublin</h1><p style={{ color: '#627d98', maxWidth: 820 }}>Give BIMED the travel details it will need to arrange your journey to Ireland. You are not booking or paying for the flight yourself, and no supplier fare is shown in the Staff Portal.</p></div>
      {error && <div style={{ ...card, color: '#9b2c2c', background: '#fff5f5' }}>{error}</div>}
      {message && <div style={{ ...card, color: '#166534', background: '#f0fdf4' }}>{message}</div>}

      <section style={card}><h2 style={{ marginTop: 0 }}>Your departure airport</h2>{data.origin ? <><div style={{ fontSize: 14, color: '#627d98' }}>Home country</div><div style={{ fontSize: 22, fontWeight: 900, marginTop: 3 }}>{data.homeCountry}</div><div style={{ marginTop: 14, padding: 15, borderRadius: 12, background: '#f8fafc' }}><strong>{data.origin.code} · {data.origin.name}</strong><div style={{ color: '#627d98', marginTop: 4 }}>{data.origin.city}</div></div><p style={{ color: '#627d98', lineHeight: 1.6 }}>BIMED configures one departure airport for each home country. For example, a Nigerian candidate is restricted to Lagos (LOS), not Abuja (ABV). You cannot select another home-country airport in this workspace.</p></> : <p style={{ color: '#9b2c2c' }}>{data.warning || 'Your home-country departure airport is not yet configured.'}</p>}<div style={{ marginTop: 12, padding: 13, borderRadius: 10, background: '#fffbeb', color: '#854d0e' }}>BIMED may change the departure airport, routing or flight location where operationally necessary and will give up to 72 hours' notice where practicable.</div></section>

      <section style={card}><h2 style={{ marginTop: 0 }}>Travel request</h2><label style={{ display: 'block', fontWeight: 800 }}>Planned travel date<input type='date' value={travelDate} onChange={(e) => setTravelDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} style={{ ...input, marginTop: 6 }} /></label><div style={{ marginTop: 20, display: 'grid', gap: 14 }}><div><h3 style={{ marginBottom: 6 }}>Passengers</h3><p style={{ color: '#627d98', marginTop: 0 }}>Maximum 3 passengers. Enter the names and dates of birth exactly as they should be used for the future booking. All travel is economy class.</p></div>{passengers.map((passenger, index) => <div key={index} style={{ border: '1px solid #e5eaf0', borderRadius: 12, padding: 15 }}><div style={{ display: 'grid', gridTemplateColumns: '1.3fr .8fr auto', gap: 10, alignItems: 'end' }}><label style={{ fontWeight: 800 }}>Passenger {index + 1}<input value={passenger.full_name} onChange={(e) => updatePassenger(index, 'full_name', e.target.value)} placeholder='Full legal name' style={{ ...input, marginTop: 5 }} /></label><label style={{ fontWeight: 800 }}>Date of birth<input type='date' value={passenger.date_of_birth} onChange={(e) => updatePassenger(index, 'date_of_birth', e.target.value)} style={{ ...input, marginTop: 5 }} /></label>{passengers.length > 1 ? <button onClick={() => removePassenger(index)} style={{ ...secondary, padding: '10px 12px' }}>Remove</button> : <span />}</div></div>)}{passengers.length < 3 && <button onClick={addPassenger} style={{ ...secondary, width: 'fit-content' }}>+ Add passenger</button>}</div><div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}><div style={{ padding: 14, background: '#f8fafc', borderRadius: 10 }}><strong>Destination</strong><div style={{ color: '#627d98' }}>DUB · Dublin Airport</div></div><div style={{ padding: 14, background: '#f8fafc', borderRadius: 10 }}><strong>Cabin</strong><div style={{ color: '#627d98' }}>Economy only</div></div><div style={{ padding: 14, background: '#f8fafc', borderRadius: 10 }}><strong>Arrival pickup</strong><div style={{ color: '#627d98' }}>BIMED arranges pickup to accommodation</div></div></div><button disabled={busy || !data.origin} onClick={() => void submit()} style={{ ...button, marginTop: 20, opacity: busy || !data.origin ? .55 : 1 }}>{busy ? 'Submitting…' : itinerary ? 'Update travel request' : 'Submit travel request'}</button></section>

      {itinerary && <section style={card}><h2 style={{ marginTop: 0 }}>Travel request status</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}><Stat label='Route' value={itinerary.route} /><Stat label='Travel date' value={itinerary.travel_date} /><Stat label='Passengers' value={itinerary.passenger_count} /><Stat label='Flight booking' value={itinerary.booking_status === 'booked' ? 'Booked by BIMED' : 'Being arranged'} /></div><div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#f8fafc' }}><strong>No fare information is displayed</strong><div style={{ marginTop: 6, color: '#627d98' }}>BIMED handles flight selection, payment and booking. You will receive the confirmed travel information through the Staff Portal when it is ready.</div></div><p style={{ color: '#627d98', lineHeight: 1.7 }}>This request is not a ticket. BIMED may alter the airport or routing with up to 72 hours' notice. Any baggage above the airline's included economy allowance is your responsibility and cost.</p></section>}

      {pickup && <section style={card}><h2 style={{ marginTop: 0 }}>Airport pickup</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}><Stat label='Status' value={String(pickup.status).replaceAll('_',' ')} /><Stat label='Supplier' value={pickup.supplier_name || 'BIMED-arranged'} /><Stat label='Driver' value={pickup.driver_name || 'To be assigned'} /></div><p style={{ color: '#627d98', lineHeight: 1.6, marginBottom: 0 }}>{pickup.status === 'completed' ? 'Your airport transfer has been completed.' : pickup.driver_meet_point ? `Meet point: ${pickup.driver_meet_point}` : 'BIMED will arrange your transfer from Dublin Airport to the assigned BIMED accommodation.'}</p></section>}
    </div>
  </main>;
}

function Stat({ label, value }: { label: string; value: unknown }) { return <div style={{ padding: 12, border: '1px solid #edf2f7', borderRadius: 10 }}><div style={{ fontSize: 12, color: '#627d98' }}>{label}</div><div style={{ fontWeight: 900, marginTop: 3 }}>{String(value || '—')}</div></div>; }
