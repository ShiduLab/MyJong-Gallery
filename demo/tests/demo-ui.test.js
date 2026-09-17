const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(name){
  return fs.readFileSync(path.join(root, name), 'utf8');
}

test('demo HTML exposes local-photo flow, four levels, HINT and JUMP', () => {
  const html = read('index.html');
  for (const id of ['photoInput', 'startGame', 'hintBtn', 'jumpBtn', 'board']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.equal((html.match(/class="level-card/g) || []).length, 4);
  assert.match(html, /Scarica il gioco/);
  assert.match(html, /releases\/tag\/v26/);
});

test('only Identità is interactive and the other levels are disabled', () => {
  const html = read('index.html');
  assert.match(html, /data-level="1"[^>]*class="level-card active"|class="level-card active"[^>]*data-level="1"/);
  for (const level of ['2', '3', '4']) {
    const re = new RegExp(`<button[^>]*data-level=["']${level}["'][^>]*disabled`, 'i');
    assert.match(html, re);
  }
});

test('browser app contains no LAN or photo-upload networking code', () => {
  const app = read('demo-app.js');
  assert.doesNotMatch(app, /\bLAN\b/i);
  assert.doesNotMatch(app, /XMLHttpRequest/);
  assert.doesNotMatch(app, /\bfetch\s*\(/);
  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /URL\.revokeObjectURL/);
});
