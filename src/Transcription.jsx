import React, { useEffect, useRef, useState } from 'react';
import { DownloadSimple, Microphone, Trash, UploadSimple } from '@phosphor-icons/react';
import { isEvent } from './planning.js';
import {
  appendRecordingChunk, beginRecording, deleteRecording, downloadRecording,
  finishRecording, listRecordings, loadRecording, persistAudioStorage,
} from './recording-storage.js';
import {
  MAX_RECORDING_SECONDS, MAX_TRANSCRIPTION_SECONDS, MAX_TRANSCRIPTION_BYTES,
  cleanSpeechText, elapsedLabel, recordingFileName,
} from './audio-utils.js';

async function decode(file) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) throw new Error('This browser cannot process audio. Try an updated browser.');
  const context = new Offline(1, 1, 16000);
  let audio;
  try { audio = await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('This browser could not read the audio format. Try M4A, MP3 or WAV.'); }
  if (audio.duration > MAX_TRANSCRIPTION_SECONDS) throw new Error('On-device file transcription supports a maximum of 30 minutes. Recorded audio can be up to 120 minutes.');
  if (audio.duration < 0.15) throw new Error('The recording is too short to transcribe.');
  if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
  const mono = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const input = audio.getChannelData(channel);
    for (let index = 0; index < mono.length; index++) mono[index] += input[index] / audio.numberOfChannels;
  }
  return mono;
}

const stamp = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function getPreference() {
  try { return localStorage.getItem('mjw-life-auto-audio-download') !== 'false'; }
  catch { return true; }
}

function preferredRecorder(stream) {
  const supported = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
    .find(type => MediaRecorder.isTypeSupported(type));
  return new MediaRecorder(stream, { ...(supported ? { mimeType: supported } : {}), audioBitsPerSecond: 48000 });
}

