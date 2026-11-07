import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECORDING_SECONDS, MAX_TRANSCRIPTION_BYTES, MAX_TRANSCRIPTION_SECONDS,
  cleanSpeechText, elapsedLabel, recordingFileName,
} from '../src/audio-utils.js';

test('recording limit is two hours, separate from local file transcription limits', () => {
  assert.equal(MAX_RECORDING_SECONDS, 7200);
  assert.equal(MAX_TRANSCRIPTION_SECONDS, 1800);
  assert.equal(MAX_TRANSCRIPTION_BYTES, 50 * 1024 * 1024);
});

test('elapsed clock is stable for 120-minute recording', () => {
  assert.equal(elapsedLabel(0), '00:00:00');
  assert.equal(elapsedLabel(61), '00:01:01');
  assert.equal(elapsedLabel(7200), '02:00:00');
});

test('audio filename uses date and browser recording format', () => {
  const date = new Date(2026, 10, 7, 22, 13, 4);
  assert.equal(recordingFileName(date, 'audio/webm'), 'MJW-Life-2026-11-07-221304.webm');
  assert.equal(recordingFileName(date, 'audio/mp4'), 'MJW-Life-2026-11-07-221304.m4a');
});

test('filters repeated hallucinated tokens without removing normal speech', () => {
  assert.equal(cleanSpeechText('ten '.repeat(40)), '');
  assert.equal(cleanSpeechText('okay, yes '.repeat(20)), '');
  assert.equal(cleanSpeechText('The tenants will meet on Wednesday at ten.'), 'The tenants will meet on Wednesday at ten.');
  assert.equal(cleanSpeechText('  hello   world  '), 'hello world');
});
