'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BIMED_POPE_QUAY_FLATS,
  defaultBimedAccommodationUnit,
  defaultBimedWorkAddress,
  defaultSharedAccommodationPartner,
  formatBimedPopeQuayAddress,
  isBimedAccommodationUnit,
  type BimedAccommodationUnit,
} from '@/lib/bimed-accommodation-address';

type PermitCase = {
  accommodation_unit?: string | null;
  accommodation_address?: string | null;
  accommodation_address_verified_at?: string | null;
  accommodation_address_verified_by?: string | null;
  accommodation_shared_with_staff_id?: string | null;
};

type Props = {
  staffId: string;
  bimedId: string;
  staffName: string;
  primaryLocation?: string | null;
  permitCase: PermitCase | null;
  onSaved?: () => Promise<void> | void;
};

const panel: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d9e2ec',
  borderRadius: 16,
  padding: 22,
  marginTop: 18,
  boxShadow: '0 8px 28px rgba(15,23,42,.04)',
};
const field: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  fontWeight: 750,
  color: '#334e68',
};
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #bcccdc',
  borderRadius: 9,
  padding: '11px 12px',
  font: 'inherit',
  color: '#102a43',
  background: '#fff',
};
const primaryButton: React.CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: '11px 15px',
  color: '#fff',
  background: '#0f766e',
  fontWeight: 800,
  cursor: 'pointer',
};

function isKnownFlat(value: string): value is (typeof BIMED_POPE_QUAY_FLATS)[number] {
  return BIMED_POPE_QUAY_FLATS.some((flat) => flat === value);
}

