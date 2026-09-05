'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import InterviewAnswerInput, { type InterviewAnswerValue } from '@/components/InterviewAnswerInput';
import type { InterviewQuestion } from '@/lib/interview-questions';

export default function SecondInterviewForm({ token, questions }: { token: string; questions: InterviewQuestion[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, InterviewAnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const setAnswer = (id: string, value: InterviewAnswerValue) => {
    setAnswers((current) => ({ ...current, [id]: value }));
  };

  const submit = async () => {
    const unanswered = questions.some((question) => {
      const answer = answers[question.id];
      return !answer || (!answer.audio_base64 && !answer.text?.trim());
    });
    if (unanswered) {
      setError('Please answer every question before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    const response = await fetch(`/api/second-interview/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || 'Unable to submit your answers right now.');
      setSubmitting(false);
      return;
    }

    router.refresh();
  };

  return (
    <div className="interview-question-list">
      {questions.map((question, index) => (
        <div className="subcard" key={question.id} style={{ marginBottom: 14 }}>
          <span className="pill">{question.category.toUpperCase()}</span>
          <h3 style={{ marginTop: 8 }}>
            {index + 1}. {question.text}
          </h3>
          {question.guidance && <p className="muted">{question.guidance}</p>}
          <InterviewAnswerInput value={answers[question.id]} onChange={(next) => setAnswer(question.id, next)} />
        </div>
      ))}

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      <button className="primary" style={{ marginTop: 12 }} onClick={() => void submit()} disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit second interview'}
      </button>
    </div>
  );
}
