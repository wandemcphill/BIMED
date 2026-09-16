'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import {
  STAFF_HELP_ARTICLES,
  STAFF_HELP_CATEGORIES,
  STAFF_HELP_DISCLAIMER,
  STAFF_HELP_QUICK_QUESTIONS,
  StaffHelpArticle,
} from '@/lib/staff-help-content';

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'for', 'how', 'i', 'is', 'it', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'where', 'who', 'when', 'with', 'you', 'your']);
const aliases: Record<string, string[]> = {
  accommodation: ['housing', 'apartment', 'house', 'rent', 'accommodation'],
  permit: ['sponsorship', 'immigration', 'work permit'],
  visa: ['immigration', 'entry', 'travel permission'],
  flight: ['air ticket', 'airfare', 'travel'],
  payment: ['pay', 'money', 'bank', 'invoice', 'fee', 'cost'],
  refund: ['money back', 'reimbursement'],
  work: ['shift', 'job', 'employment', 'right to work', 'authorised'],
  rota: ['schedule', 'shift', 'roster'],
  payslip: ['salary', 'payroll', 'wage', 'pay'],
  profile: ['personal details', 'address', 'phone', 'photo', 'pps'],
  help: ['support', 'assistance', 'question'],
};

function normalise(text: string) {
  return text.toLowerCase().replace(/[€£$]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(text: string) {
  return normalise(text).split(' ').filter((token) => token && !STOP_WORDS.has(token));
}

function expandedTokens(text: string) {
  const base = tokens(text);
  const expanded = new Set(base);
  for (const token of base) for (const alias of aliases[token] || []) for (const aliasToken of tokens(alias)) expanded.add(aliasToken);
  return [...expanded];
}

function scoreArticle(article: StaffHelpArticle, query: string) {
  const q = expandedTokens(query);
  if (!q.length) return 0;
  const hay = normalise([article.title, article.category, article.keywords.join(' '), article.answer].join(' '));
  const title = normalise(article.title);
  const keywords = normalise(article.keywords.join(' '));
  let score = 0;
  for (const token of q) {
    if (title.includes(token)) score += 8;
    if (keywords.includes(token)) score += 6;
    if (hay.includes(token)) score += 2;
  }
  const phrase = normalise(query);
  if (phrase.length >= 4 && title.includes(phrase)) score += 20;
  if (phrase.length >= 8 && normalise(article.answer).includes(phrase)) score += 10;
  return score;
}

function bestMatches(query: string, category?: string) {
  return STAFF_HELP_ARTICLES
    .filter((article) => !category || article.category === category)
    .map((article) => ({ article, score: scoreArticle(article, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.article);
}

export default function StaffHelpPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [category, setCategory] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const matches = useMemo(() => {
    if (!submitted.trim()) return [];
    return bestMatches(submitted, category || undefined);
  }, [submitted, category]);

  const popular = useMemo(() => STAFF_HELP_ARTICLES.filter((article) => ['accommodation-amount', 'permit-journey', 'travel', 'work-authorisation', 'rota', 'payslips', 'messages'].includes(article.id)), []);

  function ask(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    setSubmitted(clean);
    setOpenId(null);
  }

  function useQuestion(question: string) {
    setQuery(question);
    setSubmitted(question);
    setOpenId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui', padding: 'clamp(16px,4vw,30px)' }}>
      <div style={{ width: 'min(1120px,100%)', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/staff" style={secondary}>← Staff Portal</Link>
          <span style={eyebrow}>BIMED STAFF HELP</span>
        </div>

        <section style={{ ...card, marginTop: 16, overflow: 'hidden', background: 'linear-gradient(135deg,#163247 0%,#0f766e 100%)', color: '#fff', border: 0 }}>
          <div style={{ maxWidth: 850 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.35, color: '#b7f4ec' }}>YOUR PORTAL COMPANION</div>
            <h1 style={{ margin: '7px 0 10px', fontSize: 'clamp(34px,6vw,56px)', lineHeight: 1.02 }}>Ask about your BIMED journey.</h1>
            <p style={{ margin: 0, maxWidth: 780, color: '#d8eeec', fontSize: 'clamp(16px,2.5vw,19px)', lineHeight: 1.65 }}>
              Ask a question in normal language. This helper searches BIMED’s current Staff Portal, recruitment, accommodation, permit and travel guidance and brings the most relevant answer to the top.
            </p>
          </div>
          <form onSubmit={ask} style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              aria-label="Ask BIMED Staff Help"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Who pays for my flight?"
              style={{ flex: '1 1 540px', minHeight: 54, boxSizing: 'border-box', padding: '0 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.22)', background: '#fff', color: '#102a43', fontSize: 16, outline: 'none' }}
            />
            <button type="submit" style={{ minHeight: 54, padding: '0 22px', border: 0, borderRadius: 12, background: '#fff', color: '#0f766e', fontWeight: 950, cursor: 'pointer' }}>Ask BIMED</button>
          </form>
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <div style={sectionTitle}>Try asking</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
            {STAFF_HELP_QUICK_QUESTIONS.map((question) => <button key={question} onClick={() => useQuestion(question)} style={chip}>{question}</button>)}
          </div>
        </section>

        {submitted && (
          <section style={{ ...card, marginTop: 16 }} aria-live="polite">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={eyebrow}>ANSWERING</div>
                <h2 style={{ margin: '4px 0 0' }}>“{submitted}”</h2>
              </div>
              <button type="button" onClick={() => { setSubmitted(''); setQuery(''); }} style={secondary}>Clear</button>
            </div>
            {matches.length ? (
              <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
                {matches.map((article, index) => <AnswerCard key={article.id} article={article} primary={index === 0} open={openId === article.id} onToggle={() => setOpenId(openId === article.id ? null : article.id)} />)}
              </div>
            ) : (
              <div style={{ marginTop: 18, padding: 18, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', color: '#7c2d12', lineHeight: 1.65 }}>
                I could not find a confident match in the current BIMED help content. Try a simpler phrase such as “accommodation payment”, “permit”, “flight”, “shift”, “payslip” or “profile”, or contact BIMED through Messages.
                <div style={{ marginTop: 12 }}><Link href="/staff/messages" style={primaryButton}>Open Messages</Link></div>
              </div>
            )}
          </section>
        )}

        <section style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
            <div><div style={eyebrow}>KNOWLEDGE LIBRARY</div><h2 style={{ margin: '4px 0 0' }}>Browse by topic</h2></div>
            <select aria-label="Filter help category" value={category} onChange={(event) => setCategory(event.target.value)} style={select}>
              <option value="">All topics</option>
              {STAFF_HELP_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 16 }}>
            {(category ? STAFF_HELP_ARTICLES.filter((article) => article.category === category) : STAFF_HELP_ARTICLES).map((article) => <AnswerCard key={article.id} article={article} open={openId === article.id} onToggle={() => setOpenId(openId === article.id ? null : article.id)} />)}
          </div>
        </section>

        <section style={{ ...card, marginTop: 16 }}>
          <div style={eyebrow}>COMMONLY USED</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 12 }}>
            {popular.map((article) => <button key={article.id} onClick={() => useQuestion(article.title)} style={{ textAlign: 'left', border: '1px solid #e5eaf0', background: '#fff', borderRadius: 12, padding: 15, cursor: 'pointer' }}><strong style={{ color: '#163247' }}>{article.title}</strong><span style={{ display: 'block', marginTop: 5, color: '#627d98', fontSize: 13 }}>{article.category}</span></button>)}
          </div>
        </section>

        <section style={{ ...card, marginTop: 16, marginBottom: 28, background: '#eefdf8', borderColor: '#b7ead0' }}>
          <strong style={{ color: '#0f766e' }}>Need a person?</strong>
          <p style={{ margin: '6px 0 12px', color: '#486581', lineHeight: 1.65 }}>This helper explains the portal. BIMED HR, recruitment and immigration teams remain responsible for controlled decisions and case-specific answers.</p>
          <Link href="/staff/messages" style={primaryButton}>Message BIMED</Link>
        </section>

        <p style={{ margin: '0 0 30px', color: '#829ab1', fontSize: 12, lineHeight: 1.6 }}>{STAFF_HELP_DISCLAIMER}</p>
      </div>
    </main>
  );
}

function AnswerCard({ article, primary, open, onToggle }: { article: StaffHelpArticle; primary?: boolean; open: boolean; onToggle: () => void }) {
  return (
    <article style={{ border: primary ? '2px solid #0f766e' : '1px solid #e5eaf0', borderRadius: 14, background: '#fff', overflow: 'hidden', boxShadow: primary ? '0 8px 28px rgba(15,118,110,.08)' : undefined }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: 17, cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#0f766e' }}>{article.category}</div><h3 style={{ margin: '5px 0 0', fontSize: 18, color: '#163247' }}>{article.title}</h3></div>
          <span aria-hidden style={{ fontSize: 20, color: '#829ab1', lineHeight: 1 }}>{open ? '−' : '+'}</span>
        </div>
      </button>
      {(open || primary) && <div style={{ borderTop: '1px solid #edf2f7', padding: '0 17px 17px', color: '#486581', lineHeight: 1.7 }}>
        <p style={{ margin: '14px 0 12px' }}>{article.answer}</p>
        {article.links?.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{article.links.map((link) => <Link key={link.href} href={link.href} style={linkStyle}>{link.label} →</Link>)}</div> : null}
      </div>}
    </article>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 'clamp(17px,3vw,22px)', boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const secondary: React.CSSProperties = { display: 'inline-block', padding: '9px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', fontWeight: 800, textDecoration: 'none', cursor: 'pointer' };
const primaryButton: React.CSSProperties = { display: 'inline-block', padding: '10px 14px', borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900, textDecoration: 'none' };
const linkStyle: React.CSSProperties = { display: 'inline-block', padding: '8px 11px', borderRadius: 9, background: '#e6fffb', color: '#0f766e', fontWeight: 850, textDecoration: 'none' };
const chip: React.CSSProperties = { border: '1px solid #d9e2ec', borderRadius: 999, padding: '9px 12px', background: '#fff', color: '#334e68', cursor: 'pointer', fontWeight: 750 };
const select: React.CSSProperties = { minWidth: 220, padding: '10px 12px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68' };
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 900, color: '#0f766e', letterSpacing: 1.1 };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 900, letterSpacing: 1.15, color: '#0f766e' };
