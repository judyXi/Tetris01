"use strict";

// 遊戲常數
const NUM_COLS = 10;
const NUM_ROWS = 20;
const VIRTUAL_CELL = 24; // 邏輯像素大小，會依容器縮放

// 形狀定義（SRS 預設旋轉）
const TETROMINOES = {
  I: {
    color: "#4fd1c5",
    shapes: [
      [ [0,1],[1,1],[2,1],[3,1] ],
      [ [2,0],[2,1],[2,2],[2,3] ],
      [ [0,2],[1,2],[2,2],[3,2] ],
      [ [1,0],[1,1],[1,2],[1,3] ],
    ],
  },
  O: {
    color: "#f6e05e",
    shapes: [
      [ [1,0],[2,0],[1,1],[2,1] ],
      [ [1,0],[2,0],[1,1],[2,1] ],
      [ [1,0],[2,0],[1,1],[2,1] ],
      [ [1,0],[2,0],[1,1],[2,1] ],
    ],
  },
  T: {
    color: "#b794f4",
    shapes: [
      [ [1,0],[0,1],[1,1],[2,1] ],
      [ [1,0],[1,1],[2,1],[1,2] ],
      [ [0,1],[1,1],[2,1],[1,2] ],
      [ [1,0],[0,1],[1,1],[1,2] ],
    ],
  },
  S: {
    color: "#68d391",
    shapes: [
      [ [1,0],[2,0],[0,1],[1,1] ],
      [ [1,0],[1,1],[2,1],[2,2] ],
      [ [1,1],[2,1],[0,2],[1,2] ],
      [ [0,0],[0,1],[1,1],[1,2] ],
    ],
  },
  Z: {
    color: "#fc8181",
    shapes: [
      [ [0,0],[1,0],[1,1],[2,1] ],
      [ [2,0],[1,1],[2,1],[1,2] ],
      [ [0,1],[1,1],[1,2],[2,2] ],
      [ [1,0],[0,1],[1,1],[0,2] ],
    ],
  },
  J: {
    color: "#63b3ed",
    shapes: [
      [ [0,0],[0,1],[1,1],[2,1] ],
      [ [1,0],[2,0],[1,1],[1,2] ],
      [ [0,1],[1,1],[2,1],[2,2] ],
      [ [1,0],[1,1],[0,2],[1,2] ],
    ],
  },
  L: {
    color: "#f6ad55",
    shapes: [
      [ [2,0],[0,1],[1,1],[2,1] ],
      [ [1,0],[1,1],[1,2],[2,2] ],
      [ [0,1],[1,1],[2,1],[0,2] ],
      [ [0,0],[1,0],[1,1],[1,2] ],
    ],
  },
};

/**
 * 七袋隨機器
 */
class BagRandom {
  constructor(){ this.bag = []; }
  next(){
    if(this.bag.length === 0){
      this.bag = Object.keys(TETROMINOES);
      // 洗牌
      for(let i=this.bag.length-1;i>0;i--){
        const j = (Math.random()* (i+1))|0;
        [this.bag[i],this.bag[j]] = [this.bag[j],this.bag[i]];
      }
    }
    return this.bag.pop();
  }
}

function createMatrix(cols, rows, fill=null){
  const m = new Array(rows);
  for(let y=0;y<rows;y++){ m[y] = new Array(cols).fill(fill); }
  return m;
}

function cloneMatrix(m){ return m.map(r=>r.slice()); }

// 碰撞偵測
function collide(board, piece){
  for(const [px,py] of piece.cells()){
    if(py < 0) continue;
    if(px < 0 || px >= NUM_COLS || py >= NUM_ROWS) return true;
    if(board[py][px]) return true;
  }
  return false;
}

class Piece {
  constructor(type){
    this.type = type;
    this.rot = 0;
    this.x = 3; // 起始 x
    this.y = -2; // 起始 y（上方）
  }
  get def(){ return TETROMINOES[this.type]; }
  get color(){ return this.def.color; }
  shape(){ return this.def.shapes[this.rot]; }
  cells(){ return this.shape().map(([cx,cy]) => [cx + this.x, cy + this.y]); }
  rotated(dir){
    const p = new Piece(this.type);
    p.rot = (this.rot + (dir>0?1:3)) % 4;
    p.x = this.x; p.y = this.y; return p;
  }
}

