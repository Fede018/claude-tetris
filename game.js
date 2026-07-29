'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // 8 - tuerca (metal)
  '#546e7a', // 9 - agujero de la tuerca
  '#263238', // 10 - bomba
];

const BOMB_TYPE = 10;
const POWERUP_LINE_INTERVAL = 5; // cada N líneas, la siguiente pieza es una bomba

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,9,8],[8,8,8]],                  // Tuerca
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const highscoreForm = document.getElementById('highscore-form');
const highscoreNameInput = document.getElementById('highscore-name-input');
const saveHighscoreBtn = document.getElementById('save-highscore-btn');
const overlayHighscores = document.getElementById('overlay-highscores');
const startScreen = document.getElementById('start-screen');
const startPlayBtn = document.getElementById('start-play-btn');
const startHighscores = document.getElementById('start-highscores');
const startBestStats = document.getElementById('start-best-stats');
const resetHighscoresBtn = document.getElementById('reset-highscores-btn');

const THEME_STORAGE_KEY = 'tetris-theme';
const HIGHSCORES_STORAGE_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, gridColor, linesSincePowerup;
let pendingHighscoreEntry = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function makeBombPiece() {
  const shape = [[BOMB_TYPE]];
  return { type: BOMB_TYPE, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesSincePowerup += cleared;
    while (linesSincePowerup >= POWERUP_LINE_INTERVAL) {
      linesSincePowerup -= POWERUP_LINE_INTERVAL;
      next = makeBombPiece();
    }
    updateHUD();
  }
}

function explode(cx, cy) {
  let destroyed = 0;
  for (let r = cy - 1; r <= cy + 1; r++) {
    for (let c = cx - 1; c <= cx + 1; c++) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (board[r][c]) destroyed++;
      board[r][c] = 0;
    }
  }
  if (destroyed) score += destroyed * 15;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type === BOMB_TYPE) {
    explode(current.x, current.y);
    updateHUD();
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;

  if (colorIndex === BOMB_TYPE) {
    context.fillStyle = COLORS[BOMB_TYPE];
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.font = `${Math.floor(size * 0.7)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('💣', x * size + size / 2, y * size + size / 2 + 1);
    context.globalAlpha = 1;
    return;
  }

  if (colorIndex === 9) {
    // agujero de la tuerca: anillo metal + círculo del agujero encima
    context.fillStyle = COLORS[8];
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = COLORS[9];
    context.beginPath();
    context.arc(x * size + size / 2, y * size + size / 2, size * 0.28, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    return;
  }

  const color = COLORS[colorIndex];
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    return [];
  }
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HIGHSCORES_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage no disponible (modo privado, cuota excedida, etc.)
  }
}

function isHighscore(candidateScore) {
  const list = loadHighscores();
  if (list.length < MAX_HIGHSCORES) return true;
  const lowest = list[list.length - 1];
  return typeof lowest.score === 'number' && candidateScore > lowest.score;
}

function addHighscore(entry) {
  const list = loadHighscores();
  list.push(entry);
  list.sort((a, b) => (b.score || 0) - (a.score || 0));
  const trimmed = list.slice(0, MAX_HIGHSCORES);
  saveHighscores(trimmed);
  return trimmed;
}

function clearHighscores() {
  try {
    localStorage.removeItem(HIGHSCORES_STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

function renderHighscoreTable(container, highlightEntry) {
  container.textContent = '';
  const list = loadHighscores();

  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'highscore-empty';
    empty.textContent = 'Todavía no hay récords guardados.';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['#', 'Nombre', 'Score', 'Líneas', 'Nivel'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  list.forEach((entry, i) => {
    const row = document.createElement('tr');
    if (
      highlightEntry &&
      entry.name === highlightEntry.name &&
      entry.score === highlightEntry.score &&
      entry.date === highlightEntry.date
    ) {
      row.classList.add('highscore-new');
    }

    const rankCell = document.createElement('td');
    rankCell.textContent = String(i + 1);
    row.appendChild(rankCell);

    const nameCell = document.createElement('td');
    nameCell.textContent = entry.name || '---';
    row.appendChild(nameCell);

    const scoreCell = document.createElement('td');
    scoreCell.textContent = (entry.score || 0).toLocaleString();
    row.appendChild(scoreCell);

    const linesCell = document.createElement('td');
    linesCell.textContent = String(entry.lines || 0);
    row.appendChild(linesCell);

    const levelCell = document.createElement('td');
    levelCell.textContent = String(entry.level || 1);
    row.appendChild(levelCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderStartScreen() {
  renderHighscoreTable(startHighscores, null);
  const list = loadHighscores();
  if (list.length === 0) {
    startBestStats.textContent = '';
    return;
  }
  const bestCombo = Math.max(...list.map(e => e.maxCombo || 0));
  const bestMaxLines = Math.max(...list.map(e => e.maxLines || 0));
  startBestStats.textContent = `Mejor combo: ${bestCombo}  |  Mayor líneas de un golpe: ${bestMaxLines}`;
}

function resetHighscores() {
  if (!confirm('¿Seguro que querés borrar todos los récords guardados?')) return;
  clearHighscores();
  renderStartScreen();
  renderHighscoreTable(overlayHighscores, null);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  const currentMaxCombo = typeof maxCombo !== 'undefined' ? maxCombo : 0;
  const currentMaxLines = typeof maxLines !== 'undefined' ? maxLines : 0;

  if (isHighscore(score)) {
    highscoreForm.classList.remove('hidden');
    highscoreNameInput.value = '';
    overlayHighscores.textContent = '';

    pendingHighscoreEntry = {
      name: '',
      score,
      lines,
      level,
      maxCombo: currentMaxCombo,
      maxLines: currentMaxLines,
      date: new Date().toISOString(),
    };
  } else {
    pendingHighscoreEntry = null;
    highscoreForm.classList.add('hidden');
    renderHighscoreTable(overlayHighscores, null);
  }
}

function saveHighscoreFromForm() {
  if (!pendingHighscoreEntry) return;
  const rawName = highscoreNameInput.value || '';
  const name = rawName.trim().slice(0, 12) || 'Jugador';
  pendingHighscoreEntry.name = name;
  addHighscore(pendingHighscoreEntry);
  highscoreForm.classList.add('hidden');
  renderHighscoreTable(overlayHighscores, pendingHighscoreEntry);
  renderStartScreen();
  pendingHighscoreEntry = null;
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
}

function initTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  setTheme(stored === 'light' ? 'light' : 'dark');
}

function toggleTheme() {
  const theme = themeToggle.checked ? 'light' : 'dark';
  setTheme(theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  draw();
  drawNext();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver || paused) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesSincePowerup = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  highscoreForm.classList.add('hidden');
  pendingHighscoreEntry = null;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggle.addEventListener('change', toggleTheme);
startPlayBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});
resetHighscoresBtn.addEventListener('click', resetHighscores);
saveHighscoreBtn.addEventListener('click', saveHighscoreFromForm);
highscoreNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveHighscoreFromForm();
});

initTheme();
renderStartScreen();
