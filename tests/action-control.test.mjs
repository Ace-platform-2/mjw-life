import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionSignals, buildingSnapshot, controlSummary, datedActivity, daysBetween } from '../src/action-control.js';

const day='2026-11-09';
const log=(id, extra={})=>({id,kind:'fpg_log',area:'fpg',buildingId:'b1',propertyType:'maintenance',title:id,status:'open',...extra});
const task=(id,extra={})=>({id,kind:'task',area:'mornay',title:id,status:'open',...extra});

test('prioritises overdue and escalated records while excluding closed or suggested items',()=>{
 const records=[
   log('critical',{escalated:true,due:'2026-11-08'}),
   log('later',{due:'2026-11-25'}),
   log('closed',{status:'closed',due:'2026-11-01'}),
   task('today',{due:day}),
   task('suggestion',{suggested:true,due:day}),
 ];
 const review=controlSummary(records,day);
 assert.equal(review.open,3);
 assert.equal(review.urgent,2);
 assert.equal(review.overdue,1);
 assert.deepEqual(review.attention.map(x=>x.id),['critical','today']);
 assert.ok(review.attention[0].reasons.includes('Escalated'));
 assert.equal(daysBetween('2026-11-02',day),7);
});

test('open property budgets remain visible without fabricated deadlines',()=>{
 const records=[
  log('budget',{propertyType:'budget',owner:'Manager',nextAction:'Complete forecast'}),
  log('missing',{propertyType:'budget',due:'2026-11-07'}),
  log('incident',{propertyType:'incident'}),
 ];
 const summary=controlSummary(records,day,{scope:'fpg'});
 assert.equal(summary.budgets,2);
 assert.equal(summary.urgent,1);
 assert.equal(summary.missingOwner,2);
 assert.equal(summary.unscheduled,2);
 assert.equal(summary.attention.filter(row=>row.budget).length,2);
 assert.ok(summary.attention.find(row=>row.id==='budget').reasons.includes('Follow-up date needed'));
});

test('arrears distinguishes zero, unknown and known balances without inventing totals',()=>{
 const records=[
  log('a',{propertyType:'arrears',amount:0}),
  log('b',{propertyType:'arrears',amount:null}),
  log('c',{propertyType:'arrears',amount:100250}),
  log('d',{propertyType:'arrears',amount:999999,buildingId:'other'}),
  log('v',{propertyType:'vacancy',floorArea:12}),
 ];
 const snapshot=buildingSnapshot(records,'b1',day);
 assert.equal(snapshot.arrearsCases,3);
 assert.equal(snapshot.knownArrearsCents,100250);
 assert.equal(snapshot.arrearsBalanceMissing,1);
 assert.equal(snapshot.vacancies,1);
});

test('separates FPG and personal views; counts overdue waiting follow-ups',()=>{
 const records=[log('budget',{propertyType:'budget'}), task('personal',{status:'waiting',followup:'2026-11-03'}),
  task('work',{area:'fpg',due:day}), task('done',{completed:'2026-11-08',due:'2026-11-01'})];
 assert.equal(controlSummary(records,day,{scope:'fpg'}).open,2);
 assert.equal(controlSummary(records,day,{scope:'personal'}).open,1);
 assert.equal(controlSummary(records,day).waiting,1);
 assert.equal(controlSummary(records,day).overdue,1);
 assert.equal(actionSignals(records[1],day).followupDays,6);
});

test('dated activity uses saved dates only, excludes irrelevant system records and no phantom activity',()=>{
 const records=[
  log('notice',{day:'2026-11-05'}),
  task('receipt',{receivedOn:'2026-11-06'}),
  task('old',{day:'2026-10-30'}),
  task('undated'),
  {id:'sync',kind:'gmail_sync',day:'2026-11-04'},
 ];
 assert.deepEqual(datedActivity(records,'2026-11-02',day).map(x=>x.id),['receipt','notice']);
 assert.deepEqual(datedActivity(records,'2026-11-12',day),[]);
 assert.deepEqual(datedActivity(records,'wrong',day),[]);
});