class GameState {
  constructor(){
    this.board = createMatrix(NUM_COLS, NUM_ROWS, null);
    this.random = new BagRandom();
    this.current = new Piece(this.random.next());
    this.nextQueue = [this.random.next(), this.random.next(), this.random.next(), this.random.next(), this.random.next()];
    this.holdType = null;
    this.holdUsed = false;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropMs = 1000;
    this.elapsed = 0;
    this.paused = false;
    this.over = false;
  }
  takeNext(){
    const type = this.nextQueue.shift();
    this.nextQueue.push(this.random.next());
    return new Piece(type);
  }
}

// DOM 參照
const el = {
  canvasMain: document.getElementById("layer-main"),
  canvasGhost: document.getElementById("layer-ghost"),
  canvasGrid: document.getElementById("layer-grid"),
  playfield: document.getElementById("playfield"),
  score: document.getElementById("score"),
  level: document.getElementById("level"),
  lines: document.getElementById("lines"),
  time: document.getElementById("time"),
  nextList: document.getElementById("next-queue"),
  hold: document.getElementById("hold"),
  btnToggleTouch: document.getElementById("btn-toggle-touch"),
  overlayStart: document.getElementById("overlay-start"),
  overlayPause: document.getElementById("overlay-pause"),
  overlayOver: document.getElementById("overlay-gameover"),
  startPlay: document.getElementById("start-play"),
  btnStart: document.getElementById("btn-start"),
  btnPause: document.getElementById("btn-pause"),
  btnRestart: document.getElementById("btn-restart"),
  btnSettings: document.getElementById("btn-settings"),
  btnHold: document.getElementById("btn-hold"),
  btnRotateL: document.getElementById("btn-rotate-left"),
  btnRotateR: document.getElementById("btn-rotate-right"),
  btnSoft: document.getElementById("btn-soft-drop"),
  btnHard: document.getElementById("btn-hard-drop"),
  msgList: document.getElementById("messages"),
  finalScore: document.getElementById("final-score"),
  finalLevel: document.getElementById("final-level"),
  finalLines: document.getElementById("final-lines"),
  // 音效/設定
  bgm: document.getElementById("bgm"),
  sfxRotate: document.getElementById("sfx-rotate"),
  sfxLock: document.getElementById("sfx-lock"),
  sfxClear: document.getElementById("sfx-clear"),
  sfxHard: document.getElementById("sfx-hard"),
  chkAudio: document.getElementById("chk-audio"),
  volBgm: document.getElementById("vol-bgm"),
  volSfx: document.getElementById("vol-sfx"),
  optGrid: document.getElementById("opt-grid"),
};

const ctxMain = el.canvasMain.getContext("2d");
const ctxGhost = el.canvasGhost.getContext("2d");

let game = new GameState();
let lastTime = 0;
let acc = 0;

function resizeCanvas(){
  // 判斷是否為左右並排（三欄或兩欄）
  const siteMain = document.querySelector('.site-main');
  const isSingleColumn = getComputedStyle(siteMain).gridTemplateColumns.split(' ').length === 1;
  if(isSingleColumn){
    // 單欄：用寬度決定高度，保持比例
    el.playfield.style.height = '';
  } else {
    // 並排：將 playfield 高度對齊右側下一顆佇列卡片的高度
    const rightPanel = document.getElementById("right-panel");
    const nextSection = rightPanel?.querySelector('.next-queue');
    if(nextSection){
      const card = nextSection.closest('.card');
      if(card){
        const h = card.getBoundingClientRect().height;
        el.playfield.style.height = `${Math.floor(h)}px`;
      }
    }
  }
  const rect = el.playfield.getBoundingClientRect();
  const scale = Math.min(rect.width / (NUM_COLS*VIRTUAL_CELL), rect.height / (NUM_ROWS*VIRTUAL_CELL));
  const w = Math.floor(NUM_COLS*VIRTUAL_CELL*scale);
  const h = Math.floor(NUM_ROWS*VIRTUAL_CELL*scale);
  for(const c of [el.canvasMain, el.canvasGhost]){
    c.width = w; c.height = h;
    c.style.width = "100%"; c.style.height = "100%";
  }
}

function drawCell(ctx, x, y, color){
  const cw = ctx.canvas.width / NUM_COLS;
  const ch = ctx.canvas.height / NUM_ROWS;
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x*cw), Math.floor(y*ch), Math.ceil(cw), Math.ceil(ch));
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.floor(x*cw)+.5, Math.floor(y*ch)+.5, Math.floor(cw)-1, Math.floor(ch)-1);
}

