import React, { useState } from 'react';
import { DownloadSimple, FileText } from '@phosphor-icons/react';
import { Dialog } from './Editor.jsx';
import { DeletePropertyRecord } from './PropertyEditor.jsx';
import { documentFileAccept } from './store.js';

const categories = { floorplan: 'Floorplan', document: 'Important document' };

export function BuildingDocuments({ building, documents, open, downloadDocument }) {
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');
  const files = documents.filter(item => item.buildingId === building.id).sort((a, b) =>
    (b.day || '').localeCompare(a.day || '') || a.title.localeCompare(b.title));

  async function download(item) {
    setError('');
    setDownloading(item.id);
    if (!await downloadDocument(item)) setError('Could not download this file. Try again.');
    setDownloading('');
  }

  return <section className="feature-section" aria-label="Building documents">
    <div className="section-actions"><h2>Building documents</h2>
      <button className="secondary" onClick={() => open({ kind: 'fpg_document', buildingId: building.id })}>Add files</button>
    </div>
    {Object.entries({ floorplan: 'Floorplans', document: 'Important documents' }).map(([category, label]) => {
      const group = files.filter(item => item.category === category);
      return group.length > 0 && <section className="property-file-group" key={category}>
        <h3>{label}</h3>
        <ul>{group.map(item => <li className="row" key={item.id}>
          <button className="row-detail" aria-label={'Edit ' + item.title} onClick={() => open(item)}>
            <FileText size={18} /><span>{item.title}{item.title !== item.filename && <small>{item.filename}</small>}</span>
          </button>
          <button className="quiet property-file-download" aria-label={'Download ' + item.title}
            disabled={Boolean(downloading)} onClick={() => download(item)}>
            <DownloadSimple size={17} /> {downloading === item.id ? 'Opening…' : 'Download'}
          </button>
        </li>)}</ul>
      </section>;
    })}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function BuildingDocumentEditor({ item, building, day, close, save, saveAttachments, busy, error }) {
  const [pending, setPending] = useState([]);
  const [validation, setValidation] = useState('');

  function selectFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setValidation('');
    if (item.id) setPending([{ id: item.id, file: files[0] }]);
    else setPending(current => [...current, ...files.map(file => ({ id: crypto.randomUUID(), file }))]);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title') || '').trim();
    const category = values.get('category');
    if (!building || !Object.hasOwn(categories, category)) return setValidation('Choose a property and file category.');
    if (item.id && !title) return setValidation('Enter a title.');
    if (!item.id && !pending.length) return setValidation('Choose one or more files.');
    setValidation('');

    const record = { ...item, area: 'fpg', category, title, detail: String(values.get('detail') || '').trim(), day: item.day || day };
    const success = pending.length
      ? await saveAttachments(pending.map(({ id, file }) => ({
        record: { ...record, id, title: title || (file.name.replace(/\.[^.]+$/, '').trim() || file.name).slice(0, 180) }, file,
      })))
      : await save(record);
    if (success) close();
  }

  return <Dialog title={item.id ? 'Edit building file' : 'Add building files'} close={close} busy={busy}>
    {building && <p className="muted">{building.title}</p>}
    <form className="property-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>Category<select name="category" defaultValue={item.category || 'document'}>
          {Object.entries(categories).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        {item.id && <label>Title<input name="title" defaultValue={item.title} maxLength="180" required /></label>}
        {item.filename && <p className="property-note">{item.filename}</p>}
        <label>{item.id ? 'Replace file' : 'Choose files'}<input type="file" accept={documentFileAccept} multiple={!item.id} onChange={selectFiles} /></label>
        <small>Up to 10 MB per file.</small>
        {pending.length > 0 && <ul aria-label="Selected files">{pending.map(({ id, file }) => <li className="row" key={id}>
          <span className="file-name">{file.name}</span>
          <button type="button" className="quiet" aria-label={'Remove ' + file.name} onClick={() =>
            setPending(current => current.filter(entry => entry.id !== id))}>Remove</button>
        </li>)}</ul>}
        <label>Notes<textarea name="detail" defaultValue={item.detail} rows="3" maxLength="10000" /></label>
      </fieldset>
      {(validation || error) && <p role="alert">{validation || error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : item.id ? 'Save' : 'Save files'}</button>
    </form>
    {item.id && <DeletePropertyRecord item={item} label="file" save={save} close={close} busy={busy} />}
  </Dialog>;
}
