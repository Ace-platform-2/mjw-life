import React, { useEffect, useRef, useState } from 'react';
import { isEvent } from './planning.js';

const maxSize = 3 * 1024 * 1024;
const formats = /\.(mp3|m4a|mp4|wav|webm|ogg|flac)$/i;
const encode = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export function Transcription({ session, areas, records, day, open }) {
  const [file, setFile] = useState(null);
  const [area, setArea] = useState(areas[0]?.id || '');
  const [eventId, setEventId] = useState('');
  const [language, setLanguage] = useState('auto');
  const [consent, setConsent] = useState(false);
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [sending, setSending] = useState(false);
  const recorder = useRef(null);
  const timer = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      recorder.current?.stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  async function record() {
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return; }
    setMessage('');
    let stream;
    setRequesting(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const capture = new MediaRecorder(stream);
      recorder.current = capture;
      const chunks = [];
      let size = 0;
      capture.ondataavailable = event => {
        size += event.data.size;
        if (size <= maxSize) chunks.push(event.data);
        else if (capture.state === 'recording') capture.stop();
      };
      capture.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        window.clearTimeout(timer.current);
        if (!mounted.current) return;
        setRecording(false);
        if (size > maxSize) { setMessage('The recording was too large. Try a shorter clip.'); return; }
        const type = capture.mimeType.split(';')[0];
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        setFile(new File(chunks, 'voice-note.' + extension, { type }));
        setConsent(false);
      };
      capture.start(1000);
      setRecording(true);
      timer.current = window.setTimeout(() => { if (capture.state === 'recording') capture.stop(); }, 120000);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      setMessage('Microphone access is unavailable. You can choose an audio file instead.');
    } finally { if (mounted.current) setRequesting(false); }
  }

  async function transcribe() {
    const extension = file?.name.match(formats)?.[1].toLowerCase();
    if (!extension || file.size > maxSize) { setMessage('Choose a supported audio file up to 3 MB.'); return; }
    setSending(true);
    setMessage('');
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
        body: JSON.stringify({ audio: await encode(file), extension, language, consent }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setContent(result.text);
      setMessage('Transcript ready to review.');
    } catch (error) {
      setMessage(error.message || 'Could not transcribe the audio.');
    } finally { setSending(false); }
  }

  return <section className="feature-section">
    <h2>Audio and transcripts</h2>
    <p className="muted">Record a short voice note, upload audio or paste a transcript. Check names and decisions before creating follow-ups.</p>
    <div className="fields">
      <label>Audio file<input type="file" accept="audio/*,.mp4,.webm,.m4a" disabled={sending || recording} onChange={event => { setFile(event.target.files[0] || null); setConsent(false); }} /></label>
      <small>MP3, M4A, MP4, WAV, WebM, OGG or FLAC. Up to 3 MB per clip.</small>
      {typeof MediaRecorder !== 'undefined' && <button className="secondary" disabled={sending || requesting} onClick={record}>{recording ? 'Stop recording' : 'Record voice note'}</button>}
      {file && <small>Selected: {file.name}</small>}
      <label>Language<select value={language} onChange={event => setLanguage(event.target.value)}><option value="auto">Detect automatically / mixed</option><option value="en">English</option><option value="af">Afrikaans</option></select></label>
      <label className="tick"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I have permission to send this audio to OpenAI for transcription.</label>
      <button className="secondary" disabled={!session || !file || !consent || sending || recording} onClick={transcribe}>{sending ? 'Preparing transcript…' : 'Transcribe audio'}</button>
      {message && <p role="status">{message}</p>}
      <label>Review or paste transcript<textarea value={content} onChange={event => setContent(event.target.value)} rows="7" maxLength="30000" /></label>
      <label>Area<select value={area} onChange={event => { setArea(event.target.value); setEventId(''); }}>{areas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Link to an event (optional)<select value={eventId} onChange={event => setEventId(event.target.value)}><option value="">None</option>
        {records.filter(item => item.area === area && isEvent(item)).map(item => <option key={item.id} value={item.id}>{item.planned} · {item.title}</option>)}</select></label>
      <button className="primary" disabled={!content.trim() || sending || recording} onClick={() => open({ kind: 'note', area, day, detail: content, title: 'Transcript', relatedId: eventId })}>Review and save as note</button>
    </div>
  </section>;
}