function render(){
  // 清空
  ctxMain.clearRect(0,0,ctxMain.canvas.width, ctxMain.canvas.height);
  ctxGhost.clearRect(0,0,ctxGhost.canvas.width, ctxGhost.canvas.height);

  // 畫背景棋盤
  for(let y=0;y<NUM_ROWS;y++){
    for(let x=0;x<NUM_COLS;x++){
      const cell = game.board[y][x];
      if(cell){ drawCell(ctxMain, x, y, cell); }
    }
  }

  // 幽靈位置
  const ghost = new Piece(game.current.type);
  ghost.x = game.current.x; ghost.y = game.current.y; ghost.rot = game.current.rot;
  while(!collide(game.board, ghost)){ ghost.y++; }
  ghost.y--; // 最後合法
  for(const [gx,gy] of ghost.cells()){
    if(gy>=0) drawCell(ctxGhost, gx, gy, "rgba(255,255,255,0.15)");
  }

  // 畫當前方塊
  for(const [px,py] of game.current.cells()){
    if(py>=0) drawCell(ctxMain, px, py, game.current.color);
  }

  // 更新 next 與 hold 預覽
  renderMiniQueue();
  renderHold();
}

function lockPiece(){
  for(const [px,py] of game.current.cells()){
    if(py<0){ game.over = true; return; }
    game.board[py][px] = game.current.color;
  }
  playSfx(el.sfxLock);
  // 消行
  let cleared = 0;
  outer: for(let y=NUM_ROWS-1;y>=0;y--){
    for(let x=0;x<NUM_COLS;x++) if(!game.board[y][x]) continue outer;
    // 滿行
    game.board.splice(y,1);
    game.board.unshift(new Array(NUM_COLS).fill(null));
    cleared++; y++;
  }
  if(cleared>0){
    playSfx(el.sfxClear);
    const table = [0,100,300,500,800];
    game.score += table[cleared] * game.level;
    game.lines += cleared;
    if(game.lines >= game.level*10){ game.level++; game.dropMs = Math.max(120, 1000 - (game.level-1)*80); }
  }
  game.current = game.takeNext();
  game.holdUsed = false;
  // 方塊換新後同步更新高度
  resizeCanvas();
}

function tryMove(dx, dy){
  const oldX = game.current.x, oldY = game.current.y;
  game.current.x += dx; game.current.y += dy;
  if(collide(game.board, game.current)){
    game.current.x = oldX; game.current.y = oldY; return false;
  }
  return true;
}

function tryRotate(dir){
  const prev = game.current;
  const rotated = prev.rotated(dir);
  rotated.x = prev.x; rotated.y = prev.y;
  // 簡化踢牆
  const kicks = [ [0,0],[1,0],[-1,0],[2,0],[-2,0],[0,-1] ];
  for(const [kx,ky] of kicks){
    rotated.x = prev.x + kx; rotated.y = prev.y + ky;
    if(!collide(game.board, rotated)){
      game.current = rotated; return true;
    }
  }
  return false;
}

function hardDrop(){
  let dist = 0;
  while(tryMove(0,1)) dist++;
  game.score += dist*2;
  playSfx(el.sfxHard);
  lockPiece();
}

function holdPiece(){
  if(game.holdUsed) return;
  const cur = game.current.type;
  if(game.holdType == null){
    game.holdType = cur; game.current = game.takeNext();
  } else {
    const tmp = game.holdType; game.holdType = cur; game.current = new Piece(tmp);
  }
  game.current.x = 3; game.current.y = -2; game.current.rot = 0;
  if(collide(game.board, game.current)){ game.over = true; }
  game.holdUsed = true;
}

function updateHUD(){
  el.score.textContent = String(game.score);
  el.level.textContent = String(game.level);
  el.lines.textContent = String(game.lines);
  // 時間
  const total = Math.floor(game.elapsed/1000);
  const mm = String(Math.floor(total/60)).padStart(2,"0");
  const ss = String(total%60).padStart(2,"0");
  el.time.textContent = mm+":"+ss;
}

