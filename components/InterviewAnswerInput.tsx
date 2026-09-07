'use client';

import { useEffect, useRef, useState } from 'react';

export type InterviewAnswerValue = { text?: string; audio_base64?: string; mime_type?: string };

const MAX_RECORDING_SECONDS = 90;

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function InterviewAnswerInput({
  value,
  onChange,
  audioRequired = false,
}: {
  value: InterviewAnswerValue | undefined;
  onChange: (next: InterviewAnswerValue) => void;
  /** Audio interview segment. Typing remains an explicit fallback if recording is unavailable. */
  audioRequired?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [microphoneFailed, setMicrophoneFailed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        Boolean(pickSupportedMimeType())
    );
  }, []);

  useEffect(() => {
    if (value?.audio_base64 && value.mime_type) {
      const byteString = atob(value.audio_base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: value.mime_type }));
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [value?.audio_base64, value?.mime_type]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    setError('');
    setMicrophoneFailed(false);
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setMicrophoneFailed(true);
      setError('Audio recording is not supported in this browser. You can type your answer instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const audio_base64 = await blobToBase64(blob);
        onChange({ audio_base64, mime_type: mimeType });
        setRecording(false);
        setSeconds(0);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
    
      timerRef.current = setInterval(() => {
        setSeconds((current) => {
          if (current + 1 >= MAX_RECORDING_SECONDS) {
            recorder.stop();
          }
          return current + 1;
        });
      }, 1000);
    } catch {
      setRecording(false);
      setMicrophoneFailed(true);
      setError('We could not access your microphone. You can allow microphone access and try again, or type your answer below.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const removeRecording = () => {
    onChange({ text: '' });
    setError('');
  };

  if (value?.audio_base64 && previewUrl) {
    return (
      <div className="voice-answer">
        <audio controls src={previewUrl} style={{ width: '100%' }} />
        <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={removeRecording}>
          {audioRequired ? 'Re-record or type instead' : 'Remove voice note and type instead'}
        </button>
      </div>
    );
  }

  const showTextFallback = audioRequired && (!supported || microphoneFailed);

  if (audioRequired && supported && !microphoneFailed) {
    return (
      <div className="voice-answer">
        {recording ? (
          <button type="button" className="secondary voice-mic-active" onClick={stopRecording}>
            Stop recording ({seconds}s / {MAX_RECORDING_SECONDS}s max)
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void startRecording()}>
            Record your answer
          </button>
        )}
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="voice-answer">
      {showTextFallback && (
        <div className="notice" style={{ marginBottom: 10 }}>
          <strong>{microphoneFailed ? 'Microphone unavailable.' : 'Audio recording is unavailable on this device.'}</strong>
          <p style={{ margin: '4px 0 8px' }}>
            {microphoneFailed
              ? 'You can allow microphone access and try again, or type your answer below.'
              : 'Please type your answer below.'}
          </p>
          {microphoneFailed && (
            <button type="button" className="secondary" onClick={() => void startRecording()}>
              Try recording again
            </button>
          )}
        </div>
      )}

      <textarea
        value={value?.text || ''}
        onChange={(event) => onChange({ text: event.target.value })}
        rows={4}
        disabled={recording}
        placeholder={
          audioRequired
            ? 'Type your answer here if you cannot record audio.'
            : supported
              ? 'Type your answer, or record a voice note below.'
              : 'Type your answer.'
        }
      />

      {supported && !audioRequired && (
        <div style={{ marginTop: 8 }}>
          {recording ? (
            <button type="button" className="secondary voice-mic-active" onClick={stopRecording}>
              Stop recording ({seconds}s / {MAX_RECORDING_SECONDS}s max)
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => void startRecording()}>
              Record a voice note instead
            </button>
          )}
        </div>
      )}
      {error && !microphoneFailed && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
