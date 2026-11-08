import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Today and FPG navigation cards use a shared gap container', () => {
  assert.match(app, /className="today-highlights"/);
  assert.match(app, /className="area-shortcuts"/);
  assert.match(css, /\.today-highlights,\.area-shortcuts\s*\{[\s\S]*?gap:var\(--card-gap\)/);
  assert.match(css, /\.today-highlights>\.summary-row,\.area-shortcuts>\.summary-row\s*\{[\s\S]*?margin:0/);
  assert.match(css, /--card-gap:12px/);
});

test('mobile at 320px and narrow layouts retain full-width content and touch targets', () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(css, /body\{min-width:320px;\}/);
  assert.match(css, /@media\(max-width:359px\)/);
  assert.match(css, /@media\(max-width:599px\)/);
  assert.match(css, /\.nav button\{min-width:0;min-height:56px;\}/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.summary-row>span/);
});

test('tablet portrait cancels early desktop columns and remains usable in landscape', () => {
  assert.match(css, /@media\(min-width:700px\) and \(max-width:1099px\)/);
  assert.match(css, /@media\(min-width:800px\) and \(max-width:1099px\)/);
  assert.match(css, /\.today-grid\{display:block;\}/);
  assert.match(css, /\.side-deck\s*\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(min-width:1100px\)/);
});

test('desktop workstation gets usable content width and accessible rail navigation', () => {
  assert.match(css, /@media\(min-width:1280px\) and \(pointer:fine\)/);
  assert.match(css, /max-width:1620px/);
  assert.match(css, /grid-template-columns:210px minmax\(0,1fr\)/);
  assert.match(css, /\.shell>\.nav\s*\{[\s\S]*?position:sticky/);
  assert.match(css, /\.shell>\.nav button\s*\{[\s\S]*?min-height:52px/);
});

test('responsive layout preserves primary identity and app navigation', () => {
  assert.match(app, /<Brand \/>/);
  assert.match(app, /<RibbonMark className="nav-ribbon" \/>/);
  assert.match(app, /aria-label="Main navigation"/);
  assert.match(app, /aria-label="Key sections"/);
  assert.match(app, /onClick=\{\(\) => navigate\('catchup'\)\}/);
  assert.match(app, /onClick=\{\(\) => navigate\('properties'\)\}/);
});
