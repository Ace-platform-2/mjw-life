import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveReport, createMetadataArchive, safeRecord, sourceFreshness } from '../src/data-audit.js';

test('personal export excludes FPG work records and masks vaults without mutating originals', () => {
  const personal={ id:'bank',kind:'bank_account',area:'finance',last4:'1000',vault:{cipher:'secret'} };
  const rows=[
    personal,
    { id:'note',kind:'note',area:'mornay',detail:'Private note' },
    { id:'log',kind:'fpg_log',area:'fpg',title:'Tenant concern' },
    { id:'contact',kind:'fpg_contact',title:'Facilities' },
  ];
  const archive=createMetadataArchive(rows,'2026-11-07T20:00:00Z');
  assert.equal(archive.records.length,2);
  assert.equal(archive.includesEmployerArea,false);
  assert.doesNotMatch(JSON.stringify(archive),/secret|Tenant concern|Facilities/);
  assert.equal(personal.vault.cipher,'secret');
  assert.equal(safeRecord(personal).vault,undefined);
  assert.ok(archive.warnings.some(w=>w.includes('not a full restore')));
});

test('user-authorised work archive inventories attachments without pretending to include binary files',()=>{
  const rows=[
    {id:'doc',kind:'fpg_document',area:'fpg',filename:'Lease.pdf',path:'abc/file.pdf'},
    {id:'log',kind:'fpg_log',area:'fpg',photos:[{path:'abc/photo.jpg',filename:'Roof.jpg'},
      {path:'abc/photo.jpg',filename:'Duplicate.jpg'}]},
  ];
  const report=archiveReport(rows,{includeWork:true});
  assert.equal(report.included,2);
  assert.equal(report.workExcluded,0);
  assert.equal(report.attachmentCount,2);
  const archive=createMetadataArchive(rows,'2026-11-07T20:00:00Z',{includeWork:true});
  assert.equal(archive.attachmentReferences.length,2);
  assert.equal(archive.counts.attachmentsNotIncluded,2);
  assert.equal(archive.records.length,2);
  assert.ok(archive.warnings.some(v=>v.includes('Audio')));
});

test('source freshness distinguishes no checkpoint, recent refresh and stale refresh',()=>{
  const day='2026-11-07';
  assert.equal(sourceFreshness([],day).status,'not-connected');
  const rows=[
    {id:'old',kind:'gmail_sync',checkedAt:'2026-11-01T09:00:00Z'},
    {id:'current',kind:'gmail_sync',checkedAt:'2026-11-07T12:00:00Z'},
  ];
  assert.equal(sourceFreshness(rows,day).status,'recent');
  assert.equal(sourceFreshness(rows.slice(0,1),day).status,'stale');
  assert.equal(sourceFreshness([{kind:'gmail_sync',checkedAt:'invalid'}],day).status,'not-connected');
});
