import { workspaceAccess } from '../server/workspace-auth.js';

const maxBytes = 3 * 1024 * 1024;
const formats = {
  mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4', wav: 'audio/wav',
  webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  try {
    const status = await workspaceAccess(token);
    if (status !== 200) return res.status(status).json({ error: 'Workspace access required.' });
    const { OPENAI_API_KEY, OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe' } = process.env;
    if (!OPENAI_API_KEY) return res.status(503).json({ error: 'Audio transcription is awaiting provider setup. You can still paste a transcript.' });
    const { audio, extension, language, consent } = req.body || {};
    if (consent !== true || typeof audio !== 'string' || audio.length > Math.ceil(maxBytes / 3) * 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || !Object.hasOwn(formats, extension) || !['auto', 'en', 'af'].includes(language)) {
      return res.status(400).json({ error: 'Choose a supported audio file up to 3 MB and confirm permission to transcribe.' });
    }
    const file = Buffer.from(audio, 'base64');
    if (!file.length || file.length > maxBytes) return res.status(400).json({ error: 'Choose an audio file up to 3 MB.' });
    const payload = new FormData();
    payload.set('file', new Blob([file], { type: formats[extension] }), 'recording.' + extension);
    payload.set('model', OPENAI_TRANSCRIPTION_MODEL);
    if (language !== 'auto') payload.set('language', language);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + OPENAI_API_KEY },
      body: payload, signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) return res.status(502).json({ error: 'The audio could not be transcribed. Try a shorter or different file.' });
    const data = await response.json();
    if (typeof data.text !== 'string' || !data.text.trim()) return res.status(422).json({ error: 'No speech was returned for this recording.' });
    return res.status(200).json({ text: data.text.slice(0, 30000) });
  } catch {
    return res.status(502).json({ error: 'Transcription is temporarily unavailable.' });
  }
}
