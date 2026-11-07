export const MAX_RECORDING_SECONDS = 120 * 60;
export const MAX_TRANSCRIPTION_SECONDS = 30 * 60;
export const MAX_TRANSCRIPTION_BYTES = 50 * 1024 * 1024;

export function elapsedLabel(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return String(Math.floor(value / 3600)).padStart(2, '0') + ':' +
    String(Math.floor((value % 3600) / 60)).padStart(2, '0') + ':' +
    String(value % 60).padStart(2, '0');
}

export function recordingFileName(date, mimeType) {
  const extension = /mp4|aac/.test(mimeType) ? 'm4a' : /ogg/.test(mimeType) ? 'ogg' : 'webm';
  return 'MJW-Life-' + date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0') + '-' +
    String(date.getHours()).padStart(2, '0') +
    String(date.getMinutes()).padStart(2, '0') +
    String(date.getSeconds()).padStart(2, '0') + '.' + extension;
}

export function cleanSpeechText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
  if (words.length >= 12 && new Set(words).size <= 2) return '';
  if (words.length >= 18) {
    for (let n = 1; n <= 5; n++) {
      if (words.length < n * 6) continue;
      const sequence = words.slice(0, n).join(' ');
      let matches = 0;
      for (let i = 0; i + n <= words.length; i += n) {
        if (words.slice(i, i + n).join(' ') !== sequence) break;
        matches++;
      }
      if (matches >= 6 && matches * n >= words.length * 0.8) return '';
    }
  }
  return text;
}