function loop(ts){
  if(game.paused || game.over){ render(); requestAnimationFrame(loop); return; }
  if(!lastTime) lastTime = ts; const dt = ts - lastTime; lastTime = ts;
  acc += dt; game.elapsed += dt;
  if(acc >= game.dropMs){
    acc = 0;
    if(!tryMove(0,1)) lockPiece();
  }
  render(); updateHUD();
  if(game.over){
    el.finalScore.textContent = String(game.score);
    el.finalLevel.textContent = String(game.level);
    el.finalLines.textContent = String(game.lines);
    showOverlay(el.overlayOver);
  }
  requestAnimationFrame(loop);
}

function resetGame(){
  game = new GameState();
  lastTime = 0; acc = 0;
  hideAllOverlays();
}

// 覆蓋視窗
function hideAllOverlays(){
  for(const o of [el.overlayStart, el.overlayPause, el.overlayOver]) o.hidden = true;
}
function showOverlay(node){ hideAllOverlays(); node.hidden = false; }

// 控制與鍵盤
function bindControls(){
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  document.addEventListener("keydown", (e)=>{
    if(e.repeat) return;
    // 阻止瀏覽器預設捲動（方向鍵/空白鍵）
    if(["ArrowLeft","ArrowRight","ArrowDown","Space"].includes(e.code)){
      e.preventDefault();
    }
    switch(e.code){
      case "ArrowLeft": tryMove(-1,0); break;
      case "ArrowRight": tryMove(1,0); break;
      case "ArrowDown": if(tryMove(0,1)) game.score += 1; break;
      case "KeyZ": tryRotate(-1); break;
      case "KeyX": tryRotate(1); break;
      case "Space": hardDrop(); break;
      case "KeyC": holdPiece(); break;
      case "KeyP": togglePause(); break;
    }
  });

  el.btnStart.addEventListener("click", ()=>{ hideAllOverlays(); if(game.over){ resetGame(); } });
  el.btnRestart.addEventListener("click", ()=>{ resetGame(); });
  el.btnPause.addEventListener("click", ()=>{ togglePause(); });
  el.startPlay.addEventListener("click", ()=>{ hideAllOverlays(); });

  // 覆蓋視窗中的按鈕
  const pauseResume = document.getElementById("pause-resume");
  const pauseExit = document.getElementById("pause-exit");
  const overRestart = document.getElementById("over-restart");
  if(pauseResume) pauseResume.addEventListener("click", ()=>{ if(game.paused){ togglePause(); } });
  if(pauseExit) pauseExit.addEventListener("click", ()=>{ resetGame(); showOverlay(el.overlayStart); });
  if(overRestart) overRestart.addEventListener("click", ()=>{ resetGame(); });

  // 通用關閉按鈕
  document.querySelectorAll('[data-close]').forEach(btn=>{
    btn.addEventListener('click', ()=> hideAllOverlays());
  });

  el.btnRotateL.addEventListener("click", ()=>{ tryRotate(-1); });
  el.btnRotateR.addEventListener("click", ()=>{ tryRotate(1); });
  el.btnSoft.addEventListener("click", ()=>{ if(tryMove(0,1)) game.score += 1; });
  el.btnHard.addEventListener("click", ()=>{ hardDrop(); });
  el.btnHold.addEventListener("click", ()=>{ holdPiece(); });

  // 觸控面板顯示切換
  if(el.btnToggleTouch){
    el.btnToggleTouch.addEventListener("click", ()=>{
      const tc = document.getElementById("touch-controls");
      const hidden = tc.hasAttribute("hidden");
      if(hidden) tc.removeAttribute("hidden"); else tc.setAttribute("hidden", "");
    });
  }
}

function togglePause(){
  if(game.over) return;
  game.paused = !game.paused;
  el.btnPause.setAttribute("aria-pressed", game.paused?"true":"false");
  if(game.paused) showOverlay(el.overlayPause); else hideAllOverlays();
}

// 初始化
bindControls();
showOverlay(el.overlayStart);
requestAnimationFrame(loop);

