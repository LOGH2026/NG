(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    score: document.getElementById("score"),
    harvests: document.getElementById("harvests"),
    accuracy: document.getElementById("accuracy"),
    ammo: document.getElementById("ammo"),
    reserve: document.getElementById("reserve"),
    startPanel: document.getElementById("startPanel"),
    startBtn: document.getElementById("startBtn"),
    message: document.getElementById("message"),
  };

  const state = {
    running: false,
    paused: false,
    last: 0,
    score: 0,
    harvests: 0,
    shots: 0,
    hits: 0,
    ammo: 5,
    reserve: 20,
    magSize: 5,
    reloading: false,
    reloadUntil: 0,
    muzzleFlashUntil: 0,
    recoil: 0,
    wind: 0.18,
    mouse: { x: canvas.width * .55, y: canvas.height * .48 },
    animals: [],
    particles: [],
    nextSpawn: 0,
    messageTimer: 0,
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function resizePointer(e) {
    const r = canvas.getBoundingClientRect();
    state.mouse.x = (e.clientX - r.left) * canvas.width / r.width;
    state.mouse.y = (e.clientY - r.top) * canvas.height / r.height;
  }

  function showMessage(text, ms = 1100) {
    ui.message.textContent = text;
    ui.message.classList.add("show");
    clearTimeout(state.messageTimer);
    state.messageTimer = setTimeout(() => ui.message.classList.remove("show"), ms);
  }

  function updateUI() {
    ui.score.textContent = Math.round(state.score);
    ui.harvests.textContent = state.harvests;
    ui.ammo.textContent = state.ammo;
    ui.reserve.textContent = state.reserve;
    ui.accuracy.textContent = state.shots ? Math.round(state.hits / state.shots * 100) + "%" : "0%";
  }

  function makeDeer() {
    const fromLeft = Math.random() < .5;
    const depth = rand(.55, 1.0);
    const baseY = rand(405, 590);
    const speed = rand(18, 42) * (1.15 - depth * .3);
    return {
      x: fromLeft ? -170 : canvas.width + 170,
      y: baseY,
      dir: fromLeft ? 1 : -1,
      speed,
      depth,
      age: 0,
      state: "walk",
      health: 100,
      alive: true,
      alert: 0,
      gait: Math.random() * Math.PI * 2,
      sway: rand(-7, 7),
      trophy: Math.random() < .28,
      deadTime: 0,
    };
  }

  function spawnAnimal(force = false) {
    if (!force && state.animals.length >= 5) return;
    state.animals.push(makeDeer());
  }

  function deerMetrics(d) {
    const s = d.depth;
    return {
      bodyW: 125 * s,
      bodyH: 60 * s,
      headR: 19 * s,
      neckW: 22 * s,
      leg: 62 * s
    };
  }

  function hitTest(d, x, y) {
    if (!d.alive) return null;
    const m = deerMetrics(d);
    const yy = d.y + Math.sin(d.gait) * 2;

    // Body ellipse
    const bx = d.x;
    const by = yy - 35 * d.depth;
    const nx = d.x + d.dir * 65 * d.depth;
    const ny = yy - 72 * d.depth;
    const hx = d.x + d.dir * 88 * d.depth;
    const hy = yy - 88 * d.depth;

    const eb = ((x - bx) / (m.bodyW * .52)) ** 2 + ((y - by) / (m.bodyH * .52)) ** 2;
    if (eb <= 1) {
      // Vital zone: forward/lower-middle chest
      const vitalX = d.x + d.dir * 28 * d.depth;
      const vitalY = yy - 32 * d.depth;
      const ev = ((x - vitalX)/(26*d.depth))**2 + ((y-vitalY)/(22*d.depth))**2;
      if (ev <= 1) return "vital";
      return "body";
    }

    const head = Math.hypot(x - hx, y - hy);
    if (head <= m.headR * 1.15) return "head";

    // neck
    if (Math.abs(x - nx) < m.neckW && y > ny - 28*d.depth && y < ny + 28*d.depth) return "neck";
    return null;
  }

  function fire() {
    if (!state.running || state.paused || state.reloading) return;
    const now = performance.now();
    if (state.ammo <= 0) {
      showMessage("Empty — press R to reload");
      return;
    }

    state.ammo--;
    state.shots++;
    state.muzzleFlashUntil = now + 70;
    state.recoil = Math.min(24, state.recoil + 13);

    // Small random mechanical/aim dispersion
    const spread = 3.2;
    const shotX = state.mouse.x + rand(-spread, spread) + state.wind * 2;
    const shotY = state.mouse.y + rand(-spread, spread);

    let best = null;
    // Closest visual target wins
    for (const d of [...state.animals].sort((a,b) => b.depth - a.depth)) {
      const zone = hitTest(d, shotX, shotY);
      if (zone) { best = { d, zone }; break; }
    }

    state.animals.forEach(d => {
      if (!d.alive) return;
      const dist = Math.abs(d.x - shotX);
      if (dist < 600) {
        d.alert = 2.5;
        d.state = "run";
      }
    });

    if (best) {
      const { d, zone } = best;
      state.hits++;
      createImpact(shotX, shotY, true);

      if (zone === "vital" || zone === "head") {
        d.health = 0;
        d.alive = false;
        d.deadTime = now;
        state.harvests++;
        const pts = zone === "head" ? 160 : 220;
        state.score += pts + (d.trophy ? 80 : 0);
        showMessage(`${zone === "vital" ? "Vital hit" : "Head hit"}  +${pts}${d.trophy ? "  Trophy bonus" : ""}`);
      } else if (zone === "neck") {
        d.health -= 80;
        state.score += 60;
        d.state = "run";
        showMessage("Neck hit");
      } else {
        d.health -= 45;
        state.score += 30;
        d.state = "run";
        d.speed *= 1.45;
        showMessage("Body hit — animal wounded");
      }

      if (d.health <= 0 && d.alive) {
        d.alive = false;
        d.deadTime = now;
        state.harvests++;
      }
    } else {
      createImpact(shotX, shotY, false);
    }

    updateUI();
  }

  function reload() {
    if (state.reloading || state.ammo === state.magSize || state.reserve <= 0) return;
    state.reloading = true;
    state.reloadUntil = performance.now() + 1450;
    showMessage("Reloading…", 1300);
  }

  function finishReload() {
    const need = state.magSize - state.ammo;
    const amount = Math.min(need, state.reserve);
    state.ammo += amount;
    state.reserve -= amount;
    state.reloading = false;
    updateUI();
  }

  function createImpact(x, y, blood) {
    for (let i = 0; i < (blood ? 10 : 5); i++) {
      state.particles.push({
        x, y,
        vx: rand(-45,45),
        vy: rand(-50,8),
        life: rand(.25,.55),
        maxLife: .55,
        blood
      });
    }
  }

  function update(dt, now) {
    if (state.reloading && now >= state.reloadUntil) finishReload();
    state.recoil += (0 - state.recoil) * Math.min(1, dt * 9);

    if (now > state.nextSpawn) {
      spawnAnimal();
      state.nextSpawn = now + rand(1900, 3800);
    }

    for (const d of state.animals) {
      d.age += dt;
      d.gait += dt * (d.state === "run" ? 10 : 5);
      if (d.alert > 0) d.alert -= dt;

      if (d.alive) {
        let mult = d.state === "run" ? 2.2 : 1;
        d.x += d.dir * d.speed * mult * dt;
        if (d.alert <= 0 && d.state === "run") {
          d.state = "walk";
          d.speed /= d.speed > 55 ? 1.25 : 1;
        }
      }
    }

    state.animals = state.animals.filter(d => {
      if (!d.alive) return now - d.deadTime < 10000;
      return d.x > -260 && d.x < canvas.width + 260;
    });

    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0, "#617080");
    g.addColorStop(.42, "#a9a58f");
    g.addColorStop(.43, "#68705e");
    g.addColorStop(1, "#343a2e");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // distant haze
    ctx.fillStyle = "rgba(220,220,205,.15)";
    ctx.fillRect(0, 250, canvas.width, 140);

    // tree line
    for (let i = 0; i < 44; i++) {
      const x = i * 31 + (i%3)*8;
      const h = 105 + (i*47)%95;
      ctx.fillStyle = i%2 ? "#313d32" : "#263329";
      ctx.beginPath();
      ctx.moveTo(x, 360);
      ctx.lineTo(x+16, 360-h);
      ctx.lineTo(x+32, 360);
      ctx.closePath();
      ctx.fill();
    }

    // meadow
    ctx.fillStyle = "rgba(67,77,55,.45)";
    ctx.fillRect(0, 395, canvas.width, 325);

    // foreground grass strokes
    ctx.strokeStyle = "rgba(28,36,23,.42)";
    ctx.lineWidth = 2;
    for (let i=0;i<180;i++){
      const x=(i*73)%canvas.width;
      const y=520+((i*41)%210);
      const h=8+((i*19)%24);
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+((i%3)-1)*5,y-h); ctx.stroke();
    }

    // vignette
    const v = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 180, canvas.width/2, canvas.height/2, 780);
    v.addColorStop(.55, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,.36)");
    ctx.fillStyle = v;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function drawDeer(d) {
    const m = deerMetrics(d);
    const bob = d.alive ? Math.sin(d.gait) * 2.2 : 0;
    const x = d.x;
    const y = d.y + bob;
    const s = d.depth;
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(d.dir,1);

    if (!d.alive) {
      ctx.rotate(.72);
      ctx.globalAlpha = .92;
    }

    // shadow
    ctx.save();
    ctx.scale(d.dir,1);
    ctx.fillStyle = "rgba(0,0,0,.23)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 78*s, 13*s, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    const body = d.trophy ? "#5d4332" : "#674937";
    const dark = "#3a2c24";
    const light = "#8a6a50";

    // legs
    ctx.strokeStyle = dark;
    ctx.lineWidth = 9*s;
    ctx.lineCap = "round";
    const legPhase = Math.sin(d.gait);
    const legs = [
      [-42, -5, -48 + legPhase*7, 48],
      [-20, -6, -15 - legPhase*7, 50],
      [30, -6, 37 - legPhase*7, 48],
      [48, -6, 42 + legPhase*7, 49],
    ];
    for (const [x1,y1,x2,y2] of legs) {
      ctx.beginPath();
      ctx.moveTo(x1*s,y1*s);
      ctx.lineTo(x2*s,y2*s);
      ctx.stroke();
    }

    // body
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(-4*s, -36*s, 64*s, 31*s, -.06, 0, Math.PI*2);
    ctx.fill();

    // chest highlight
    ctx.fillStyle = "rgba(170,135,101,.24)";
    ctx.beginPath();
    ctx.ellipse(29*s,-33*s,20*s,26*s,.18,0,Math.PI*2);
    ctx.fill();

    // neck
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(36*s,-53*s);
    ctx.lineTo(54*s,-99*s);
    ctx.lineTo(74*s,-92*s);
    ctx.lineTo(59*s,-43*s);
    ctx.closePath();
    ctx.fill();

    // head/muzzle
    ctx.beginPath();
    ctx.ellipse(76*s,-94*s,25*s,16*s,-.08,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(99*s,-91*s,9*s,7*s,0,0,Math.PI*2);
    ctx.fill();

    // ear
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(67*s,-108*s);
    ctx.lineTo(57*s,-128*s);
    ctx.lineTo(76*s,-112*s);
    ctx.closePath();
    ctx.fill();

    // tail
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(-65*s,-52*s);
    ctx.lineTo(-88*s,-66*s);
    ctx.lineTo(-70*s,-35*s);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = "#0e0d0b";
    ctx.beginPath();
    ctx.arc(84*s,-99*s,2.5*s,0,Math.PI*2);
    ctx.fill();

    // antlers for trophy deer
    if (d.trophy) {
      ctx.strokeStyle = "#4a3827";
      ctx.lineWidth = 3*s;
      ctx.beginPath();
      ctx.moveTo(69*s,-108*s);
      ctx.lineTo(61*s,-130*s);
      ctx.lineTo(46*s,-143*s);
      ctx.moveTo(61*s,-130*s);
      ctx.lineTo(66*s,-150*s);
      ctx.moveTo(54*s,-137*s);
      ctx.lineTo(43*s,-155*s);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.blood ? "#672a22" : "#c9bca0";
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.blood?3:2,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawReticle() {
    const x = state.mouse.x;
    const y = state.mouse.y - state.recoil;
    ctx.save();
    ctx.strokeStyle = "rgba(20,20,18,.92)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x,y,12,0,Math.PI*2);
    ctx.moveTo(x-35,y); ctx.lineTo(x-8,y);
    ctx.moveTo(x+8,y); ctx.lineTo(x+35,y);
    ctx.moveTo(x,y-35); ctx.lineTo(x,y-8);
    ctx.moveTo(x,y+8); ctx.lineTo(x,y+35);
    ctx.stroke();

    ctx.fillStyle = "rgba(18,18,16,.9)";
    ctx.beginPath(); ctx.arc(x,y,1.8,0,Math.PI*2); ctx.fill();
    ctx.restore();

    if (performance.now() < state.muzzleFlashUntil) {
      ctx.fillStyle = "rgba(255,226,153,.17)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }
  }

  function drawWeapon() {
    const recoil = state.recoil;
    ctx.save();
    ctx.translate(canvas.width*.5, canvas.height + 8 + recoil*.8);
    ctx.fillStyle = "#171615";
    ctx.beginPath();
    ctx.moveTo(-80,0);
    ctx.lineTo(-45,-78);
    ctx.lineTo(40,-70);
    ctx.lineTo(95,0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#2b2a27";
    ctx.fillRect(-19,-120,38,95);
    ctx.fillStyle = "#111";
    ctx.fillRect(-8,-250,16,145);
    ctx.fillStyle = "#242323";
    ctx.fillRect(-20,-172,40,18);
    ctx.restore();
  }

  function drawPause() {
    if (!state.paused) return;
    ctx.fillStyle = "rgba(0,0,0,.48)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "700 42px system-ui";
    ctx.fillText("PAUSED", canvas.width/2, canvas.height/2);
    ctx.font = "18px system-ui";
    ctx.fillText("Press Esc to resume", canvas.width/2, canvas.height/2 + 36);
  }

  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(.035, (now - state.last) / 1000 || 0);
    state.last = now;

    if (!state.paused) update(dt, now);
    drawBackground();

    const sorted = [...state.animals].sort((a,b) => a.depth - b.depth);
    for (const d of sorted) drawDeer(d);

    drawParticles();
    drawWeapon();
    drawReticle();
    drawPause();

    requestAnimationFrame(frame);
  }

  function startGame() {
    state.running = true;
    state.paused = false;
    state.last = performance.now();
    state.nextSpawn = state.last + 900;
    state.animals = [];
    spawnAnimal(true);
    spawnAnimal(true);
    ui.startPanel.classList.add("hidden");
    updateUI();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener("mousemove", resizePointer);
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      resizePointer(e);
      fire();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") reload();
    if (e.key === "Escape" && state.running) {
      state.paused = !state.paused;
      showMessage(state.paused ? "Paused" : "Hunt resumed");
    }
  });

  ui.startBtn.addEventListener("click", startGame);
  updateUI();

  // Paint a useful first frame behind the menu.
  drawBackground();
  spawnAnimal(true);
  spawnAnimal(true);
  state.animals.forEach(drawDeer);
  drawWeapon();
  drawReticle();
})();
