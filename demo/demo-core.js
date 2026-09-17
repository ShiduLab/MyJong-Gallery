(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MyJongDemoCore = api;
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(input, seed){
    const out = [...input];
    const rnd = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i--){
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function overlap1d(a1, a2, b1, b2){
    return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  }

  function overlapArea(a, b){
    return overlap1d(a.x, a.x + 1, b.x, b.x + 1) *
      overlap1d(a.y, a.y + 1, b.y, b.y + 1);
  }

  function isFree(slot, activeSlots){
    for (const other of activeSlots){
      if (other.id === slot.id) continue;
      if (other.z > slot.z && overlapArea(slot, other) > 0.18) return false;
    }

    let leftBlocked = false;
    let rightBlocked = false;

    for (const other of activeSlots){
      if (other.id === slot.id || other.z !== slot.z) continue;
      const yOverlap = overlap1d(slot.y, slot.y + 1, other.y, other.y + 1);
      if (yOverlap < 0.42) continue;

      if (Math.abs((other.x + 1) - slot.x) < 0.18) leftBlocked = true;
      if (Math.abs((slot.x + 1) - other.x) < 0.18) rightBlocked = true;
    }

    return !leftBlocked || !rightBlocked;
  }

  function evenFloor(n){
    return Math.max(0, Math.floor(n / 2) * 2);
  }

  function gridLayer(count, z, aspect, offset){
    if (!count) return [];
    const cols = Math.max(2, Math.ceil(Math.sqrt(count * Math.max(0.8, aspect))));
    const rows = Math.ceil(count / cols);
    const cells = [];

    for (let y = 0; y < rows; y++){
      for (let x = 0; x < cols; x++){
        cells.push({
          x: x - (cols - 1) / 2,
          y: y - (rows - 1) / 2,
          score: Math.hypot(
            (x - (cols - 1) / 2) / Math.max(1, cols),
            (y - (rows - 1) / 2) / Math.max(1, rows)
          )
        });
      }
    }

    cells.sort((a, b) => a.score - b.score || Math.abs(a.y) - Math.abs(b.y));
    const chosen = cells.slice(0, count);
    chosen.sort((a, b) => a.y - b.y || a.x - b.x);

    return chosen.map((p, index) => ({
      id: `z${z}-${index}`,
      x: p.x + offset,
      y: p.y + offset,
      z
    }));
  }

  function turtleSlots(total, aspect){
    let top = total >= 24 ? 2 : 0;
    let middle = total >= 12 ? evenFloor(Math.max(2, total * 0.2)) : 0;
    if (middle + top > total - 6) middle = Math.max(0, evenFloor(total - top - 6));
    const base = total - middle - top;

    const slots = [
      ...gridLayer(base, 0, aspect, 0),
      ...gridLayer(middle, 1, Math.max(0.9, aspect * 0.72), 0.42),
      ...gridLayer(top, 2, 1, 0.84)
    ];

    return slots.map((slot, index) => ({ ...slot, id: `s${index}` }));
  }

  function planRemoval(slots, seed){
    const active = new Set(slots.map(s => s.id));
    const rnd = mulberry32(seed);
    const pairs = [];
    let guard = 0;

    while (active.size){
      if (++guard > slots.length * 4) return null;
      const activeSlots = slots.filter(s => active.has(s.id));
      const free = activeSlots.filter(s => isFree(s, activeSlots));
      if (free.length < 2) return null;

      const shuffled = shuffle(free, Math.floor(rnd() * 0xffffffff));
      const a = shuffled[0];
      let b = shuffled[1];

      for (const candidate of shuffled.slice(1)){
        if (candidate.z === a.z && Math.abs(candidate.x - a.x) > Math.abs(b.x - a.x)){
          b = candidate;
        }
      }

      pairs.push([a.id, b.id]);
      active.delete(a.id);
      active.delete(b.id);
    }

    return pairs;
  }

  function openFallback(total, aspect){
    const cols = Math.max(2, Math.ceil(Math.sqrt(total * Math.max(0.8, aspect))));
    const rows = Math.ceil(total / cols);
    const slots = [];
    let serial = 0;
    for (let y = 0; y < rows && serial < total; y++){
      const take = Math.min(cols, total - serial);
      for (let x = 0; x < take; x++){
        slots.push({
          id: `s${serial}`,
          x: x - (take - 1) / 2,
          y: y - (rows - 1) / 2,
          z: 0
        });
        serial++;
      }
    }
    return slots;
  }

  function createGame(photoCount, wantedPairs, seed = Date.now(), aspect = 1.5){
    const usablePhotos = Math.max(0, Number(photoCount) || 0);
    if (usablePhotos < 2) return { error: 'no-photos' };

    const pairs = Math.max(2, Math.min(24, Math.floor(Number(wantedPairs) || usablePhotos)));
    const total = pairs * 2;
    let slots = turtleSlots(total, aspect);
    let solution = planRemoval(slots, seed + 17);

    if (!solution){
      slots = openFallback(total, aspect);
      solution = planRemoval(slots, seed + 29);
    }

    if (!solution) return { error: 'layout' };

    const keyBySlot = new Map();
    solution.forEach((pair, index) => {
      keyBySlot.set(pair[0], `p${index}`);
      keyBySlot.set(pair[1], `p${index}`);
    });

    const tiles = slots.map((slot, index) => ({
      tileId: `t${index}`,
      matchKey: keyBySlot.get(slot.id),
      slot
    }));

    return {
      level: 1,
      layoutLabel: 'Tartaruga',
      pairs,
      tiles,
      solution
    };
  }

  function activeTiles(game, removedIds){
    const removed = removedIds instanceof Set ? removedIds : new Set(removedIds || []);
    return game.tiles.filter(tile => !removed.has(tile.tileId));
  }

  function freeTiles(game, removedIds){
    const active = activeTiles(game, removedIds);
    const slots = active.map(tile => tile.slot);
    return active.filter(tile => isFree(tile.slot, slots));
  }

  function findFreePair(game, removedIds){
    const free = freeTiles(game, removedIds);
    const byKey = new Map();

    for (const tile of free){
      if (!byKey.has(tile.matchKey)) byKey.set(tile.matchKey, []);
      const group = byKey.get(tile.matchKey);
      group.push(tile);
      if (group.length === 2) return group;
    }

    return null;
  }

  return {
    createGame,
    freeTiles,
    findFreePair
  };
});
