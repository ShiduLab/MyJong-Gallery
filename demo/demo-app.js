(()=>{
  'use strict';

  const $ = selector => document.querySelector(selector);
  const core = window.MyJongDemoCore;
  const releaseUrl = 'https://github.com/ShiduLab/MyJong-Gallery/releases/tag/v26';

  const state = {
    photos: [],
    game: null,
    removed: new Set(),
    first: null,
    wrong: new Set(),
    hint: new Set(),
    busy: false,
    moves: 0,
    matches: 0,
    startAt: 0,
    timerId: null,
    hintTimer: null
  };

  const els = {
    pickPhotos: $('#pickPhotos'),
    clearGallery: $('#clearGallery'),
    photoInput: $('#photoInput'),
    photoCount: $('#photoCount'),
    pairPreview: $('#pairPreview'),
    startGame: $('#startGame'),
    board: $('#board'),
    statusText: $('#statusText'),
    statusSub: $('#statusSub'),
    moves: $('#moves'),
    matches: $('#matches'),
    totalPairs: $('#totalPairs'),
    timer: $('#timer'),
    hintBtn: $('#hintBtn'),
    jumpBtn: $('#jumpBtn')
  };

  function init(){
    els.pickPhotos.addEventListener('click', () => els.photoInput.click());
    els.clearGallery.addEventListener('click', clearPhotos);
    els.photoInput.addEventListener('change', event => importPhotos(event.target.files));
    els.startGame.addEventListener('click', startGame);
    els.hintBtn.addEventListener('click', showHint);
    els.jumpBtn.addEventListener('click', jumpPair);
    window.addEventListener('resize', () => state.game && renderBoard());
    window.addEventListener('beforeunload', revokeAllPhotoUrls);
    updateControls();
  }

  function importPhotos(fileList){
    revokeAllPhotoUrls();
    const files = [...(fileList || [])]
      .filter(file => file.type.startsWith('image/'))
      .slice(0, 48);

    state.photos = files.map((file, index) => ({
      id: `photo-${index}`,
      name: file.name,
      url: URL.createObjectURL(file)
    }));

    els.photoInput.value = '';
    resetBoard();
    updateControls();

    if (state.photos.length >= 2){
      setStatus('Galleria pronta.', `${state.photos.length} foto locali · puoi iniziare.`);
    } else if (state.photos.length === 1){
      setStatus('Serve ancora una foto.', 'La demo parte da 2 immagini.');
    } else {
      setStatus('Scegli almeno 2 foto.', 'Demo · Identità · Tartaruga');
    }
  }

  function clearPhotos(){
    revokeAllPhotoUrls();
    state.photos = [];
    resetBoard();
    updateControls();
    setStatus('Scegli almeno 2 foto.', 'Demo · Identità · Tartaruga');
  }

  function revokeAllPhotoUrls(){
    for (const photo of state.photos){
      URL.revokeObjectURL(photo.url);
    }
  }

  function wantedPairs(){
    return Math.min(24, state.photos.length);
  }

  function updateControls(){
    const pairs = wantedPairs();
    els.photoCount.textContent = `${state.photos.length} foto`;
    els.pairPreview.textContent = `${pairs} coppie`;
    els.startGame.disabled = state.photos.length < 2;
    els.hintBtn.disabled = !state.game;
    els.jumpBtn.disabled = !state.game;
  }

  function startGame(){
    if (state.photos.length < 2){
      setStatus('Servono almeno 2 foto.', 'Le immagini restano soltanto nel browser.');
      return;
    }

    stopTimer();
    state.removed = new Set();
    state.first = null;
    state.wrong = new Set();
    state.hint = new Set();
    state.moves = 0;
    state.matches = 0;
    state.busy = false;

    const pairs = wantedPairs();
    const seed = Date.now() & 0xffffffff;
    const aspect = Math.max(1, els.board.clientWidth / Math.max(420, els.board.clientHeight));
    const game = core.createGame(state.photos.length, pairs, seed, aspect);

    if (game.error){
      setStatus('Tavolo non disponibile.', 'Riprova con una nuova partita.');
      return;
    }

    attachPhotos(game, seed);
    state.game = game;
    state.startAt = Date.now();
    state.timerId = setInterval(updateTimer, 1000);

    els.moves.textContent = '0';
    els.matches.textContent = '0';
    els.totalPairs.textContent = String(game.pairs);
    updateTimer();
    renderBoard();
    updateControls();
    setStatus('MyJong.', `${game.tiles.length} tessere · Identità · ${game.layoutLabel}.`);
  }

  function attachPhotos(game, seed){
    const groups = new Map();
    for (const tile of game.tiles){
      if (!groups.has(tile.matchKey)) groups.set(tile.matchKey, []);
      groups.get(tile.matchKey).push(tile);
    }

    [...groups.values()].forEach((pair, index) => {
      const photo = state.photos[index % state.photos.length];
      const point = cropPoint(seed + index * 911);
      for (const tile of pair){
        tile.photo = photo;
        tile.crop = point;
      }
    });
  }

  function cropPoint(seed){
    const x = 25 + pseudo(seed) * 50;
    const y = 25 + pseudo(seed + 97) * 50;
    return { x, y };
  }

  function pseudo(seed){
    const n = Math.sin(seed * 12.9898) * 43758.5453;
    return n - Math.floor(n);
  }

  function resetBoard(){
    stopTimer();
    clearTimeout(state.hintTimer);
    state.game = null;
    state.removed = new Set();
    state.first = null;
    state.wrong = new Set();
    state.hint = new Set();
    state.moves = 0;
    state.matches = 0;

    els.moves.textContent = '0';
    els.matches.textContent = '0';
    els.totalPairs.textContent = '0';
    els.timer.textContent = '00:00';
    els.board.className = 'board empty';
    els.board.innerHTML = '<div class="empty-state"><div class="empty-mark">MJ</div><p>Le tessere nasceranno qui.</p></div>';
    updateControls();
  }

  function renderBoard(){
    if (!state.game) return;

    const free = new Set(core.freeTiles(state.game, state.removed).map(tile => tile.tileId));
    const active = state.game.tiles.filter(tile => !state.removed.has(tile.tileId));

    els.board.className = 'board';
    els.board.innerHTML = '';

    const metrics = boardMetrics(active);

    for (const tile of state.game.tiles){
      if (state.removed.has(tile.tileId)) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tile';
      button.dataset.id = tile.tileId;
      button.setAttribute('aria-label', free.has(tile.tileId) ? 'Tessera libera' : 'Tessera bloccata');

      if (free.has(tile.tileId)) button.classList.add('free');
      else button.classList.add('blocked');

      if (state.first === tile.tileId) button.classList.add('selected');
      if (state.wrong.has(tile.tileId)) button.classList.add('wrong');
      if (state.hint.has(tile.tileId)) button.classList.add('hint-match');

      button.disabled = !free.has(tile.tileId) || state.busy;
      button.innerHTML = `<img src="${escapeAttr(tile.photo.url)}" alt="" style="object-position:${tile.crop.x.toFixed(1)}% ${tile.crop.y.toFixed(1)}%">`;
      positionTile(button, tile, metrics);
      button.addEventListener('click', () => chooseTile(tile));
      els.board.appendChild(button);
    }
  }

  function boardMetrics(active){
    const slots = active.map(tile => tile.slot);
    const minX = Math.min(...slots.map(slot => slot.x));
    const maxX = Math.max(...slots.map(slot => slot.x));
    const minY = Math.min(...slots.map(slot => slot.y));
    const maxY = Math.max(...slots.map(slot => slot.y));
    const maxZ = Math.max(...slots.map(slot => slot.z));

    const widthUnits = Math.max(1, maxX - minX + 1 + maxZ * 0.42);
    const heightUnits = Math.max(1, maxY - minY + 1.28 + maxZ * 0.34);
    const boardW = Math.max(300, els.board.clientWidth);
    const boardH = Math.max(420, els.board.clientHeight);
    const pad = Math.max(18, Math.min(boardW, boardH) * 0.045);
    const tileW = Math.max(34, Math.min(104, (boardW - pad * 2) / widthUnits, (boardH - pad * 2) / (heightUnits * 1.28)));
    const tileH = tileW * 1.28;
    const drawingW = widthUnits * tileW;
    const drawingH = heightUnits * tileH;

    return {
      minX,
      minY,
      tileW,
      tileH,
      originX: Math.max(pad, (boardW - drawingW) / 2),
      originY: Math.max(pad, (boardH - drawingH) / 2)
    };
  }

  function positionTile(element, tile, metrics){
    const { slot } = tile;
    const x = metrics.originX + (slot.x - metrics.minX) * metrics.tileW + slot.z * metrics.tileW * 0.18;
    const y = metrics.originY + (slot.y - metrics.minY) * metrics.tileH - slot.z * metrics.tileH * 0.16;

    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${metrics.tileW}px`;
    element.style.height = `${metrics.tileH}px`;
    element.style.zIndex = String(100 + slot.z * 1000 + Math.round(slot.y * 10));
    element.style.setProperty('--thickness', `${Math.max(5, metrics.tileW * 0.1)}px`);
  }

  function chooseTile(tile){
    if (state.busy || !state.game) return;
    const freeIds = new Set(core.freeTiles(state.game, state.removed).map(item => item.tileId));
    if (!freeIds.has(tile.tileId)) return;

    if (state.first === tile.tileId){
      state.first = null;
      renderBoard();
      return;
    }

    if (!state.first){
      state.first = tile.tileId;
      renderBoard();
      return;
    }

    const first = state.game.tiles.find(item => item.tileId === state.first);
    state.moves += 1;
    els.moves.textContent = String(state.moves);

    if (first && first.matchKey === tile.matchKey){
      state.removed.add(first.tileId);
      state.removed.add(tile.tileId);
      state.matches += 1;
      state.first = null;
      els.matches.textContent = String(state.matches);
      renderBoard();
      checkEnd();
      return;
    }

    state.busy = true;
    state.wrong = new Set([state.first, tile.tileId]);
    renderBoard();
    setTimeout(() => {
      state.first = null;
      state.wrong = new Set();
      state.busy = false;
      renderBoard();
    }, 430);
  }

  function showHint(){
    if (!state.game || state.busy) return;
    const pair = core.findFreePair(state.game, state.removed);

    if (!pair){
      setStatus('HINT', 'Non trovo due tessere libere. Usa JUMP.');
      return;
    }

    clearTimeout(state.hintTimer);
    state.hint = new Set(pair.map(tile => tile.tileId));
    renderBoard();
    setStatus('HINT · coppia evidenziata', 'Le due tessere sono libere e corrispondono.');

    state.hintTimer = setTimeout(() => {
      state.hint = new Set();
      if (state.game) renderBoard();
      if (state.game) setStatus('MyJong.', `${state.game.tiles.length - state.removed.size} tessere rimaste.`);
    }, 2400);
  }

  function jumpPair(){
    if (!state.game || state.busy) return;
    const pair = core.findFreePair(state.game, state.removed);

    if (!pair){
      setStatus('JUMP', 'Non trovo una coppia da saltare.');
      return;
    }

    state.removed.add(pair[0].tileId);
    state.removed.add(pair[1].tileId);
    state.first = null;
    state.hint = new Set();
    state.moves += 1;
    state.matches += 1;
    els.moves.textContent = String(state.moves);
    els.matches.textContent = String(state.matches);
    setStatus('JUMP · coppia rimossa', 'La partita continua.');
    renderBoard();
    checkEnd();
  }

  function checkEnd(){
    if (!state.game) return;
    if (state.removed.size === state.game.tiles.length){
      stopTimer();
      setStatus('Tavolo completato.', `${state.moves} mosse · ${els.timer.textContent}.`);
      return;
    }

    const next = core.findFreePair(state.game, state.removed);
    if (!next) setStatus('Nessuna coppia evidente.', 'JUMP resta disponibile.');
  }

  function updateTimer(){
    if (!state.startAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - state.startAt) / 1000));
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    els.timer.textContent = `${mm}:${ss}`;
  }

  function stopTimer(){
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.startAt = 0;
  }

  function setStatus(main, sub){
    els.statusText.textContent = main;
    els.statusSub.textContent = sub;
  }

  function escapeAttr(value){
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  document.addEventListener('DOMContentLoaded', init);
  void releaseUrl;
})();