export function Transcription({ areas, records, day, open, ownerId }) {
  const [file, setFile] = useState(null);
  const [area, setArea] = useState(areas[0]?.id || '');
  const [eventId, setEventId] = useState('');
  const [language, setLanguage] = useState('auto');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [working, setWorking] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [autoDownload, setAutoDownload] = useState(getPreference);
  const recorder = useRef(null);
  const session = useRef(null);
  const timer = useRef(null);
  const wake = useRef(null);
  const mounted = useRef(false);
  const worker = useRef(null);
  const job = useRef(0);
  const locked = useRef(false);
  const recognition = useRef(null);
  const wantsSpeech = useRef(false);
  const speechRestart = useRef(null);
  const speechCommitted = useRef('');
  const speechBase = useRef('');
  const contentRef = useRef('');

  useEffect(() => { contentRef.current = content; }, [content]);

  useEffect(() => {
    mounted.current = true;
    listRecordings(ownerId).then(setRecordings).catch(() => setMessage('Local audio storage could not be opened. Check browser storage permissions.'));
    return () => {
      mounted.current = false;
      job.current++;
      window.clearInterval(timer.current);
      window.clearTimeout(speechRestart.current);
      wantsSpeech.current = false;
      try { recognition.current?.abort(); } catch { /* Already stopped. */ }
      if (recorder.current?.state === 'recording') recorder.current.stop();
      recorder.current?.stream?.getTracks().forEach(track => track.stop());
      worker.current?.terminate();
      worker.current = null;
      wake.current?.release?.().catch(() => {});
    };
  }, []);

  async function refreshRecordings() {
    try { if (mounted.current) setRecordings(await listRecordings(ownerId)); }
    catch { if (mounted.current) setMessage('Saved recordings could not be listed.'); }
  }

  function cancel() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    locked.current = false;
    setWorking(false);
    setMessage('Transcription cancelled. Your saved audio remains available.');
  }

  async function transcribe(source) {
    if (!source || locked.current || recorder.current?.state === 'recording') return;
    if (!source.size || source.size > MAX_TRANSCRIPTION_BYTES) {
      setMessage('On-device file transcription supports audio files up to 50 MB. Your saved recording is not affected.');
      return;
    }
    if (source !== file) {
      setFile(source);
      setContent('');
    }
    locked.current = true;
    const current = ++job.current;
    setWorking(true);
    setMessage('Reading audio…');
    const finish = text => { locked.current = false; setWorking(false); setMessage(text); };
    try {
      const samples = await decode(source);
      if (!mounted.current || current !== job.current) return;
      if (!worker.current) worker.current = new Worker(new URL('./speech-worker.js', import.meta.url), { type: 'module' });
      worker.current.onmessage = ({ data }) => {
        if (!mounted.current || current !== job.current) return;
        if (data.state === 'loading') setMessage('Loading speech model' + (Number.isFinite(data.percent) ? ' · ' + data.percent + '%' : '') + '…');
        if (data.state === 'transcribing') setMessage('Transcribing on this device. Keep this screen open.');
        if (data.state === 'done') {
          const result = cleanSpeechText(data.text).slice(0, 30000);
          if (result) setContent(result);
          finish(result ? 'Transcript ready to review.' : 'No reliable speech detected. Audio is available separately.');
        }
        if (data.state === 'error') finish('Could not transcribe this audio. Try a short clip or paste a Wispr Flow transcript.');
      };
      worker.current.onerror = () => {
        if (current !== job.current || !mounted.current) return;
        worker.current?.terminate();
        worker.current = null;
        finish('The speech model could not start on this device. Your audio remains saved.');
      };
      worker.current.postMessage({ samples, language }, [samples.buffer]);
    } catch (error) {
      if (mounted.current && current === job.current) finish(error.message || 'Could not read the recording.');
    }
  }

  function stopSpeech() {
    wantsSpeech.current = false;
    window.clearTimeout(speechRestart.current);
    try { recognition.current?.stop(); } catch { /* Recognition may not have started. */ }
    recognition.current = null;
  }

  function startSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechBase.current = contentRef.current.trim();
    speechCommitted.current = '';
    if (!SpeechRecognition) {
      setLiveStatus('Live transcription is not supported by this browser. Audio will still be saved.');
      return;
    }
    const recognizer = new SpeechRecognition();
    recognition.current = recognizer;
    recognizer.lang = language === 'af' ? 'af-ZA' : 'en-ZA';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    wantsSpeech.current = true;
    recognizer.onresult = event => {
      let interim = '';
      let confirmed = '';
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const words = cleanSpeechText(result[0]?.transcript || '');
        if (!words) continue;
        if (result.isFinal) confirmed += ' ' + words;
        else interim += ' ' + words;
      }
      if (confirmed.trim()) speechCommitted.current = (speechCommitted.current + ' ' + confirmed.trim()).trim().slice(0, 29000);
      if (mounted.current) {
        setContent([speechBase.current, speechCommitted.current, interim.trim()].filter(Boolean).join('\n').slice(0, 30000));
        setLiveStatus('Live transcription active. Text appears in the box as you speak.');
      }
    };
    recognizer.onerror = event => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      wantsSpeech.current = false;
      if (mounted.current) setLiveStatus('Live speech recognition unavailable (' + event.error + '). Audio recording continues.');
    };
    recognizer.onend = () => {
      if (!wantsSpeech.current) return;
      if (recorder.current?.state !== 'recording') return;
      speechRestart.current = window.setTimeout(() => {
        if (!wantsSpeech.current || recorder.current?.state !== 'recording') return;
        try { recognizer.start(); }
        catch {
          wantsSpeech.current = false;
          if (mounted.current) setLiveStatus('Live speech recognition stopped. Audio recording continues.');
        }
      }, 350);
    };
    try { recognizer.start(); }
    catch {
      wantsSpeech.current = false;
      if (mounted.current) setLiveStatus('Live transcription could not start. Audio recording continues.');
    }
  }

  async function stopRecording() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  async function record() {
    if (recorder.current?.state === 'recording') { await stopRecording(); return; }
    if (requesting || working || savingAudio) return;
    setRequesting(true);
    setMessage('');
    setLiveStatus('');
    setElapsed(0);
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Microphone recording is not supported here.');
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const capture = preferredRecorder(stream);
      const type = capture.mimeType.split(';')[0] || 'audio/webm';
      const id = (crypto.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2));
      const name = recordingFileName(new Date(), type);
      await beginRecording({ id, name, mimeType: type, ownerId });
      await persistAudioStorage();
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const current = { id, name, mimeType: type, sequence: 0, bytes: 0, pending: Promise.resolve(), started: Date.now(), failure: null };
      session.current = current;
      recorder.current = capture;
      capture.ondataavailable = event => {
        if (!event.data?.size) return;
        const sequence = current.sequence++;
        current.bytes += event.data.size;
        current.pending = current.pending.then(() => appendRecordingChunk(id, sequence, event.data)).catch(error => {
          current.failure = error;
          if (capture.state === 'recording') capture.stop();
        });
      };
      capture.onerror = () => {
        current.failure = new Error('The browser interrupted microphone capture.');
        if (capture.state === 'recording') capture.stop();
      };
      capture.onstop = async () => {
        stopSpeech();
        window.clearInterval(timer.current);
        stream.getTracks().forEach(track => track.stop());
        wake.current?.release?.().catch(() => {});
        const duration = (Date.now() - current.started) / 1000;
        if (mounted.current) { setRecording(false); setSavingAudio(true); setElapsed(Math.round(duration)); }
        try {
          await current.pending;
          if (current.failure) throw current.failure;
          await finishRecording(id, duration);
          await refreshRecordings();
          if (autoDownload) {
            try { await downloadRecording(id, ownerId); }
            catch { if (mounted.current) setMessage('Audio saved locally. Tap Download audio to save it to Files or Downloads.'); }
          }
          if (mounted.current && !current.failure) {
            setMessage('Audio saved locally: ' + name + '. Use Download audio if your browser did not download automatically.');
          }
        } catch {
          if (mounted.current) setMessage('Recording was interrupted. Check Saved recordings for recoverable audio and download it now.');
          await refreshRecordings();
        }
        if (mounted.current) setSavingAudio(false);
        if (recorder.current === capture) recorder.current = null;
        if (mounted.current && !speechCommitted.current.trim() && !contentRef.current.trim() && duration <= 120 && current.bytes <= MAX_TRANSCRIPTION_BYTES && !current.failure) {
          try {
            const stored = await loadRecording(id, ownerId);
            await transcribe(new File([stored.audio], stored.name, { type: stored.mimeType }));
          } catch { /* The separately saved audio remains available. */ }
        }
        if (session.current === current) session.current = null;
      };
      capture.start(5000);
      setRecording(true);
      startSpeech();
      timer.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - current.started) / 1000);
        if (mounted.current) setElapsed(Math.min(seconds, MAX_RECORDING_SECONDS));
        if (seconds >= MAX_RECORDING_SECONDS && capture.state === 'recording') capture.stop();
      }, 1000);
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => { wake.current = lock; }).catch(() => {});
      }
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (mounted.current) setMessage(error?.message || 'Microphone access is unavailable. You can choose an audio file instead.');
    } finally {
      if (mounted.current) setRequesting(false);
    }
  }

  async function download(id) {
    try {
      await downloadRecording(id, ownerId);
      setMessage('Download requested. Check your device’s Downloads or Files app.');
    } catch (error) {
      setMessage(error.message || 'Could not download this recording.');
    }
  }

  async function useSaved(id) {
    try {
      const stored = await loadRecording(id, ownerId);
      if (stored.durationSeconds > MAX_TRANSCRIPTION_SECONDS || stored.bytes > MAX_TRANSCRIPTION_BYTES) {
        setMessage('This audio exceeds the 30-minute / 50 MB on-device transcription limit. The audio can still be downloaded.');
        return;
      }
      await transcribe(new File([stored.audio], stored.name, { type: stored.mimeType }));
    } catch (error) { setMessage(error.message || 'Could not load saved audio.'); }
  }

  async function removeSaved(id) {
    if (!window.confirm('Delete this audio from this device? Download a copy first if needed.')) return;
    try { await deleteRecording(id, ownerId); await refreshRecordings(); setMessage('Local recording deleted.'); }
    catch { setMessage('Could not delete this recording.'); }
  }

  function changeAutoDownload(checked) {
    setAutoDownload(checked);
    try { localStorage.setItem('mjw-life-auto-audio-download', String(checked)); } catch { /* Optional preference. */ }
  }

  return <section className="feature-section">
    <h2>Audio and transcripts</h2>
    <p className="muted">Record for up to 120 minutes. Audio is stored on this device while recording and is downloadable separately after stopping. Keep MJW Life open and the screen awake. Live recognition may use your browser provider’s speech service.</p>
    <div className="fields">
      <label>Language<select value={language} disabled={working || recording || requesting} onChange={event => setLanguage(event.target.value)}>
        <option value="auto">English (live) / detect automatically (file)</option>
        <option value="en">English</option><option value="af">Afrikaans</option>
      </select></label>
      <label><span><UploadSimple size={17} /> Audio file</span><input type="file" accept="audio/*,.mp4,.webm,.m4a" disabled={working || recording || requesting}
        onChange={event => { const selected = event.target.files[0]; event.target.value = ''; if (selected) transcribe(selected); }} /></label>
      <small>File transcription: up to 50 MB / 30 minutes on this device. New recordings: up to 120 minutes with live text where supported.</small>
      {typeof MediaRecorder !== 'undefined' && <div className="recording-controls">
        <button className={recording ? 'primary' : 'secondary'} disabled={working || requesting || savingAudio} onClick={record}>
          <Microphone size={18} /> {recording ? 'Stop and save audio' : 'Record voice note'}</button>
        <strong className="recording-timer" aria-live="off">{elapsedLabel(elapsed)} / 02:00:00</strong>
      </div>}
      <label className="tick"><input type="checkbox" disabled={recording} checked={autoDownload} onChange={event => changeAutoDownload(event.target.checked)} />
        Also request a download automatically when recording stops</label>
      {recording && <p role="status" className="recording-active">Recording and saving audio locally…</p>}
      {savingAudio && <p role="status">Finalising your audio file…</p>}
      {liveStatus && <p role="status" className="muted">{liveStatus}</p>}
      {message && <p role="status">{message}</p>}
      {working ? <button className="quiet" onClick={cancel}>Cancel transcription</button>
        : file && <button className="quiet" disabled={recording || requesting} onClick={() => transcribe(file)}>Transcribe again</button>}
      <label>Review or paste transcript<textarea value={content} readOnly={working} onChange={event => {
        setContent(event.target.value);
        if (recording) { speechBase.current = event.target.value; speechCommitted.current = ''; }
      }}
        rows="7" maxLength="30000" placeholder="Live speech appears here when supported. You can also dictate or paste using Wispr Flow." /></label>
      {recordings.length > 0 && <section className="saved-audio">
        <h3>Saved recordings on this device</h3>
        <p className="muted">Recordings remain here until deleted or browser storage is cleared. Download important audio to Files for a separate copy.</p>
        <ul>{recordings.slice(0, 30).map(item => <li key={item.id} className="saved-audio-row">
          <div><strong>{item.name}</strong><small>{stamp(item.createdAt)} · {elapsedLabel(item.durationSeconds)} · {(item.bytes / 1048576).toFixed(1)} MB{item.status !== 'saved' ? ' · Recoverable' : ''}</small></div>
          <div className="section-actions">
            <button className="secondary" disabled={recording || requesting || savingAudio} onClick={() => download(item.id)}><DownloadSimple size={17} /> Download audio</button>
            <button className="quiet" disabled={working || recording || savingAudio || item.durationSeconds > MAX_TRANSCRIPTION_SECONDS || item.bytes > MAX_TRANSCRIPTION_BYTES}
              onClick={() => useSaved(item.id)}>Transcribe</button>
            <button className="quiet" aria-label={'Delete ' + item.name} disabled={recording || savingAudio} onClick={() => removeSaved(item.id)}><Trash size={18} /></button>
          </div>
        </li>)}</ul>
      </section>}
      <label>Area<select value={area} onChange={event => { setArea(event.target.value); setEventId(''); }}>{areas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Link to an event (optional)<select value={eventId} onChange={event => setEventId(event.target.value)}><option value="">None</option>
        {records.filter(item => item.area === area && isEvent(item)).map(item => <option key={item.id} value={item.id}>{item.planned} · {item.title}</option>)}</select></label>
      <button className="primary" disabled={!content.trim() || working || recording} onClick={() => open({ kind: 'note', area, day, detail: content, title: 'Transcript', relatedId: eventId })}>Review and save as note</button>
    </div>
  </section>;
}
