import { describe, expect, it } from 'vitest';
import {
  extractInterviewAudioDraft,
  mergeInterviewAudioDraft,
} from '@/lib/interview-draft-storage';

describe('candidate interview audio draft storage', () => {
  it('extracts valid recordings without copying typed answers into IndexedDB', () => {
    const responses = {
      written_care: { text: 'I support people with dignity.' },
      audio_one: { audio_base64: 'c29tZS1hdWRpbw==', mime_type: 'audio/webm' },
      audio_two: { audio_base64: '', mime_type: 'audio/webm' },
      audio_three: { audio_base64: 'b2s=', mime_type: 'text/plain' },
    };

    expect(extractInterviewAudioDraft(responses)).toEqual({
      audio_one: { audio_base64: 'c29tZS1hdWRpbw==', mime_type: 'audio/webm' },
    });
  });

  it('restores voice answers alongside existing written answers', () => {
    const writtenAnswers = {
      written_care: { text: 'I support people with dignity.' },
      audio_one: { text: '' },
    };
    const savedAudio = {
      audio_one: { audio_base64: 'c29tZS1hdWRpbw==', mime_type: 'audio/webm' },
      audio_two: { audio_base64: 'b3RoZXI=', mime_type: 'audio/ogg' },
    };

    expect(mergeInterviewAudioDraft(writtenAnswers, savedAudio)).toEqual({
      written_care: { text: 'I support people with dignity.' },
      audio_one: { audio_base64: 'c29tZS1hdWRpbw==', mime_type: 'audio/webm' },
      audio_two: { audio_base64: 'b3RoZXI=', mime_type: 'audio/ogg' },
    });
  });
});
