const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mapSelect = document.getElementById('mapSelect');
const modeSelect = document.getElementById('modeSelect');
const weatherSelect = document.getElementById('weatherSelect');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const speedEl = document.getElementById('speed');
const heatEl = document.getElementById('heat');
const livesEl = document.getElementById('lives');
const objectiveEl = document.getElementById('objective');
const eventEl = document.getElementById('eventLog');

const { MAP_LIBRARY, GAME_MODES, pickSpawnPoint } = window.GAME_DATA || {
  MAP_LIBRARY: [],
  GAME_MODES: [],
  pickSpawnPoint: () => ({ x: 0, y: 0, heading: 0 }),
};

const WEATHER_MODES = [
  { id: 'clear', label: 'Clear', drag: 1, visibility: 1, particles: 0 },
  { id: 'rain', label: 'Rain', drag: 0.986, visibility: 0.87, particles: 120 },
  { id: 'fog', label: 'Fog', drag: 0.992, visibility: 0.72, particles: 70 },
  { id: 'storm', label: 'Storm', drag: 0.978, visibility: 0.62, particles: 170 },
];

const keys = { up: false, down: false, left: false, right: false, brake: false, boost: false };

const player = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, angularVelocity: 0, boost: 100, shield: 0 };
const game = {
  map: null,
  mode: null,
  weather: WEATHER_MODES[0],
  chasers: [],
  obstacles: [],
  pickups: [],
  particles: [],
  score: 0,
  combo: 1,
  heat: 0,
  lives: 3,
  paused: false,
  timer: 0,
  nextObjectiveAt: 25,
  objective: null,
  messageTimer: 0,
  message: 'Survive and chain near misses!',
  shake: 0,
};

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function setEventMessage(text, t = 2.5) {
  game.message = text;
  game.messageTimer = t;
  eventEl.textContent = text;
}