// 音量與設定
function initAudio(){
  const saved = JSON.parse(localStorage.getItem("tetris.settings")||"{}");
  const audioEnabled = saved.audioEnabled ?? true;
  const bgmVol = saved.bgmVol ?? 0.4;
  const sfxVol = saved.sfxVol ?? 0.7;
  const showGrid = saved.showGrid ?? false;
  if(el.chkAudio) el.chkAudio.checked = audioEnabled;
  if(el.volBgm) el.volBgm.value = String(bgmVol);
  if(el.volSfx) el.volSfx.value = String(sfxVol);
  if(el.optGrid) el.optGrid.checked = showGrid;
  applyAudioSettings();
  applyGridSetting();

  el.chkAudio?.addEventListener("change", ()=>{ saveSettings(); applyAudioSettings(); });
  el.volBgm?.addEventListener("input", ()=>{ saveSettings(); applyAudioSettings(); });
  el.volSfx?.addEventListener("input", ()=>{ saveSettings(); applyAudioSettings(); });
  el.optGrid?.addEventListener("change", ()=>{ saveSettings(); applyGridSetting(); });
}

function saveSettings(){
  const data = {
    audioEnabled: el.chkAudio?.checked ?? true,
    bgmVol: parseFloat(el.volBgm?.value ?? "0.4"),
    sfxVol: parseFloat(el.volSfx?.value ?? "0.7"),
    showGrid: el.optGrid?.checked ?? false,
  };
  localStorage.setItem("tetris.settings", JSON.stringify(data));
}

function applyAudioSettings(){
  const enabled = el.chkAudio?.checked ?? true;
  const bgmVol = parseFloat(el.volBgm?.value ?? "0.4");
  const sfxVol = parseFloat(el.volSfx?.value ?? "0.7");
  if(el.bgm){ el.bgm.volume = enabled ? bgmVol : 0; if(enabled && el.bgm.paused){ el.bgm.play().catch(()=>{}); } }
  for(const s of [el.sfxRotate, el.sfxLock, el.sfxClear, el.sfxHard]){ if(s){ s.volume = enabled ? sfxVol : 0; } }
}

function applyGridSetting(){
  const show = el.optGrid?.checked ?? false;
  const grid = document.getElementById("layer-grid");
  if(!grid) return;
  if(show) grid.removeAttribute("hidden"); else grid.setAttribute("hidden", "");
}

function playSfx(audio){ try{ if(audio && (el.chkAudio?.checked ?? true)) { audio.currentTime = 0; audio.play(); } }catch(_){} }

// 旋轉時播放音效
const _origTryRotate = tryRotate;
tryRotate = function(dir){ const ok = _origTryRotate(dir); if(ok) playSfx(el.sfxRotate); return ok; };

initAudio();

// 視窗縮放：將 2560x1440 舞台縮放置中
(function mountViewportScale(){
  const page = document.getElementById('page');
  const viewport = document.getElementById('viewport');
  if(!page || !viewport) return;
  function applyScale(){
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const scale = Math.min(vw/2560, vh/1440);
    page.style.transform = `scale(${scale}) translateZ(0)`;
  }
  window.addEventListener('resize', applyScale);
  applyScale();
})();

// 小型預覽繪製（DOM 方塊）
function renderMiniGrid(container, type){
  container.textContent = "";
  container.style.display = "grid";
  container.style.gridTemplateColumns = "repeat(4,1fr)";
  container.style.gridAutoRows = "1fr";
  container.style.gap = "2px";
  const grid = Array.from({length:16},()=>null);
  if(type){
    const p = new Piece(type); p.x = 0; p.y = 0; p.rot = 0;
    for(const [cx,cy] of p.shape()){
      const gx = cx; const gy = cy;
      const idx = gy*4 + gx;
      if(idx>=0 && idx<16) grid[idx] = TETROMINOES[type].color;
    }
  }
  for(let i=0;i<16;i++){
    const d = document.createElement("div");
    d.style.aspectRatio = "1/1";
    d.style.borderRadius = "4px";
    d.style.background = grid[i] || "#0b121a";
    d.style.border = "1px solid #182434";
    container.appendChild(d);
  }
}

function renderMiniQueue(){
  el.nextList.textContent = "";
  el.nextList.style.display = "grid";
  el.nextList.style.gridTemplateColumns = "repeat(1,1fr)";
  el.nextList.style.gap = "8px";
  for(const t of game.nextQueue.slice(0,5)){
    const box = document.createElement("div");
    box.style.display = "grid";
    box.style.gridTemplateColumns = "repeat(4,1fr)";
    box.style.gap = "2px";
    renderMiniGrid(box, t);
    el.nextList.appendChild(box);
  }
}

function renderHold(){
  el.hold.textContent = "";
  renderMiniGrid(el.hold, game.holdType);
}


