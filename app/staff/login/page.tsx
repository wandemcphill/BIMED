'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StaffLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const emailFromLink = params.get('email') || '';
  const [identifier, setIdentifier] = useState(emailFromLink);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/staff/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.');
      router.replace('/staff');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }

  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f4f7fb',padding:24}}>
    <form onSubmit={submit} style={{width:'100%',maxWidth:440,background:'#fff',padding:32,borderRadius:20,boxShadow:'0 14px 44px rgba(15,23,42,.08)'}}>
      <div style={{fontSize:13,fontWeight:800,letterSpacing:1.4,textTransform:'uppercase',color:'#0f766e'}}>BIMED Healthcare</div>
      <h1 style={{fontSize:30,margin:'10px 0 8px',color:'#102a43'}}>Staff Portal</h1>
      <p style={{color:'#627d98',marginBottom:24}}>Sign in with your permanent BIMED account.</p>{emailFromLink && <div style={{background:'#effcf6',border:'1px solid #b7e4cc',color:'#166534',padding:12,borderRadius:10,marginBottom:16,fontSize:13,lineHeight:1.5}}>This account has already been activated. Sign in below with the password you created during activation.</div>}
      <label style={{display:'block',fontWeight:700,marginBottom:6}}>BIMED ID or BIMED email</label>
      <input value={identifier} onChange={e=>setIdentifier(e.target.value)} type='text' autoComplete='username' required placeholder='BIM-2026-AB12CD or firstname.lastname@bimedhealthcare.com' style={{width:'100%',padding:'12px 14px',border:'1px solid #d9e2ec',borderRadius:10,marginBottom:16,boxSizing:'border-box'}} />
      <label style={{display:'block',fontWeight:700,marginBottom:6}}>Password</label>
      <input value={password} onChange={e=>setPassword(e.target.value)} type='password' autoComplete='current-password' required style={{width:'100%',padding:'12px 14px',border:'1px solid #d9e2ec',borderRadius:10,marginBottom:16,boxSizing:'border-box'}} />
      <div style={{background:'#f4f7fb',borderRadius:10,padding:12,fontSize:12,color:'#627d98',marginBottom:16}}>New hires: use your activation link first to create your password. After activation, you can sign in with either your BIMED ID or your BIMED email.</div>
      {error && <div style={{background:'#fff5f5',border:'1px solid #fed7d7',color:'#c53030',padding:12,borderRadius:10,marginBottom:16}}>{error}</div>}
      <button disabled={busy} style={{width:'100%',padding:'13px 16px',border:0,borderRadius:10,background:'#0f766e',color:'#fff',fontWeight:800,cursor:'pointer'}}>{busy?'Signing in…':'Sign in'}</button>
    </form>
  </main>;
}