function populateSelectors() {
  MAP_LIBRARY.forEach((map, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${map.name} · ${map.theme}`;
    mapSelect.append(option);
  });

  GAME_MODES.forEach((mode, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = mode.name;
    modeSelect.append(option);
  });

  WEATHER_MODES.forEach((w) => {
    const option = document.createElement('option');
    option.value = w.id;
    option.textContent = w.label;
    weatherSelect.append(option);
  });

  mapSelect.addEventListener('change', reset);
  modeSelect.addEventListener('change', reset);
  weatherSelect.addEventListener('change', () => {
    game.weather = WEATHER_MODES.find((w) => w.id === weatherSelect.value) || WEATHER_MODES[0];
    repopulateParticles();
  });

  mapSelect.value = '0';
  modeSelect.value = '0';
  weatherSelect.value = 'clear';
}

function createObstacles(map) {
  const arr = [];
  for (let i = 0; i < 90; i += 1) {
    arr.push({
      x: randomInRange(-map.halfW + 100, map.halfW - 100),
      y: randomInRange(-map.halfH + 100, map.halfH - 100),
      r: randomInRange(14, 34),
      hue: 170 + ((i * 17) % 130),
    });
  }
  return arr;
}

function createPickups(map) {
  const pickups = [];
  for (let i = 0; i < 50; i += 1) {
    pickups.push({
      x: randomInRange(-map.halfW + 120, map.halfW - 120),
      y: randomInRange(-map.halfH + 120, map.halfH - 120),
      type: i % 3 === 0 ? 'boost' : i % 3 === 1 ? 'score' : 'shield',
      active: true,
      pulse: randomInRange(0, Math.PI * 2),
    });
  }
  return pickups;
}

function repopulateParticles() {
  game.particles = [];
  for (let i = 0; i < game.weather.particles; i += 1) {
    game.particles.push({
      x: randomInRange(0, canvas.width),
      y: randomInRange(0, canvas.height),
      vx: randomInRange(-20, 20),
      vy: randomInRange(70, 240),
      size: randomInRange(1, 3),
    });
  }
}

function reset() {
  const map = MAP_LIBRARY[Number(mapSelect.value)] || MAP_LIBRARY[0];
  const mode = GAME_MODES[Number(modeSelect.value)] || GAME_MODES[0];
  game.map = map;
  game.mode = mode;
  game.timer = 0;
  game.score = 0;
  game.combo = 1;
  game.heat = 0;
  game.lives = 3;
  game.nextObjectiveAt = 25;
  game.objective = { type: 'survive', remaining: 25 };
  game.chasers = [];
  game.obstacles = createObstacles(map);
  game.pickups = createPickups(map);
  player.boost = 100;
  player.shield = 0;

  const spawn = pickSpawnPoint(map);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.heading = spawn.heading;
  player.angularVelocity = 0;

  for (let i = 0; i < mode.chaserCount + 2; i += 1) {
    game.chasers.push({
      x: spawn.x + Math.cos(i) * (180 + i * 20),
      y: spawn.y + Math.sin(i) * (180 + i * 20),
      vx: 0,
      vy: 0,
      heading: 0,
      kind: i % 4 === 0 ? 'heavy' : 'standard',
    });
  }

  game.weather = WEATHER_MODES.find((w) => w.id === weatherSelect.value) || WEATHER_MODES[0];
  repopulateParticles();
  setEventMessage('Run started. Build combo with close calls.');
}

function respawnPlayer() {
  const spawn = pickSpawnPoint(game.map);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.heading = spawn.heading;
  player.angularVelocity = 0;
  player.shield = 2;
  game.shake = 12;
}

function clampToMap(entity) {
  const m = game.map;
  const border = 40;
  entity.x = Math.max(-m.halfW + border, Math.min(m.halfW - border, entity.x));
  entity.y = Math.max(-m.halfH + border, Math.min(m.halfH - border, entity.y));
}

function updateObjective(dt) {
  if (!game.objective) return;

  if (game.objective.type === 'survive') {
    game.objective.remaining -= dt;
    if (game.objective.remaining <= 0) {
      game.score += 1200;
      setEventMessage('Objective complete! +1200');
      const choice = Math.random();
      if (choice < 0.5) {
        game.objective = { type: 'pickup', remaining: 5 };
      } else {
        game.objective = { type: 'heat', remaining: 45 };
      }
    }
  } else if (game.objective.type === 'pickup') {
    if (game.objective.remaining <= 0) {
      game.score += 1500;
      setEventMessage('Pickup objective complete! +1500');
      game.objective = { type: 'survive', remaining: 30 };
    }
  } else if (game.objective.type === 'heat') {
    if (game.heat >= game.objective.remaining) {
      game.score += 2000;
      setEventMessage('Heat challenge complete! +2000');
      game.objective = { type: 'survive', remaining: 35 };
    }
  }
}

function collisionChecks(speed, dt) {
  for (const obstacle of game.obstacles) {
    const dx = player.x - obstacle.x;
    const dy = player.y - obstacle.y;
    const d = Math.hypot(dx, dy);
    if (d < obstacle.r + 16) {
      const bump = Math.atan2(dy, dx);
      player.vx += Math.cos(bump) * 80;
      player.vy += Math.sin(bump) * 80;
      game.shake = 8;
      game.combo = Math.max(1, game.combo - 2);
      game.score = Math.max(0, game.score - 150);
      setEventMessage('Hit obstacle! Combo reduced.');
    }
  }

  for (const pickup of game.pickups) {
    if (!pickup.active) continue;
    pickup.pulse += dt * 2;
    const dx = player.x - pickup.x;
    const dy = player.y - pickup.y;
    if (Math.hypot(dx, dy) < 32) {
      pickup.active = false;
      if (pickup.type === 'boost') {
        player.boost = Math.min(100, player.boost + 38);
        game.score += 250;
        setEventMessage('Boost canister +38');
      } else if (pickup.type === 'score') {
        game.score += 650;
        game.combo += 1;
        setEventMessage('Data cache +650');
      } else {
        player.shield = Math.min(6, player.shield + 2.5);
        setEventMessage('Shield battery +2.5s');
      }
      if (game.objective?.type === 'pickup') {
        game.objective.remaining -= 1;
      }
    }
  }

  for (const chaser of game.chasers) {
    const dx = player.x - chaser.x;
    const dy = player.y - chaser.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    if (dist < 46) {
      if (player.shield > 0) {
        player.shield = Math.max(0, player.shield - 1.5);
        chaser.vx *= -0.5;
        chaser.vy *= -0.5;
        game.score += 100;
        setEventMessage('Shield impact blocked');
      } else {
        game.lives -= 1;
        setEventMessage(`Busted! Lives left: ${game.lives}`);
        if (game.lives <= 0) {
          reset();
          setEventMessage('Run ended. Restarted.');
          return;
        }
        respawnPlayer();
      }
    }
  }

  if (speed > 220 && game.combo < 14) {
    game.combo += dt * 0.45;
  }
}

function update(dt) {
  if (!game.map || game.paused) return;

  game.timer += dt;
  if (game.messageTimer > 0) {
    game.messageTimer -= dt;
    if (game.messageTimer <= 0) {
      eventEl.textContent = 'Stay alive. Pressure is rising.';
    }
  }

  const mode = game.mode;
  const weatherGrip = game.weather.drag;

  const accel = keys.up ? mode.acceleration : 0;
  const reverse = keys.down ? mode.reverseAcceleration : 0;
  const turnInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  player.angularVelocity += turnInput * mode.turnSpeed * dt * (keys.brake ? 1.3 : 1);
  player.angularVelocity *= keys.brake ? 0.82 : 0.92;
  player.heading += player.angularVelocity * dt;

  const headingX = Math.cos(player.heading);
  const headingY = Math.sin(player.heading);

  let boostForce = 0;
  if (keys.boost && player.boost > 0) {
    boostForce = 240;
    player.boost = Math.max(0, player.boost - 22 * dt);
  } else {
    player.boost = Math.min(100, player.boost + 8 * dt);
  }

  player.vx += headingX * (accel + boostForce) * dt;
  player.vy += headingY * (accel + boostForce) * dt;
  player.vx -= headingX * reverse * dt;
  player.vy -= headingY * reverse * dt;

  const friction = (keys.brake ? mode.brakeFriction : mode.friction) * weatherGrip;
  player.vx *= Math.pow(friction, dt * 60);
  player.vy *= Math.pow(friction, dt * 60);

  const speed = Math.hypot(player.vx, player.vy);
  const top = mode.maxSpeed + 70;
  if (speed > top) {
    const ratio = top / speed;
    player.vx *= ratio;
    player.vy *= ratio;
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  clampToMap(player);

  let pressure = 0;
  for (const chaser of game.chasers) {
    const dx = player.x - chaser.x;
    const dy = player.y - chaser.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const chaseBias = chaser.kind === 'heavy' ? 0.85 : 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const p = 1 + Math.min(3.3, 420 / dist) + game.heat * 0.02;
    chaser.vx += nx * mode.chaserAccel * p * dt * chaseBias;
    chaser.vy += ny * mode.chaserAccel * p * dt * chaseBias;
    chaser.vx *= mode.chaserFriction * weatherGrip;
    chaser.vy *= mode.chaserFriction * weatherGrip;

    const cs = Math.hypot(chaser.vx, chaser.vy);
    const cTop = mode.chaserMaxSpeed + game.heat * 2 + (chaser.kind === 'heavy' ? -20 : 15);
    if (cs > cTop) {
      const ratio = cTop / cs;
      chaser.vx *= ratio;
      chaser.vy *= ratio;
    }

    chaser.x += chaser.vx * dt;
    chaser.y += chaser.vy * dt;
    chaser.heading = Math.atan2(chaser.vy, chaser.vx);
    clampToMap(chaser);

    pressure += Math.max(0, (280 - dist) * 0.005);
  }

  game.heat = Math.min(100, Math.max(0, game.heat + pressure * dt * 7 - dt * 0.8));
  game.combo = Math.max(1, Math.min(16, game.combo + pressure * dt * 0.7));
  game.score += dt * (22 + speed * 0.02) * game.combo * (1 + game.heat * 0.01);

  if (player.shield > 0) player.shield = Math.max(0, player.shield - dt);
  collisionChecks(speed, dt);
  updateObjective(dt);

  scoreEl.textContent = `Score: ${Math.floor(game.score)}`;
  comboEl.textContent = `Combo: ${Math.floor(game.combo)}x`;
  speedEl.textContent = `Speed: ${Math.floor(speed)}`;
  heatEl.textContent = `Heat: ${Math.floor(game.heat)}%`;
  livesEl.textContent = `Lives: ${game.lives}`;

  if (game.objective?.type === 'survive') objectiveEl.textContent = `Objective: Survive ${Math.ceil(game.objective.remaining)}s`;
  if (game.objective?.type === 'pickup') objectiveEl.textContent = `Objective: Collect ${Math.ceil(game.objective.remaining)} pickups`;
  if (game.objective?.type === 'heat') objectiveEl.textContent = `Objective: Reach Heat ${Math.ceil(game.objective.remaining)}%`;
}

function worldToScreen(x, y) {
  const shakeX = (Math.random() - 0.5) * game.shake;
  const shakeY = (Math.random() - 0.5) * game.shake;
  return {
    x: (x - player.x) * 0.82 + canvas.width / 2 + shakeX,
    y: (y - player.y) * 0.82 + canvas.height / 2 + shakeY,
  };
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawGrid() {
  const map = game.map;
  const spacing = map.grid;
  ctx.strokeStyle = map.gridColor;
  ctx.lineWidth = 1;

  for (let x = -map.halfW; x <= map.halfW; x += spacing) {
    const a = worldToScreen(x, -map.halfH);
    const b = worldToScreen(x, map.halfH);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let y = -map.halfH; y <= map.halfH; y += spacing) {
    const a = worldToScreen(-map.halfW, y);
    const b = worldToScreen(map.halfW, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawDecor() {
  for (const tile of game.map.decor) {
    const p = worldToScreen(tile.x, tile.y);
    ctx.fillStyle = tile.color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(p.x - tile.w / 2, p.y - tile.h / 2, tile.w, tile.h);
  }
  ctx.globalAlpha = 1;

  for (const obstacle of game.obstacles) {
    const p = worldToScreen(obstacle.x, obstacle.y);
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, obstacle.r + 8);
    grad.addColorStop(0, `hsla(${obstacle.hue}, 95%, 65%, 0.95)`);
    grad.addColorStop(1, `hsla(${obstacle.hue}, 95%, 35%, 0.2)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, obstacle.r + Math.sin(game.timer * 2) * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pickup of game.pickups) {
    if (!pickup.active) continue;
    const p = worldToScreen(pickup.x, pickup.y);
    const size = 12 + Math.sin(pickup.pulse) * 3;
    const color = pickup.type === 'boost' ? '#8fff7a' : pickup.type === 'score' ? '#ffd964' : '#7fd7ff';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - size);
    ctx.lineTo(p.x + size, p.y);
    ctx.lineTo(p.x, p.y + size);
    ctx.lineTo(p.x - size, p.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawVehicle(entity, colors, size) {
  const p = worldToScreen(entity.x, entity.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(entity.heading);
  ctx.fillStyle = colors.glow;
  drawRoundedRect(-size * 0.78, -size * 0.5, size * 1.56, size, 8);
  ctx.fill();
  ctx.fillStyle = colors.body;
  drawRoundedRect(-size * 0.62, -size * 0.34, size * 1.24, size * 0.68, 7);
  ctx.fill();
  ctx.fillStyle = '#dff4ff';
  drawRoundedRect(size * 0.14, -size * 0.17, size * 0.4, size * 0.34, 4);
  ctx.fill();
  ctx.restore();
}

function drawWeather() {
  if (!game.particles.length) return;
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = game.weather.id === 'fog' ? '#dce7ff' : '#b7dbff';

  for (const p of game.particles) {
    p.x += p.vx * 0.016;
    p.y += p.vy * 0.016;
    if (p.y > canvas.height + 10) {
      p.y = -20;
      p.x = randomInRange(0, canvas.width);
    }
    if (p.x > canvas.width + 10) p.x = -10;
    if (p.x < -10) p.x = canvas.width + 10;
    ctx.fillRect(p.x, p.y, p.size, p.size * 4);
  }
  ctx.restore();
}

function drawMinimap() {
  const miniW = 180;
  const miniH = 130;
  const x = canvas.width - miniW - 16;
  const y = 16;
  const map = game.map;

  ctx.fillStyle = 'rgba(8, 14, 25, 0.7)';
  drawRoundedRect(x, y, miniW, miniH, 12);
  ctx.fill();

  const sx = miniW / (map.halfW * 2);
  const sy = miniH / (map.halfH * 2);

  for (const ch of game.chasers) {
    const px = x + (ch.x + map.halfW) * sx;
    const py = y + (ch.y + map.halfH) * sy;
    ctx.fillStyle = '#ff5166';
    ctx.fillRect(px - 2, py - 2, 4, 4);
  }

  for (const pickup of game.pickups) {
    if (!pickup.active) continue;
    const px = x + (pickup.x + map.halfW) * sx;
    const py = y + (pickup.y + map.halfH) * sy;
    ctx.fillStyle = pickup.type === 'boost' ? '#7cff70' : pickup.type === 'score' ? '#ffe565' : '#8fd8ff';
    ctx.fillRect(px - 1, py - 1, 3, 3);
  }

  const px = x + (player.x + map.halfW) * sx;
  const py = y + (player.y + map.halfH) * sy;
  ctx.fillStyle = '#57e7ff';
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  if (!game.map) return;

  const visibility = game.weather.visibility;
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, game.map.skyTop);
  g.addColorStop(1, game.map.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = visibility;
  drawGrid();
  drawDecor();

  for (const chaser of game.chasers) {
    drawVehicle(
      chaser,
      chaser.kind === 'heavy'
        ? { body: '#ff8542', glow: '#8a3209' }
        : { body: '#ff4f70', glow: '#8e1131' },
      chaser.kind === 'heavy' ? 26 : 22,
    );
  }

  drawVehicle(player, { body: '#57e7ff', glow: '#1f45b9' }, 28);
  if (player.shield > 0) {
    const p = worldToScreen(player.x, player.y);
    ctx.strokeStyle = 'rgba(109, 237, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 40 + Math.sin(game.timer * 10) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  drawWeather();
  drawMinimap();

  const barX = 16;
  const barY = canvas.height - 24;
  const barW = 240;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  drawRoundedRect(barX, barY, barW, 10, 8);
  ctx.fill();
  ctx.fillStyle = '#74ff8d';
  drawRoundedRect(barX, barY, (barW * player.boost) / 100, 10, 8);
  ctx.fill();

  if (game.paused) {
    ctx.fillStyle = 'rgba(6,10,16,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ecf3ff';
    ctx.font = '700 48px Inter, sans-serif';
    ctx.fillText('PAUSED', canvas.width / 2 - 94, canvas.height / 2);
  }

  if (game.shake > 0) game.shake = Math.max(0, game.shake - 0.4);
}

function onKey(flag) {
  return (event) => {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') keys.up = flag;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') keys.down = flag;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = flag;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = flag;
    if (event.code === 'Space') keys.brake = flag;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.boost = flag;

    if (flag) {
      if (event.code === 'KeyR') reset();
      if (event.code === 'KeyP') {
        game.paused = !game.paused;
        setEventMessage(game.paused ? 'Paused' : 'Resumed', 1.2);
      }
      if (event.code === 'KeyM') {
        const next = (Number(mapSelect.value) + 1) % MAP_LIBRARY.length;
        mapSelect.value = String(next);
        reset();
      }
    }
  };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', onKey(true));
window.addEventListener('keyup', onKey(false));

if (!MAP_LIBRARY.length || !GAME_MODES.length) {
  eventEl.textContent = 'Failed to load maps data. Open through index.html with all assets in place.';
}

resize();
populateSelectors();
reset();
requestAnimationFrame(frame);
