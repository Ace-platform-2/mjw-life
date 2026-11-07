import React, { useEffect, useRef, useState } from 'react';
import { Microphone, UploadSimple } from '@phosphor-icons/react';
import { isEvent } from './planning.js';

const maxSize = 50 * 1024 * 1024;
const maxDuration = 30 * 60;

async function decode(file) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) throw new Error('This browser cannot process audio. Try an updated browser.');
  const context = new Offline(1, 1, 16000);
  let audio;
  try { audio = await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('This browser could not read the audio format. Try M4A, MP3 or WAV.'); }
  if (audio.duration > maxDuration) throw new Error('Choose a recording of 30 minutes or less.');
  if (audio.duration < 0.15) throw new Error('The recording is too short to transcribe.');
  if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
  const mono = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const input = audio.getChannelData(channel);
    for (let index = 0; index < mono.length; index++) mono[index] += input[index] / audio.numberOfChannels;
  }
  return mono;
}

export function Transcription({ areas, records, day, open }) {
  const [file, setFile] = useState(null);
  const [area, setArea] = useState(areas[0]?.id || '');
  const [eventId, setEventId] = useState('');
  const [language, setLanguage] = useState('auto');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [working, setWorking] = useState(false);
  const recorder = useRef(null);
  const timer = useRef(null);
  const mounted = useRef(false);
  const worker = useRef(null);
  const job = useRef(0);
  const locked = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      job.current++;
      window.clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      recorder.current?.stream.getTracks().forEach(track => track.stop());
      worker.current?.terminate();
      worker.current = null;
    };
  }, []);

  function cancel() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    locked.current = false;
    setWorking(false);
    setMessage('Transcription cancelled. You can try again.');
  }

  async function transcribe(source) {
    if (!source || locked.current) return;
    setFile(source);
    if (!source.size || source.size > maxSize) { setMessage('Choose an audio file up to 50 MB.'); return; }
    locked.current = true;
    const current = ++job.current;
    setWorking(true);
    setMessage('Reading audio…');
    const finish = message => { locked.current = false; setWorking(false); setMessage(message); };
    try {
      const samples = await decode(source);
      if (!mounted.current || current !== job.current) return;
      if (!worker.current) worker.current = new Worker(new URL('./speech-worker.js', import.meta.url), { type: 'module' });
      worker.current.onmessage = ({ data }) => {
        if (!mounted.current || current !== job.current) return;
        if (data.state === 'loading') setMessage('Loading speech model' + (Number.isFinite(data.percent) ? ' · ' + data.percent + '%' : '') + '…');
        if (data.state === 'transcribing') setMessage('Transcribing on this device. Keep this screen open.');
        if (data.state === 'done') {
          if (data.text) setContent(data.text.slice(0, 30000));
          finish(data.text ? 'Transcript ready to review.' : 'No speech was detected.');
        }
        if (data.state === 'error') finish('Could not transcribe this audio. Check your connection for the first download, then try again or use a shorter clip.');
      };
      worker.current.onerror = () => {
        if (current !== job.current || !mounted.current) return;
        worker.current?.terminate();
        worker.current = null;
        finish('The speech model could not start on this device. Try an updated browser or a shorter clip.');
      };
      worker.current.postMessage({ samples, language }, [samples.buffer]);
    } catch (error) {
      if (mounted.current && current === job.current) finish(error.message || 'Could not read the recording.');
    }
  }

  async function record() {
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return; }
    setMessage('');
    setRequesting(true);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const capture = new MediaRecorder(stream, { audioBitsPerSecond: 64000 });
      recorder.current = capture;
      const chunks = [];
      let size = 0;
      capture.ondataavailable = event => {
        size += event.data.size;
        if (size <= maxSize && event.data.size) chunks.push(event.data);
        else if (size > maxSize && capture.state === 'recording') capture.stop();
      };
      capture.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        window.clearTimeout(timer.current);
        if (!mounted.current) return;
        setRecording(false);
        if (size > maxSize) { setMessage('The recording was too large. Try a shorter clip.'); return; }
        const type = capture.mimeType.split(';')[0];
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        transcribe(new File(chunks, 'voice-note.' + extension, { type }));
      };
      capture.start(1000);
      setRecording(true);
      timer.current = window.setTimeout(() => { if (capture.state === 'recording') capture.stop(); }, maxDuration * 1000);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      if (mounted.current) setMessage('Microphone access is unavailable. You can choose an audio file instead.');
    } finally { if (mounted.current) setRequesting(false); }
  }

  return <section className="feature-section">
    <h2>Audio and transcripts</h2>
    <p className="muted">Choose a file or stop a recording to start transcription on this device. The first run downloads a speech model.</p>
    <div className="fields">
      <label>Language<select value={language} disabled={working || recording || requesting} onChange={event => setLanguage(event.target.value)}><option value="auto">Detect automatically</option><option value="en">English</option><option value="af">Afrikaans</option></select></label>
      <label><span><UploadSimple size={17} /> Audio file</span><input type="file" accept="audio/*,.mp4,.webm,.m4a" disabled={working || recording || requesting}
        onChange={event => { const selected = event.target.files[0]; event.target.value = ''; if (selected) transcribe(selected); }} /></label>
      <small>Up to 50 MB and 30 minutes, depending on your device’s supported formats.</small>
      {typeof MediaRecorder !== 'undefined' && <button className={recording ? 'primary' : 'secondary'} disabled={working || requesting} onClick={record}>
        <Microphone size={18} /> {recording ? 'Stop and transcribe' : 'Record voice note'}</button>}
      {message && <p role="status">{message}</p>}
      {working ? <button className="quiet" onClick={cancel}>Cancel transcription</button>
        : file && <button className="quiet" disabled={recording || requesting} onClick={() => transcribe(file)}>Transcribe again</button>}
      <label>Review or paste transcript<textarea value={content} onChange={event => setContent(event.target.value)} rows="7" maxLength="30000" /></label>
      <label>Area<select value={area} onChange={event => { setArea(event.target.value); setEventId(''); }}>{areas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Link to an event (optional)<select value={eventId} onChange={event => setEventId(event.target.value)}><option value="">None</option>
        {records.filter(item => item.area === area && isEvent(item)).map(item => <option key={item.id} value={item.id}>{item.planned} · {item.title}</option>)}</select></label>
      <button className="primary" disabled={!content.trim() || working || recording} onClick={() => open({ kind: 'note', area, day, detail: content, title: 'Transcript', relatedId: eventId })}>Review and save as note</button>
    </div>
  </section>;
}