export default function StaffContractAddressEditor({
  staffId,
  bimedId,
  staffName,
  primaryLocation,
  permitCase,
  onSaved,
}: Props) {
  const [primaryAssignment, setPrimaryAssignment] = useState(
    primaryLocation?.trim() || defaultBimedWorkAddress(bimedId)
  );
  const [unit, setUnit] = useState<BimedAccommodationUnit | ''>(() => {
    const saved = permitCase?.accommodation_unit;
    return isBimedAccommodationUnit(saved)
      ? saved
      : defaultBimedAccommodationUnit(bimedId);
  });
  const [otherAddress, setOtherAddress] = useState(
    permitCase?.accommodation_unit === 'Other' ? permitCase.accommodation_address || '' : ''
  );
  const [sharedWithBimedId, setSharedWithBimedId] = useState(
    defaultSharedAccommodationPartner(bimedId)
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPrimaryAssignment(primaryLocation?.trim() || defaultBimedWorkAddress(bimedId));
    const saved = permitCase?.accommodation_unit;
    const nextUnit = isBimedAccommodationUnit(saved)
      ? saved
      : defaultBimedAccommodationUnit(bimedId);
    setUnit(nextUnit);
    setOtherAddress(
      saved === 'Other' ? permitCase?.accommodation_address || '' : ''
    );
    setSharedWithBimedId(defaultSharedAccommodationPartner(bimedId));
    setConfirmed(false);
    setError('');
    setMessage('');
  }, [bimedId, primaryLocation, permitCase?.accommodation_unit, permitCase?.accommodation_address]);

  const address = useMemo(() => {
    if (!unit) return '';
    return unit === 'Other'
      ? otherAddress.trim()
      : formatBimedPopeQuayAddress(unit) || '';
  }, [unit, otherAddress]);

  const verified = Boolean(
    permitCase?.accommodation_address_verified_at &&
    permitCase?.accommodation_address_verified_by &&
    permitCase?.accommodation_address
  );

  async function save() {
    setError('');
    setMessage('');
    if (!primaryAssignment.trim()) {
      setError('Enter the candidate’s full Place of Primary Assignment and Irish work address.');
      return;
    }
    if (!unit) {
      setError('Select the candidate’s accommodation flat or choose Other address.');
      return;
    }
    if (!address || address.length < 10) {
      setError('Enter and confirm the candidate’s full accommodation address in Ireland.');
      return;
    }
    if (!confirmed) {
      setError('Confirm that both the work and accommodation addresses have been checked.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/staff/' + encodeURIComponent(staffId) + '/contract-addresses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          primaryAssignment: primaryAssignment.trim(),
          accommodationUnit: unit,
          accommodationAddress: address,
          sharedWithBimedId: sharedWithBimedId.trim(),
          addressesConfirmed: confirmed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save the contract addresses.');
      setMessage('Work and accommodation addresses saved and verified for this candidate.');
      setConfirmed(false);
      await onSaved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the contract addresses.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={panel}>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 850, letterSpacing: 1.1, color: '#0f766e' }}>
            FINAL DETE CONTRACT
          </div>
          <h2 style={{ margin: '5px 0 7px', color: '#102a43' }}>Work & accommodation addresses</h2>
          <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.6, color: '#627d98' }}>
            Save the addresses against {staffName} ({bimedId}). These are separate from the employee’s current or home-country address and will populate this candidate’s own contract.
          </p>
        </div>
        <span style={{
          padding: '6px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 800,
          background: verified ? '#dcfce7' : '#fff7ed',
          color: verified ? '#166534' : '#9a3412',
        }}>
          {verified ? 'Addresses verified' : 'Address confirmation required'}
        </span>
      </div>

      {error ? <div role="alert" style={{ marginTop: 14, padding: 11, borderRadius: 9, background: '#fff1f2', color: '#9f1239' }}>{error}</div> : null}
      {message ? <div role="status" style={{ marginTop: 14, padding: 11, borderRadius: 9, background: '#ecfdf5', color: '#166534' }}>{message}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18, marginTop: 20 }}>
        <label style={field}>
          Place of Primary Assignment — work address
          <textarea
            value={primaryAssignment}
            onChange={(event) => setPrimaryAssignment(event.target.value)}
            rows={3}
            maxLength={500}
            style={{ ...input, resize: 'vertical' }}
            placeholder="Care provider / facility, street, town, county, Eircode, Ireland"
          />
          <span style={{ color: '#627d98', fontWeight: 500, lineHeight: 1.45 }}>
            Use the actual contracted work location, not the residence.
          </span>
        </label>

        <div style={{ display: 'grid', gap: 10 }}>
          <label style={field}>
            Accommodation unit
            <select value={unit} onChange={(event) => setUnit(event.target.value as BimedAccommodationUnit | '')} style={input}>
              <option value="">Select a flat</option>
              {BIMED_POPE_QUAY_FLATS.map((flat) => <option key={flat} value={flat}>{flat} — 19 Pope’s Quay</option>)}
              <option value="Other">Other Irish accommodation address</option>
            </select>
          </label>
          {unit === 'Other' ? (
            <label style={field}>
              Full accommodation address in Ireland
              <textarea
                value={otherAddress}
                onChange={(event) => setOtherAddress(event.target.value)}
                rows={3}
                maxLength={1000}
                style={{ ...input, resize: 'vertical' }}
                placeholder="Flat / house number, street, town, county, Eircode, Ireland"
              />
            </label>
          ) : (
            <div style={{ padding: 13, borderRadius: 9, border: '1px solid #d9e2ec', background: '#f8fafc' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#627d98', marginBottom: 5 }}>CONTRACT RESIDENTIAL ADDRESS</div>
              <div style={{ color: '#102a43', fontWeight: 750 }}>{address || 'Choose a flat to preview the address.'}</div>
            </div>
          )}
          <label style={field}>
            Shared with BIMED ID (optional)
            <input
              value={sharedWithBimedId}
              onChange={(event) => setSharedWithBimedId(event.target.value.toUpperCase())}
              maxLength={40}
              style={input}
              placeholder="e.g. BH-001042"
            />
            <span style={{ color: '#627d98', fontWeight: 500, lineHeight: 1.45 }}>
              For a shared flat, enter the other candidate’s BIMED ID in both records. Their allocations must match.
            </span>
          </label>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e5eaf0', marginTop: 20, paddingTop: 17 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: '#334e68', fontSize: 13, lineHeight: 1.55 }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0 }}
          />
          <span>
            I have checked and confirm that the work address and the accommodation address/unit above are correct for this candidate. I understand the addresses will appear separately on the final DETE contract.
          </span>
        </label>
        <button type="button" onClick={() => void save()} disabled={busy} style={{ ...primaryButton, marginTop: 17, opacity: busy ? 0.65 : 1 }}>
          {busy ? 'Saving verified addresses…' : 'Save and verify addresses'}
        </button>
        {verified ? (
          <div style={{ marginTop: 10, color: '#627d98', fontSize: 12 }}>
            Last verified by {permitCase?.accommodation_address_verified_by} · {new Date(permitCase?.accommodation_address_verified_at || '').toLocaleString('en-IE')}
          </div>
        ) : null}
      </div>
    </section>
  );
}
