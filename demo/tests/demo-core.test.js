const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const corePath = path.join(__dirname, '..', 'demo-core.js');
const core = require(corePath);

test('createGame builds only the public Identità turtle layout', () => {
  const game = core.createGame(6, 6, 1234, 1.6);
  assert.equal(game.level, 1);
  assert.equal(game.layoutLabel, 'Tartaruga');
  assert.equal(game.pairs, 6);
  assert.equal(game.tiles.length, 12);
  assert.equal(new Set(game.tiles.map(t => t.matchKey)).size, 6);
});

test('findFreePair returns two currently free matching tiles', () => {
  const game = core.createGame(8, 8, 9876, 1.4);
  const removed = new Set();
  const pair = core.findFreePair(game, removed);
  assert.ok(pair);
  assert.equal(pair.length, 2);
  assert.equal(pair[0].matchKey, pair[1].matchKey);
  const freeIds = new Set(core.freeTiles(game, removed).map(t => t.tileId));
  assert.ok(freeIds.has(pair[0].tileId));
  assert.ok(freeIds.has(pair[1].tileId));
});

test('repeated free-pair removal can clear the entire board', () => {
  const game = core.createGame(12, 12, 424242, 1.7);
  const removed = new Set();
  let guard = 0;

  while (removed.size < game.tiles.length && guard++ < 100) {
    const pair = core.findFreePair(game, removed);
    assert.ok(pair, `expected a removable pair with ${game.tiles.length - removed.size} tiles left`);
    removed.add(pair[0].tileId);
    removed.add(pair[1].tileId);
  }

  assert.equal(removed.size, game.tiles.length);
});
