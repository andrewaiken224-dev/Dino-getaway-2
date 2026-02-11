import { MAP_LIBRARY, GAME_MODES, pickSpawnPoint } from './maps.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mapSelect = document.getElementById('mapSelect');
const modeSelect = document.getElementById('modeSelect');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const speedEl = document.getElementById('speed');

const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
  brake: false,
};

let game = null;

const car = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  angularVelocity: 0,
};

let chasers = [];
let score = 0;
let combo = 1;
let timeAlive = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function bindSelectors() {
  MAP_LIBRARY.forEach((map, i) => {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `${map.name} (${map.theme})`;
    mapSelect.append(option);
  });

  GAME_MODES.forEach((mode, i) => {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `${mode.name}`;
    modeSelect.append(option);
  });

  mapSelect.value = '0';
  modeSelect.value = '0';

  mapSelect.addEventListener('change', reset);
  modeSelect.addEventListener('change', reset);
}

function reset() {
  const selectedMap = MAP_LIBRARY[Number(mapSelect.value)];
  const selectedMode = GAME_MODES[Number(modeSelect.value)];
  game = {
    map: selectedMap,
    mode: selectedMode,
  };

  const spawn = pickSpawnPoint(selectedMap);
  car.x = spawn.x;
  car.y = spawn.y;
  car.vx = 0;
  car.vy = 0;
  car.heading = spawn.heading;
  car.angularVelocity = 0;

  chasers = Array.from({ length: selectedMode.chaserCount }, (_, idx) => ({
    x: spawn.x + Math.cos(idx * 0.7) * (120 + idx * 24),
    y: spawn.y + Math.sin(idx * 0.7) * (120 + idx * 24),
    vx: 0,
    vy: 0,
    heading: 0,
  }));

  score = 0;
  combo = 1;
  timeAlive = 0;
}

function update(dt) {
  if (!game) {
    return;
  }

  timeAlive += dt;
  const mode = game.mode;

  const accel = keys.up ? mode.acceleration : 0;
  const reverse = keys.down ? mode.reverseAcceleration : 0;
  const turnInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  car.angularVelocity += turnInput * mode.turnSpeed * dt;
  car.angularVelocity *= keys.brake ? 0.78 : 0.92;
  car.heading += car.angularVelocity * dt;

  const headingX = Math.cos(car.heading);
  const headingY = Math.sin(car.heading);

  car.vx += headingX * accel * dt;
  car.vy += headingY * accel * dt;
  car.vx -= headingX * reverse * dt;
  car.vy -= headingY * reverse * dt;

  const friction = keys.brake ? mode.brakeFriction : mode.friction;
  car.vx *= Math.pow(friction, dt * 60);
  car.vy *= Math.pow(friction, dt * 60);

  const speed = Math.hypot(car.vx, car.vy);
  const maxSpeed = mode.maxSpeed;
  if (speed > maxSpeed) {
    const ratio = maxSpeed / speed;
    car.vx *= ratio;
    car.vy *= ratio;
  }

  car.x += car.vx * dt;
  car.y += car.vy * dt;

  keepInBounds(car, game.map);

  let dangerScore = 0;
  for (const chaser of chasers) {
    const dx = car.x - chaser.x;
    const dy = car.y - chaser.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;

    const pressure = 1 + Math.min(2.5, 300 / distance);
    chaser.vx += nx * mode.chaserAccel * pressure * dt;
    chaser.vy += ny * mode.chaserAccel * pressure * dt;
    chaser.vx *= mode.chaserFriction;
    chaser.vy *= mode.chaserFriction;

    const chaserSpeed = Math.hypot(chaser.vx, chaser.vy);
    if (chaserSpeed > mode.chaserMaxSpeed) {
      const ratio = mode.chaserMaxSpeed / chaserSpeed;
      chaser.vx *= ratio;
      chaser.vy *= ratio;
    }

    chaser.x += chaser.vx * dt;
    chaser.y += chaser.vy * dt;
    chaser.heading = Math.atan2(chaser.vy, chaser.vx);
    keepInBounds(chaser, game.map);

    if (distance < 44) {
      reset();
      return;
    }

    dangerScore += Math.max(0, (220 - distance) * 0.004);
  }

  combo = 1 + Math.floor(Math.min(12, speed / 60 + dangerScore * 3));
  score += dt * 25 * combo;

  scoreEl.textContent = `Score: ${Math.floor(score)}`;
  comboEl.textContent = `Combo: ${combo}x`;
  speedEl.textContent = `Speed: ${Math.floor(speed)}`;
}

function keepInBounds(entity, map) {
  const margin = 40;
  entity.x = Math.max(-map.halfW + margin, Math.min(map.halfW - margin, entity.x));
  entity.y = Math.max(-map.halfH + margin, Math.min(map.halfH - margin, entity.y));
}

function drawGrid(map) {
  const spacing = map.grid;
  const halfW = map.halfW;
  const halfH = map.halfH;

  const left = -halfW;
  const right = halfW;
  const top = -halfH;
  const bottom = halfH;

  ctx.save();
  ctx.strokeStyle = map.gridColor;
  ctx.lineWidth = 1;

  for (let x = left; x <= right; x += spacing) {
    drawLineWorld(x, top, x, bottom);
  }

  for (let y = top; y <= bottom; y += spacing) {
    drawLineWorld(left, y, right, y);
  }

  ctx.restore();
}

function worldToScreen(x, y) {
  const px = (x - car.x) * 0.85 + canvas.width * 0.5;
  const py = (y - car.y) * 0.85 + canvas.height * 0.5;
  return { x: px, y: py };
}

function drawLineWorld(x1, y1, x2, y2) {
  const a = worldToScreen(x1, y1);
  const b = worldToScreen(x2, y2);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawRectWorld(x, y, w, h, fillStyle) {
  const p = worldToScreen(x, y);
  ctx.fillStyle = fillStyle;
  ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
}

function drawCarEntity(entity, bodyColor, haloColor, size) {
  const p = worldToScreen(entity.x, entity.y);
  const angle = entity.heading;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);

  ctx.fillStyle = haloColor;
  ctx.fillRect(-size * 0.8, -size * 0.6, size * 1.6, size * 1.2);

  ctx.fillStyle = bodyColor;
  ctx.fillRect(-size * 0.6, -size * 0.35, size * 1.2, size * 0.7);

  ctx.fillStyle = '#e8f1ff';
  ctx.fillRect(size * 0.25, -size * 0.18, size * 0.2, size * 0.36);

  ctx.restore();
}

function drawMapDecor(map) {
  for (const object of map.decor) {
    drawRectWorld(object.x, object.y, object.w, object.h, object.color);
  }
}

function render() {
  if (!game) {
    return;
  }

  const map = game.map;
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, map.skyTop);
  g.addColorStop(1, map.skyBottom);

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid(map);
  drawMapDecor(map);

  for (const chaser of chasers) {
    drawCarEntity(chaser, '#ff476d', '#9f102f', 24);
  }
  drawCarEntity(car, '#58e0ff', '#1356b2', 28);

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(canvas.width * 0.4, canvas.height * 0.44, canvas.width * 0.2, 4);
}

function installInput() {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') keys.up = true;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') keys.down = true;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = true;
    if (event.code === 'Space') keys.brake = true;
    if (event.code === 'KeyR') reset();
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') keys.up = false;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') keys.down = false;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false;
    if (event.code === 'Space') keys.brake = false;
  });
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  update(dt);
  render();

  requestAnimationFrame(frame);
}

resize();
window.addEventListener('resize', resize);
installInput();
bindSelectors();
reset();
requestAnimationFrame(frame);
