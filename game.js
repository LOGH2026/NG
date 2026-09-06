(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    score: document.getElementById("score"),
    harvests: document.getElementById("harvests"),
    accuracy: document.getElementById("accuracy"),
    startPanel: document.getElementById("startPanel"),
    panelTitle: document.getElementById("panelTitle"),
    panelText: document.getElementById("panelText"),
    startBtn: document.getElementById("startBtn"),
    message: document.getElementById("message"),
  };

  const W = canvas.width;
  const H = canvas.height;

  const state = {
    running: false,
    paused: false,
    roundOver: false,
    score: 0,
    harvests: 0,
    shots: 0,
    hits: 0,
    last: 0,
    lastShotAt: 0,
    fireDelay: 650,
    recoil: 0,
    muzzleFlashUntil: 0,
    mouse: { x: W * 0.58, y: H * 0.45 },
    animals: [],
    particles: [],
    fireflies: [],
    nextSpawnAt: 0,
    messageTimer: 0,
    windOffset: Math.random() * 1000
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  for (let i = 0; i < 20; i++) {
    state.fireflies.push({
      x: rand(0, W),
      y: rand(H * 0.2, H * 0.9),
      r: rand(0.8, 2.2),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.2, 0.7),
      drift: rand(3, 12)
    });
  }

  function setMenuOpen(open) {
    document.body.classList.toggle("menu-open", open);
    document.body.classList.toggle("playing", !open);
  }

  function pointer(e) {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = (e.clientX - rect.left) * W / rect.width;
    state.mouse.y = (e.clientY - rect.top) * H / rect.height;
  }

  function showMessage(text, ms = 1000) {
    ui.message.textContent = text;
    ui.message.classList.add("show");
    clearTimeout(state.messageTimer);
    state.messageTimer = setTimeout(() => ui.message.classList.remove("show"), ms);
  }

  function updateUI() {
    ui.score.textContent = Math.round(state.score);
    ui.harvests.textContent = `${state.harvests} / 5`;
    ui.accuracy.textContent = state.shots ? `${Math.round(state.hits / state.shots * 100)}%` : "0%";
  }

  function createDeer() {
    const fromLeft = Math.random() < 0.5;
    const depth = rand(0.64, 1.03);
    const y = rand(438, 590);
    return {
      x: fromLeft ? -210 : W + 210,
      y,
      dir: fromLeft ? 1 : -1,
      depth,
      speed: rand(22, 36) * (1.1 - (depth - 0.64) * 0.18),
      gait: rand(0, Math.PI * 2),
      alive: true,
      state: "walk",
      alert: 0,
      trophy: Math.random() < 0.35,
      deadAt: 0,
      tilt: 0,
      phase: rand(0, Math.PI * 2)
    };
  }

  function spawn(force = false) {
    if (!force && state.animals.filter(a => a.alive).length >= 5) return;
    state.animals.push(createDeer());
  }

  function hitTest(d, x, y) {
    if (!d.alive) return null;
    const s = d.depth;
    const bob = Math.sin(d.gait * 2) * 1.9;
    const yy = d.y + bob;

    const bodyX = d.x;
    const bodyY = yy - 42 * s;
    const headX = d.x + d.dir * 92 * s;
    const headY = yy - 97 * s;

    const body = ((x - bodyX) / (70 * s)) ** 2 + ((y - bodyY) / (34 * s)) ** 2;
    if (body <= 1) {
      const vitalX = d.x + d.dir * 29 * s;
      const vitalY = yy - 37 * s;
      const vital = ((x - vitalX) / (23 * s)) ** 2 + ((y - vitalY) / (20 * s)) ** 2;
      return vital <= 1 ? "vital" : "body";
    }

    if (Math.hypot(x - headX, y - headY) <= 19 * s) return "head";
    return null;
  }

  function impact(x, y, blood) {
    const count = blood ? 14 : 7;
    for (let i = 0; i < count; i++) {
      state.particles.push({
        type: blood ? "blood" : "dust",
        x, y,
        vx: rand(-55, 55),
        vy: rand(-65, 15),
        life: rand(0.28, 0.7),
        maxLife: rand(0.28, 0.7),
        size: blood ? rand(2, 4) : rand(1, 3)
      });
    }
  }

  function endRound() {
    state.roundOver = true;
    state.running = false;
    setMenuOpen(true);
    ui.panelTitle.textContent = "Round Complete";
    ui.panelText.textContent = `You harvested 5 deer. Score: ${Math.round(state.score)} • Accuracy: ${state.shots ? Math.round(state.hits / state.shots * 100) : 0}%`;
    ui.startBtn.textContent = "Hunt Again";
    ui.startPanel.classList.remove("hidden");
  }

  function fire() {
    if (!state.running || state.paused || state.roundOver) return;

    const now = performance.now();
    if (now - state.lastShotAt < state.fireDelay) return;
    state.lastShotAt = now;

    state.shots++;
    state.recoil = 18;
    state.muzzleFlashUntil = now + 65;

    const spread = 2.35;
    const sx = state.mouse.x + rand(-spread, spread);
    const sy = state.mouse.y + rand(-spread, spread);

    let target = null;
    for (const d of [...state.animals].sort((a, b) => b.depth - a.depth)) {
      const zone = hitTest(d, sx, sy);
      if (zone) { target = { d, zone }; break; }
    }

    state.animals.forEach(d => {
      if (d.alive && Math.abs(d.x - sx) < 650) {
        d.state = "run";
        d.alert = 2.8;
      }
    });

    if (target) {
      const { d, zone } = target;
      state.hits++;
      impact(sx, sy, true);

      if (zone === "vital" || zone === "head") {
        d.alive = false;
        d.deadAt = now;
        d.tilt = d.dir * 0.72;
        state.harvests++;
        const pts = zone === "vital" ? 225 : 175;
        state.score += pts + (d.trophy ? 75 : 0);
        showMessage(`${zone === "vital" ? "Vital hit" : "Head hit"} +${pts}${d.trophy ? " • Trophy bonus" : ""}`, 1300);
        updateUI();

        if (state.harvests >= 5) {
          setTimeout(endRound, 700);
        }
      } else {
        state.score += 25;
        d.state = "run";
        d.speed *= 1.35;
        showMessage("Non-vital hit");
      }
    } else {
      impact(sx, sy, false);
    }

    updateUI();
  }

  function resetGame() {
    state.score = 0;
    state.harvests = 0;
    state.shots = 0;
    state.hits = 0;
    state.lastShotAt = 0;
    state.recoil = 0;
    state.animals = [];
    state.particles = [];
    state.roundOver = false;
    state.paused = false;
    updateUI();
  }

  function startGame() {
    resetGame();
    state.running = true;
    state.last = performance.now();
    state.nextSpawnAt = state.last + 900;
    spawn(true); spawn(true); spawn(true);
    ui.panelTitle.textContent = "Northwoods Hunter";
    ui.panelText.textContent = "Aim with your mouse and left-click to shoot. Harvest 5 deer to finish the round.";
    ui.startBtn.textContent = "Start Hunt";
    ui.startPanel.classList.add("hidden");
    setMenuOpen(false);
  }

  function update(dt, now) {
    state.recoil += (0 - state.recoil) * Math.min(1, dt * 8);

    if (state.running && now > state.nextSpawnAt) {
      spawn();
      state.nextSpawnAt = now + rand(1900, 3500);
    }

    for (const d of state.animals) {
      d.gait += dt * (d.state === "run" ? 12 : 5.5);
      if (d.alert > 0) d.alert -= dt;

      if (d.alive) {
        const mult = d.state === "run" ? 2.3 : 1;
        d.x += d.dir * d.speed * mult * dt;
        if (d.alert <= 0 && d.state === "run") d.state = "walk";
      }
    }

    state.animals = state.animals.filter(d => {
      if (!d.alive) return now - d.deadAt < 9000;
      return d.x > -280 && d.x < W + 280;
    });

    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.type === "blood" ? 145 * dt : 90 * dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);

    for (const f of state.fireflies) {
      f.phase += dt * f.speed;
      f.x += Math.sin(f.phase) * dt * f.drift;
      f.y += Math.cos(f.phase * 1.4) * dt * f.drift * 0.45;
      if (f.x < -20) f.x = W + 20;
      if (f.x > W + 20) f.x = -20;
      if (f.y < H * 0.15) f.y = H * 0.85;
      if (f.y > H * 0.9) f.y = H * 0.2;
    }
  }

  function drawSky(now) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#7b8892");
    sky.addColorStop(0.22, "#9ca08d");
    sky.addColorStop(0.42, "#6f7867");
    sky.addColorStop(1, "#30392d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // warm sun haze
    const sun = ctx.createRadialGradient(W * 0.78, H * 0.16, 8, W * 0.78, H * 0.16, 150);
    sun.addColorStop(0, "rgba(255,235,186,.55)");
    sun.addColorStop(0.45, "rgba(255,220,165,.22)");
    sun.addColorStop(1, "rgba(255,220,165,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    // clouds
    const cloudAlpha = 0.05;
    for (let i = 0; i < 7; i++) {
      const x = 130 + i * 170 + Math.sin(now * 0.00008 + i) * 12;
      const y = 100 + (i % 3) * 28;
      ctx.fillStyle = `rgba(255,255,255,${cloudAlpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 70, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 52, y + 3, 54, 15, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 45, y + 5, 48, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDistantRidges() {
    ctx.fillStyle = "#586356";
    ctx.beginPath();
    ctx.moveTo(0, 330);
    for (let x = 0; x <= W; x += 80) {
      ctx.lineTo(x, 320 - Math.sin(x * 0.015) * 22 - (x % 240 === 0 ? 10 : 0));
    }
    ctx.lineTo(W, 430);
    ctx.lineTo(0, 430);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(220,220,205,.08)";
    ctx.fillRect(0, 280, W, 150);
  }

  function drawPineLine(baseY, colorA, colorB, count, minH, maxH, trunkColor, offsetX = 0, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const x = i * (W / count) + offsetX;
      const h = minH + ((i * 47 + baseY) % (maxH - minH + 1));
      const crownColor = i % 2 === 0 ? colorA : colorB;
      ctx.fillStyle = crownColor;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + 18, baseY - h * 0.45);
      ctx.lineTo(x + 34, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 8, baseY);
      ctx.lineTo(x + 16, baseY - h * 0.75);
      ctx.lineTo(x + 40, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 16, baseY);
      ctx.lineTo(x + 16, baseY - h);
      ctx.lineTo(x + 48, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = trunkColor;
      ctx.fillRect(x + 13, baseY - h * 0.36, 6, h * 0.36);
    }
    ctx.restore();
  }

  function drawMeadow() {
    const field = ctx.createLinearGradient(0, 410, 0, H);
    field.addColorStop(0, "#59634a");
    field.addColorStop(0.45, "#495240");
    field.addColorStop(1, "#2c3429");
    ctx.fillStyle = field;
    ctx.fillRect(0, 410, W, H - 410);

    // shallow pathways / terrain variation
    ctx.fillStyle = "rgba(28,34,24,.12)";
    ctx.beginPath();
    ctx.moveTo(0, 520);
    ctx.bezierCurveTo(180, 500, 280, 560, 420, 542);
    ctx.bezierCurveTo(670, 515, 820, 560, 1040, 540);
    ctx.bezierCurveTo(1150, 531, 1235, 548, W, 560);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawForegroundDetails(now) {
    // rocks
    const rocks = [
      [170, 594, 40, 18], [238, 605, 28, 13], [1040, 590, 42, 16], [1124, 602, 26, 11]
    ];
    for (const [x, y, rx, ry] of rocks) {
      const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
      g.addColorStop(0, "#7b7e76");
      g.addColorStop(0.4, "#5b5f58");
      g.addColorStop(1, "#343734");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.35, ry * 0.2, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // stump
    ctx.fillStyle = "#4a3326";
    ctx.beginPath();
    ctx.ellipse(900, 606, 32, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b281d";
    ctx.fillRect(870, 607, 60, 22);
    ctx.fillStyle = "#7b624c";
    ctx.beginPath();
    ctx.ellipse(900, 606, 29, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // tall grass
    ctx.lineWidth = 2;
    for (let i = 0; i < 310; i++) {
      const x = (i * 41) % W;
      const baseY = 520 + ((i * 37) % 210);
      const h = 10 + ((i * 19) % 36);
      const sway = Math.sin(now * 0.0012 + i) * (1 + (i % 3));
      ctx.strokeStyle = i % 4 === 0 ? "rgba(39,48,30,.55)" : "rgba(48,61,37,.48)";
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + sway, baseY - h);
      ctx.stroke();
    }

    // dark framing branches
    ctx.strokeStyle = "rgba(20,24,19,.68)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 120);
    ctx.lineTo(120, 198);
    ctx.lineTo(255, 240);
    ctx.moveTo(W, 110);
    ctx.lineTo(1160, 192);
    ctx.lineTo(1035, 228);
    ctx.stroke();
  }

  function drawAtmosphere(now) {
    // drifting fog
    for (let i = 0; i < 4; i++) {
      const cx = ((now * 0.01) + i * 290) % (W + 250) - 125;
      const cy = 435 + i * 32;
      const fog = ctx.createRadialGradient(cx, cy, 10, cx, cy, 170);
      fog.addColorStop(0, "rgba(255,255,255,.035)");
      fog.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = fog;
      ctx.fillRect(cx - 180, cy - 120, 360, 240);
    }

    for (const f of state.fireflies) {
      const a = 0.12 + (Math.sin(f.phase * 2.2) + 1) * 0.12;
      ctx.fillStyle = `rgba(255,235,170,${a})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,240,190,${a * 0.25})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBackground(now) {
    drawSky(now);
    drawDistantRidges();
    drawPineLine(392, "#324034", "#29382d", 36, 85, 150, "#403328", 0, 0.95);
    drawPineLine(418, "#27352c", "#223028", 34, 110, 190, "#352a21", 14, 0.92);
    drawPineLine(448, "#202c24", "#18251f", 32, 130, 220, "#2f241d", 8, 0.95);
    drawMeadow();
    drawAtmosphere(now);
    drawForegroundDetails(now);

    // vignette
    const vignette = ctx.createRadialGradient(W / 2, H / 2, 230, W / 2, H / 2, 840);
    vignette.addColorStop(0.55, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.44)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function drawDeer(d) {
    const s = d.depth;
    const stride = Math.sin(d.gait);
    const stride2 = Math.cos(d.gait);
    const bob = d.alive ? Math.sin(d.gait * 2) * 1.8 : 0;
    const y = d.y + bob;

    ctx.save();
    ctx.translate(d.x, y);
    ctx.scale(d.dir, 1);

    if (!d.alive) {
      ctx.rotate(d.tilt);
      ctx.globalAlpha = 0.95;
    }

    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,.30)";
    ctx.beginPath();
    ctx.ellipse(-2 * s, 8 * s, 90 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    const coat = ctx.createLinearGradient(-80 * s, -75 * s, 80 * s, -10 * s);
    coat.addColorStop(0, "#35271e");
    coat.addColorStop(0.28, "#5c412f");
    coat.addColorStop(0.54, "#7b5a3f");
    coat.addColorStop(1, "#433126");

    // legs behind body
    const legs = [
      [-48, -18, -50 + stride * 6, 18, -58 + stride * 10, 51],
      [-20, -17, -18 - stride * 6, 21, -16 - stride * 8, 54],
      [30, -16, 32 - stride * 6, 19, 40 - stride * 10, 53],
      [52, -16, 50 + stride * 6, 19, 47 + stride * 9, 50]
    ];

    for (let i = 0; i < legs.length; i++) {
      const [x1, y1, kx, ky, hx, hy] = legs[i];
      ctx.strokeStyle = i < 2 ? "#3f2e24" : "#35271f";
      ctx.lineCap = "round";
      ctx.lineWidth = 8 * s;
      ctx.beginPath();
      ctx.moveTo(x1 * s, y1 * s);
      ctx.lineTo(kx * s, ky * s);
      ctx.lineTo(hx * s, hy * s);
      ctx.stroke();

      ctx.strokeStyle = "#171412";
      ctx.lineWidth = 3.5 * s;
      ctx.beginPath();
      ctx.moveTo(hx * s, hy * s);
      ctx.lineTo((hx + 6) * s, (hy + 4) * s);
      ctx.stroke();
    }

    // body
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(-74 * s, -43 * s);
    ctx.bezierCurveTo(-62 * s, -73 * s, -25 * s, -82 * s, 15 * s, -75 * s);
    ctx.bezierCurveTo(49 * s, -70 * s, 72 * s, -55 * s, 69 * s, -33 * s);
    ctx.bezierCurveTo(65 * s, -9 * s, 29 * s, -8 * s, -6 * s, -9 * s);
    ctx.bezierCurveTo(-42 * s, -10 * s, -71 * s, -19 * s, -74 * s, -43 * s);
    ctx.closePath();
    ctx.fill();

    // chest / shoulder highlight
    ctx.fillStyle = "rgba(170,130,93,.25)";
    ctx.beginPath();
    ctx.ellipse(32 * s, -38 * s, 22 * s, 29 * s, 0.08, 0, Math.PI * 2);
    ctx.fill();

    // belly and throat fur
    ctx.fillStyle = "rgba(228,214,191,.22)";
    ctx.beginPath();
    ctx.ellipse(-4 * s, -20 * s, 47 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // back ridge sheen
    ctx.strokeStyle = "rgba(219,190,160,.16)";
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-48 * s, -58 * s);
    ctx.quadraticCurveTo(2 * s, -74 * s, 47 * s, -60 * s);
    ctx.stroke();

    // fur texture
    ctx.strokeStyle = "rgba(240,218,194,.12)";
    ctx.lineWidth = 1 * s;
    for (let i = 0; i < 20; i++) {
      const fx = (-52 + i * 5.5) * s;
      const fy = (-54 + (i % 4) * 6.5) * s;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + 8 * s, fy + 2 * s);
      ctx.stroke();
    }

    // neck
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(40 * s, -58 * s);
    ctx.quadraticCurveTo(50 * s, -82 * s, 57 * s, -108 * s);
    ctx.lineTo(82 * s, -95 * s);
    ctx.quadraticCurveTo(71 * s, -64 * s, 60 * s, -42 * s);
    ctx.closePath();
    ctx.fill();

    // throat patch
    ctx.fillStyle = "rgba(232,224,208,.28)";
    ctx.beginPath();
    ctx.ellipse(63 * s, -76 * s, 8 * s, 18 * s, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(82 * s, -98 * s, 26 * s, 16 * s, -0.08, 0, Math.PI * 2);
    ctx.fill();

    // jaw / cheek highlight
    ctx.fillStyle = "rgba(190,156,123,.18)";
    ctx.beginPath();
    ctx.ellipse(87 * s, -94 * s, 12 * s, 7 * s, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // muzzle
    const muzzle = ctx.createLinearGradient(94 * s, -102 * s, 112 * s, -84 * s);
    muzzle.addColorStop(0, "#4b3a2d");
    muzzle.addColorStop(1, "#2a211b");
    ctx.fillStyle = muzzle;
    ctx.beginPath();
    ctx.ellipse(104 * s, -93 * s, 11 * s, 7 * s, -0.05, 0, Math.PI * 2);
    ctx.fill();

    // nose
    ctx.fillStyle = "#141312";
    ctx.beginPath();
    ctx.ellipse(109 * s, -92 * s, 4.2 * s, 3.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // ear
    ctx.fillStyle = "#5b402e";
    ctx.beginPath();
    ctx.moveTo(71 * s, -111 * s);
    ctx.lineTo(60 * s, -136 * s);
    ctx.lineTo(81 * s, -116 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(235,210,188,.16)";
    ctx.beginPath();
    ctx.moveTo(71 * s, -114 * s);
    ctx.lineTo(65 * s, -128 * s);
    ctx.lineTo(76 * s, -118 * s);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = "#090909";
    ctx.beginPath();
    ctx.arc(89 * s, -101 * s, 2.7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.beginPath();
    ctx.arc(89.7 * s, -101.7 * s, 0.85 * s, 0, Math.PI * 2);
    ctx.fill();

    // tail
    ctx.fillStyle = "#d9ccb6";
    ctx.beginPath();
    ctx.moveTo(-68 * s, -54 * s);
    ctx.lineTo(-94 * s, -70 * s);
    ctx.lineTo(-77 * s, -36 * s);
    ctx.closePath();
    ctx.fill();

    // antlers
    if (d.trophy) {
      ctx.strokeStyle = "#3e2f24";
      ctx.lineCap = "round";
      ctx.lineWidth = 3 * s;

      ctx.beginPath();
      ctx.moveTo(69 * s, -111 * s);
      ctx.lineTo(62 * s, -130 * s);
      ctx.lineTo(49 * s, -146 * s);
      ctx.moveTo(61 * s, -129 * s);
      ctx.lineTo(66 * s, -152 * s);
      ctx.moveTo(54 * s, -136 * s);
      ctx.lineTo(44 * s, -159 * s);
      ctx.moveTo(58 * s, -141 * s);
      ctx.lineTo(68 * s, -160 * s);

      ctx.moveTo(74 * s, -109 * s);
      ctx.lineTo(75 * s, -132 * s);
      ctx.lineTo(87 * s, -149 * s);
      ctx.moveTo(77 * s, -128 * s);
      ctx.lineTo(90 * s, -138 * s);
      ctx.moveTo(80 * s, -137 * s);
      ctx.lineTo(96 * s, -154 * s);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(70 * s, -112 * s);
      ctx.lineTo(63 * s, -130 * s);
      ctx.moveTo(75 * s, -110 * s);
      ctx.lineTo(76 * s, -131 * s);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.type === "blood" ? "#611f1c" : "#c9b696";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      if (p.type === "dust") {
        ctx.fillStyle = `rgba(218,201,171,${alpha * 0.15})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRifle(now) {
    const recoil = state.recoil;
    const swayX = Math.sin(now * 0.0011) * 3;
    const swayY = Math.cos(now * 0.0014) * 2;

    ctx.save();
    ctx.translate(W * 0.5 + swayX, H + 20 + recoil * 0.7 + swayY);

    // drop shadow
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 170, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // wood stock
    const wood = ctx.createLinearGradient(-160, -10, 130, -110);
    wood.addColorStop(0, "#2d1b13");
    wood.addColorStop(0.32, "#5d3822");
    wood.addColorStop(0.65, "#815233");
    wood.addColorStop(1, "#321f17");
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(-180, 10);
    ctx.lineTo(-135, -42);
    ctx.lineTo(-72, -90);
    ctx.lineTo(18, -94);
    ctx.lineTo(88, -52);
    ctx.lineTo(165, 12);
    ctx.closePath();
    ctx.fill();

    // butt pad
    ctx.fillStyle = "#131313";
    ctx.beginPath();
    ctx.moveTo(-183, 8);
    ctx.lineTo(-170, -10);
    ctx.lineTo(-147, 10);
    ctx.closePath();
    ctx.fill();

    // comb highlight
    ctx.strokeStyle = "rgba(247,218,191,.12)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-120, -42);
    ctx.quadraticCurveTo(-42, -82, 76, -56);
    ctx.stroke();

    // trigger guard
    ctx.strokeStyle = "#141516";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(23, -58, 24, 20, 0, 0, Math.PI * 2);
    ctx.stroke();

    // receiver
    const metal = ctx.createLinearGradient(-30, -165, 30, -40);
    metal.addColorStop(0, "#0e0f0f");
    metal.addColorStop(0.3, "#313334");
    metal.addColorStop(0.55, "#494b4c");
    metal.addColorStop(0.8, "#232425");
    metal.addColorStop(1, "#0b0c0c");
    ctx.fillStyle = metal;
    ctx.fillRect(-28, -150, 56, 85);

    // ejection port
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(-8, -134, 34, 24);

    // bolt handle
    ctx.strokeStyle = "#252626";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(31, -112);
    ctx.lineTo(62, -95);
    ctx.lineTo(67, -80);
    ctx.stroke();
    ctx.fillStyle = "#1c1d1d";
    ctx.beginPath();
    ctx.arc(69, -77, 6, 0, Math.PI * 2);
    ctx.fill();

    // barrel
    const barrel = ctx.createLinearGradient(-10, -380, 10, -140);
    barrel.addColorStop(0, "#070808");
    barrel.addColorStop(0.35, "#3a3c3d");
    barrel.addColorStop(0.55, "#5a5d5f");
    barrel.addColorStop(0.82, "#232425");
    barrel.addColorStop(1, "#080808");
    ctx.fillStyle = barrel;
    ctx.fillRect(-8, -380, 16, 230);

    // barrel tip shadow
    ctx.fillStyle = "#060606";
    ctx.fillRect(-8, -380, 16, 8);

    // scope body
    const scope = ctx.createLinearGradient(-70, -210, 70, -150);
    scope.addColorStop(0, "#090a0a");
    scope.addColorStop(0.3, "#252728");
    scope.addColorStop(0.55, "#434648");
    scope.addColorStop(0.8, "#1c1e1f");
    scope.addColorStop(1, "#080909");
    ctx.fillStyle = scope;
    ctx.fillRect(-72, -197, 144, 24);

    // objective / eyepiece bells
    ctx.fillStyle = "#111313";
    ctx.beginPath();
    ctx.ellipse(-72, -185, 22, 27, 0, 0, Math.PI * 2);
    ctx.ellipse(72, -185, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // scope glass
    const glassL = ctx.createRadialGradient(-77, -187, 3, -77, -187, 18);
    glassL.addColorStop(0, "rgba(107,157,162,.50)");
    glassL.addColorStop(1, "rgba(25,37,40,.95)");
    ctx.fillStyle = glassL;
    ctx.beginPath();
    ctx.ellipse(-77, -185, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    const glassR = ctx.createRadialGradient(77, -187, 3, 77, -187, 22);
    glassR.addColorStop(0, "rgba(118,160,168,.50)");
    glassR.addColorStop(1, "rgba(24,36,39,.95)");
    ctx.fillStyle = glassR;
    ctx.beginPath();
    ctx.ellipse(77, -185, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // turrets
    ctx.fillStyle = "#191b1b";
    ctx.fillRect(-12, -219, 24, 18);
    ctx.fillRect(-4, -226, 8, 32);

    // rings
    ctx.fillStyle = "#202122";
    ctx.fillRect(-40, -173, 14, 30);
    ctx.fillRect(28, -173, 14, 30);

    // trigger
    ctx.strokeStyle = "#0e0f10";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(25, -51);
    ctx.quadraticCurveTo(16, -42, 20, -27);
    ctx.stroke();

    ctx.restore();

    if (performance.now() < state.muzzleFlashUntil) {
      ctx.fillStyle = "rgba(255,231,172,.14)";
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(W * 0.5 + swayX, H + 20 + recoil * 0.7 + swayY);
      const flash = ctx.createRadialGradient(0, -380, 4, 0, -380, 65);
      flash.addColorStop(0, "rgba(255,246,219,.75)");
      flash.addColorStop(0.32, "rgba(255,214,110,.28)");
      flash.addColorStop(1, "rgba(255,214,110,0)");
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(0, -380, 65, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawReticle() {
    const x = state.mouse.x;
    const y = state.mouse.y - state.recoil;

    ctx.save();

    // subtle darkening outside reticle focus
    ctx.strokeStyle = "rgba(15,15,14,.92)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.moveTo(x - 44, y); ctx.lineTo(x - 8, y);
    ctx.moveTo(x + 8, y); ctx.lineTo(x + 44, y);
    ctx.moveTo(x, y - 44); ctx.lineTo(x, y - 8);
    ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 44);
    ctx.stroke();

    // fine center cross
    ctx.strokeStyle = "rgba(220,220,215,.30)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
    ctx.stroke();

    // center dot
    ctx.fillStyle = "rgba(12,12,12,.95)";
    ctx.beginPath();
    ctx.arc(x, y, 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawPauseOverlay() {
    if (!state.paused) return;
    ctx.fillStyle = "rgba(0,0,0,.52)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "700 42px system-ui";
    ctx.fillText("PAUSED", W / 2, H / 2);
    ctx.font = "18px system-ui";
    ctx.fillText("Press Esc to resume", W / 2, H / 2 + 38);
  }

  function render(now) {
    ctx.clearRect(0, 0, W, H);
    drawBackground(now);
    [...state.animals].sort((a, b) => a.depth - b.depth).forEach(drawDeer);
    drawParticles();
    drawRifle(now);
    if (state.running) drawReticle();
    drawPauseOverlay();
  }

  function frame(now) {
    const dt = Math.min(0.035, ((now - state.last) || 16.6) / 1000);
    state.last = now;

    if (state.running && !state.paused) {
      update(dt, now);
    }

    render(now);
    requestAnimationFrame(frame);
  }

  canvas.addEventListener("mousemove", pointer);
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      pointer(e);
      fire();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !state.roundOver) {
      if (state.running) {
        state.paused = !state.paused;
        showMessage(state.paused ? "Paused" : "Hunt resumed", 900);
      }
    }
  });

  ui.startBtn.addEventListener("click", startGame);

  updateUI();
  render(performance.now());
  requestAnimationFrame(frame);
})();
