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

  const state = {
    running: false,
    paused: false,
    roundOver: false,
    last: 0,
    score: 0,
    harvests: 0,
    shots: 0,
    hits: 0,
    lastShotAt: 0,
    fireDelay: 650, // preserves the slower rifle firing cadence
    recoil: 0,
    muzzleFlashUntil: 0,
    mouse: { x: 760, y: 355 },
    animals: [],
    particles: [],
    nextSpawn: 0,
    messageTimer: 0
  };

  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));

  function pointer(e){
    const r=canvas.getBoundingClientRect();
    state.mouse.x=(e.clientX-r.left)*canvas.width/r.width;
    state.mouse.y=(e.clientY-r.top)*canvas.height/r.height;
  }

  function msg(text,ms=1000){
    ui.message.textContent=text;
    ui.message.classList.add("show");
    clearTimeout(state.messageTimer);
    state.messageTimer=setTimeout(()=>ui.message.classList.remove("show"),ms);
  }

  function updateUI(){
    ui.score.textContent=Math.round(state.score);
    ui.harvests.textContent=`${state.harvests} / 5`;
    ui.accuracy.textContent=state.shots ? Math.round(state.hits/state.shots*100)+"%" : "0%";
  }

  function makeDeer(){
    const left=Math.random()<.5;
    const depth=rand(.58,1);
    const y=rand(420,585);
    return {
      x:left?-180:canvas.width+180,
      y,
      dir:left?1:-1,
      depth,
      speed:rand(22,38),
      gait:rand(0,Math.PI*2),
      alive:true,
      state:"walk",
      alert:0,
      trophy:Math.random()<.32,
      deadAt:0,
      tilt:0
    };
  }

  function spawn(force=false){
    if(!force && state.animals.filter(a=>a.alive).length>=5) return;
    state.animals.push(makeDeer());
  }

  function metrics(d){
    const s=d.depth;
    return { bw:132*s, bh:62*s, head:18*s, leg:63*s };
  }

  function hitTest(d,x,y){
    if(!d.alive) return null;
    const s=d.depth;
    const bob=Math.sin(d.gait)*2;
    const yy=d.y+bob;
    const bodyX=d.x, bodyY=yy-39*s;
    const headX=d.x+d.dir*87*s, headY=yy-92*s;

    const body=((x-bodyX)/(68*s))**2+((y-bodyY)/(33*s))**2;
    if(body<=1){
      const vitalX=d.x+d.dir*30*s;
      const vitalY=yy-34*s;
      const vital=((x-vitalX)/(26*s))**2+((y-vitalY)/(22*s))**2;
      return vital<=1 ? "vital" : "body";
    }
    if(Math.hypot(x-headX,y-headY)<=20*s) return "head";
    return null;
  }

  function endRound(){
    state.roundOver=true;
    state.running=false;
    document.querySelector(".game-wrap").classList.remove("playing");
    ui.panelTitle.textContent="Round Complete";
    ui.panelText.textContent=`You harvested 5 animals. Score: ${Math.round(state.score)} • Accuracy: ${state.shots ? Math.round(state.hits/state.shots*100) : 0}%`;
    ui.startBtn.textContent="Hunt Again";
    ui.startPanel.classList.remove("hidden");
    document.querySelector(".game-wrap").classList.remove("playing");
  }

  function fire(){
    if(!state.running || state.paused || state.roundOver) return;

    const now=performance.now();
    if(now-state.lastShotAt<state.fireDelay) return;
    state.lastShotAt=now;

    state.shots++;
    state.recoil=17;
    state.muzzleFlashUntil=now+65;

    const spread=2.5;
    const sx=state.mouse.x+rand(-spread,spread);
    const sy=state.mouse.y+rand(-spread,spread);

    let target=null;
    for(const d of [...state.animals].sort((a,b)=>b.depth-a.depth)){
      const zone=hitTest(d,sx,sy);
      if(zone){ target={d,zone}; break; }
    }

    state.animals.forEach(d=>{
      if(d.alive && Math.abs(d.x-sx)<640){
        d.state="run";
        d.alert=2.8;
      }
    });

    if(target){
      const {d,zone}=target;
      state.hits++;
      impact(sx,sy,true);

      if(zone==="vital" || zone==="head"){
        d.alive=false;
        d.deadAt=now;
        d.tilt=d.dir*.7;
        state.harvests++;
        const pts=zone==="vital"?225:170;
        state.score+=pts+(d.trophy?75:0);
        msg(`${zone==="vital"?"Vital hit":"Head hit"} +${pts}${d.trophy?" • Trophy bonus":""}`,1300);
        updateUI();
        if(state.harvests>=5){
          setTimeout(endRound,650);
        }
      } else {
        state.score+=25;
        d.state="run";
        d.speed*=1.35;
        msg("Non-vital hit");
      }
    } else {
      impact(sx,sy,false);
    }

    updateUI();
  }

  function impact(x,y,blood){
    for(let i=0;i<(blood?12:6);i++){
      state.particles.push({
        x,y,vx:rand(-50,50),vy:rand(-58,10),
        life:rand(.25,.55),blood
      });
    }
  }

  function update(dt,now){
    state.recoil += (0-state.recoil)*Math.min(1,dt*8);

    if(now>state.nextSpawn){
      spawn();
      state.nextSpawn=now+rand(1800,3400);
    }

    for(const d of state.animals){
      d.gait += dt*(d.state==="run"?11:5.2);
      if(d.alert>0) d.alert-=dt;

      if(d.alive){
        const mult=d.state==="run"?2.35:1;
        d.x += d.dir*d.speed*mult*dt;
        if(d.alert<=0 && d.state==="run") d.state="walk";
      }
    }

    state.animals=state.animals.filter(d=>{
      if(!d.alive) return now-d.deadAt<9000;
      return d.x>-260 && d.x<canvas.width+260;
    });

    for(const p of state.particles){
      p.life-=dt;
      p.x+=p.vx*dt;
      p.y+=p.vy*dt;
      p.vy+=130*dt;
    }
    state.particles=state.particles.filter(p=>p.life>0);
  }

  function background(){
    const sky=ctx.createLinearGradient(0,0,0,720);
    sky.addColorStop(0,"#7d8991");
    sky.addColorStop(.34,"#a9a694");
    sky.addColorStop(.48,"#777c67");
    sky.addColorStop(1,"#343d2e");
    ctx.fillStyle=sky;
    ctx.fillRect(0,0,1280,720);

    // far ridgeline
    ctx.fillStyle="#4b5648";
    ctx.beginPath();
    ctx.moveTo(0,335);
    for(let x=0;x<=1280;x+=80){
      ctx.lineTo(x,330-Math.sin(x*.017)*24-(x%160===0?12:0));
    }
    ctx.lineTo(1280,430);
    ctx.lineTo(0,430);
    ctx.closePath();
    ctx.fill();

    // layered trees
    for(let layer=0;layer<3;layer++){
      for(let i=0;i<38;i++){
        const x=i*36+(layer*11);
        const h=90+((i*41+layer*29)%110);
        const base=390+layer*18;
        ctx.fillStyle=layer===0?"#354338":layer===1?"#29372e":"#223027";
        ctx.beginPath();
        ctx.moveTo(x,base);
        ctx.lineTo(x+17,base-h);
        ctx.lineTo(x+34,base);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle="#3a3127";
        ctx.fillRect(x+15,base-h*.38,4,h*.38);
      }
    }

    // meadow
    const field=ctx.createLinearGradient(0,410,0,720);
    field.addColorStop(0,"#59644b");
    field.addColorStop(1,"#2d3529");
    ctx.fillStyle=field;
    ctx.fillRect(0,410,1280,310);

    // grass
    ctx.strokeStyle="rgba(32,41,26,.5)";
    ctx.lineWidth=2;
    for(let i=0;i<230;i++){
      const x=(i*67)%1280, y=515+((i*43)%205), h=10+((i*17)%29);
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.lineTo(x+((i%5)-2)*2,y-h);
      ctx.stroke();
    }

    // foreground branches
    ctx.strokeStyle="rgba(24,30,22,.62)";
    ctx.lineWidth=7;
    ctx.beginPath();
    ctx.moveTo(0,155); ctx.lineTo(175,250); ctx.lineTo(310,286);
    ctx.moveTo(1280,120); ctx.lineTo(1130,220); ctx.lineTo(1020,250);
    ctx.stroke();

    const vignette=ctx.createRadialGradient(640,360,220,640,360,820);
    vignette.addColorStop(.55,"rgba(0,0,0,0)");
    vignette.addColorStop(1,"rgba(0,0,0,.42)");
    ctx.fillStyle=vignette;
    ctx.fillRect(0,0,1280,720);
  }

  function deer(d){
    const s=d.depth;
    const stride=Math.sin(d.gait);
    const bob=d.alive?Math.sin(d.gait*2)*1.8:0;
    const y=d.y+bob;

    ctx.save();
    ctx.translate(d.x,y);
    ctx.scale(d.dir,1);
    if(!d.alive){ ctx.rotate(d.tilt); ctx.globalAlpha=.95; }

    // soft ground shadow
    ctx.fillStyle="rgba(0,0,0,.30)";
    ctx.beginPath(); ctx.ellipse(-2*s,7*s,88*s,13*s,0,0,Math.PI*2); ctx.fill();

    // rear legs, with knees and hooves
    const legData=[
      [-46,-18,-48+stride*6,18,-55+stride*10,50],
      [-20,-17,-19-stride*6,20,-17-stride*8,53],
      [27,-16,30-stride*6,19,38-stride*10,52],
      [49,-16,47+stride*6,19,44+stride*9,49]
    ];
    for(const [x1,y1,kx,ky,hx,hy] of legData){
      ctx.strokeStyle="#3a2b22"; ctx.lineWidth=8*s; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(x1*s,y1*s); ctx.lineTo(kx*s,ky*s); ctx.lineTo(hx*s,hy*s); ctx.stroke();
      ctx.strokeStyle="#171513"; ctx.lineWidth=4*s;
      ctx.beginPath(); ctx.moveTo(hx*s,hy*s); ctx.lineTo((hx+6)*s,(hy+3)*s); ctx.stroke();
    }

    // body coat gradient
    const coat=ctx.createLinearGradient(-70*s,-75*s,72*s,-12*s);
    coat.addColorStop(0,"#3b2a20");
    coat.addColorStop(.28,"#60442f");
    coat.addColorStop(.58,"#7a583c");
    coat.addColorStop(1,"#4a3427");

    ctx.fillStyle=coat;
    ctx.beginPath();
    ctx.moveTo(-70*s,-43*s);
    ctx.bezierCurveTo(-59*s,-74*s,-22*s,-80*s,18*s,-72*s);
    ctx.bezierCurveTo(48*s,-68*s,69*s,-53*s,66*s,-33*s);
    ctx.bezierCurveTo(62*s,-10*s,29*s,-8*s,-6*s,-9*s);
    ctx.bezierCurveTo(-40*s,-10*s,-67*s,-18*s,-70*s,-43*s);
    ctx.closePath(); ctx.fill();

    // subtle fur texture
    ctx.strokeStyle="rgba(230,205,176,.10)"; ctx.lineWidth=1*s;
    for(let i=0;i<18;i++){
      const fx=(-55+i*6)*s, fy=(-52+(i%4)*7)*s;
      ctx.beginPath(); ctx.moveTo(fx,fy); ctx.lineTo(fx+7*s,fy+2*s); ctx.stroke();
    }

    // belly/chest shading
    ctx.fillStyle="rgba(205,184,157,.17)";
    ctx.beginPath(); ctx.ellipse(-7*s,-22*s,46*s,10*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(120,73,47,.24)";
    ctx.beginPath(); ctx.ellipse(34*s,-39*s,24*s,29*s,.12,0,Math.PI*2); ctx.fill();

    // neck with tapered anatomy
    ctx.fillStyle=coat;
    ctx.beginPath();
    ctx.moveTo(39*s,-57*s);
    ctx.bezierCurveTo(47*s,-74*s,50*s,-94*s,58*s,-108*s);
    ctx.lineTo(78*s,-98*s);
    ctx.bezierCurveTo(73*s,-78*s,66*s,-59*s,58*s,-42*s);
    ctx.closePath(); ctx.fill();

    // white throat patch
    ctx.fillStyle="rgba(225,216,199,.36)";
    ctx.beginPath(); ctx.ellipse(61*s,-72*s,7*s,20*s,-.22,0,Math.PI*2); ctx.fill();

    // head + muzzle
    ctx.fillStyle=coat;
    ctx.beginPath(); ctx.ellipse(80*s,-99*s,25*s,15*s,-.10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#493126";
    ctx.beginPath(); ctx.ellipse(102*s,-94*s,12*s,7*s,-.07,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#11100f";
    ctx.beginPath(); ctx.ellipse(109*s,-94*s,4.6*s,3.4*s,0,0,Math.PI*2); ctx.fill();

    // ears with inner ear
    ctx.fillStyle="#60442f";
    ctx.beginPath(); ctx.moveTo(68*s,-111*s); ctx.lineTo(56*s,-134*s); ctx.lineTo(78*s,-116*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#b58b74";
    ctx.beginPath(); ctx.moveTo(67*s,-115*s); ctx.lineTo(60*s,-128*s); ctx.lineTo(73*s,-117*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#5c4030";
    ctx.beginPath(); ctx.moveTo(82*s,-112*s); ctx.lineTo(91*s,-132*s); ctx.lineTo(88*s,-111*s); ctx.closePath(); ctx.fill();

    // eye and brow
    ctx.fillStyle="#090909";
    ctx.beginPath(); ctx.arc(87*s,-102*s,2.7*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.8)";
    ctx.beginPath(); ctx.arc(88*s,-103*s,.7*s,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(35,24,19,.55)"; ctx.lineWidth=2*s;
    ctx.beginPath(); ctx.moveTo(81*s,-106*s); ctx.lineTo(91*s,-107*s); ctx.stroke();

    // white tail with dark outer edge
    ctx.fillStyle="#5a3e2c";
    ctx.beginPath(); ctx.moveTo(-66*s,-56*s); ctx.lineTo(-92*s,-72*s); ctx.lineTo(-76*s,-33*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#d7cab6";
    ctx.beginPath(); ctx.moveTo(-69*s,-55*s); ctx.lineTo(-87*s,-66*s); ctx.lineTo(-75*s,-38*s); ctx.closePath(); ctx.fill();

    // more natural multi-tine antlers on bucks
    if(d.trophy){
      ctx.strokeStyle="#493729"; ctx.lineWidth=3*s; ctx.lineCap="round";
      ctx.beginPath();
      ctx.moveTo(69*s,-110*s); ctx.lineTo(62*s,-128*s); ctx.lineTo(53*s,-143*s); ctx.lineTo(45*s,-155*s);
      ctx.moveTo(58*s,-136*s); ctx.lineTo(61*s,-153*s);
      ctx.moveTo(52*s,-145*s); ctx.lineTo(42*s,-161*s);
      ctx.moveTo(72*s,-110*s); ctx.lineTo(75*s,-130*s); ctx.lineTo(82*s,-146*s); ctx.lineTo(91*s,-157*s);
      ctx.moveTo(77*s,-136*s); ctx.lineTo(90*s,-145*s);
      ctx.moveTo(82*s,-147*s); ctx.lineTo(83*s,-164*s);
      ctx.stroke();
    }

    ctx.restore();
  }

  function particles(){
    for(const p of state.particles){
      ctx.globalAlpha=clamp(p.life/.55,0,1);
      ctx.fillStyle=p.blood?"#5d201d":"#c6b493";
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.blood?3:2,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  function rifle(){
    const r=state.recoil;
    ctx.save();
    ctx.translate(640,738+r*.72);

    // buttstock - shaped walnut with cheek piece
    const wood=ctx.createLinearGradient(-180,-15,120,-95);
    wood.addColorStop(0,"#2a1a12");
    wood.addColorStop(.35,"#5a3824");
    wood.addColorStop(.68,"#7b5133");
    wood.addColorStop(1,"#3a2418");
    ctx.fillStyle=wood;
    ctx.beginPath();
    ctx.moveTo(-178,0); ctx.lineTo(-148,-34); ctx.lineTo(-112,-54); ctx.lineTo(-78,-84);
    ctx.lineTo(-8,-86); ctx.lineTo(40,-68); ctx.lineTo(106,-42); ctx.lineTo(170,0);
    ctx.closePath(); ctx.fill();

    // cheek rest highlight
    ctx.fillStyle="rgba(194,137,89,.18)";
    ctx.beginPath(); ctx.ellipse(-82,-67,52,16,-.18,0,Math.PI*2); ctx.fill();

    // rubber recoil pad
    ctx.fillStyle="#171717"; ctx.fillRect(-184,-34,12,36);

    // pistol grip / wrist
    ctx.fillStyle="#4a2e1f";
    ctx.beginPath(); ctx.moveTo(-28,-73); ctx.lineTo(10,-66); ctx.lineTo(22,-28); ctx.lineTo(-3,-12); ctx.lineTo(-25,-42); ctx.closePath(); ctx.fill();

    // receiver steel
    const steel=ctx.createLinearGradient(-30,-130,30,-70);
    steel.addColorStop(0,"#101112"); steel.addColorStop(.45,"#3a3d3f"); steel.addColorStop(1,"#121314");
    ctx.fillStyle=steel; ctx.fillRect(-31,-133,62,66);
    ctx.fillStyle="#0d0e0f"; ctx.fillRect(-22,-153,44,23);

    // trigger guard and trigger
    ctx.strokeStyle="#111"; ctx.lineWidth=5;
    ctx.beginPath(); ctx.ellipse(17,-48,22,20,0,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle="#8a8b8c"; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(12,-57); ctx.quadraticCurveTo(18,-48,15,-39); ctx.stroke();

    // bolt body and handle
    ctx.fillStyle="#55595b"; ctx.fillRect(24,-116,34,7);
    ctx.strokeStyle="#292b2c"; ctx.lineWidth=7; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(52,-112); ctx.lineTo(69,-98); ctx.lineTo(73,-82); ctx.stroke();
    ctx.fillStyle="#161718"; ctx.beginPath(); ctx.arc(74,-79,6,0,Math.PI*2); ctx.fill();

    // tapered barrel + muzzle
    const barrel=ctx.createLinearGradient(-9,-355,9,-120);
    barrel.addColorStop(0,"#0a0b0b"); barrel.addColorStop(.45,"#343638"); barrel.addColorStop(.7,"#171819"); barrel.addColorStop(1,"#090a0a");
    ctx.fillStyle=barrel;
    ctx.beginPath(); ctx.moveTo(-7,-352); ctx.lineTo(7,-352); ctx.lineTo(10,-150); ctx.lineTo(-10,-150); ctx.closePath(); ctx.fill();
    ctx.fillStyle="#080808"; ctx.beginPath(); ctx.ellipse(0,-352,8,3,0,0,Math.PI*2); ctx.fill();

    // scope body with objective bell and eyepiece
    ctx.fillStyle="#111213"; ctx.fillRect(-63,-181,126,17);
    ctx.beginPath(); ctx.ellipse(-64,-172.5,17,23,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(65,-172.5,20,27,0,0,Math.PI*2); ctx.fill();

    // blue-black glass hints
    ctx.fillStyle="#18252d";
    ctx.beginPath(); ctx.ellipse(-70,-172.5,7,15,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#243642";
    ctx.beginPath(); ctx.ellipse(72,-172.5,8,18,0,0,Math.PI*2); ctx.fill();

    // scope rings and turret
    ctx.fillStyle="#292b2d";
    ctx.fillRect(-39,-170,11,33); ctx.fillRect(27,-170,11,33);
    ctx.fillRect(-8,-195,16,18);
    ctx.fillStyle="#141516"; ctx.beginPath(); ctx.arc(0,-197,8,0,Math.PI*2); ctx.fill();

    // subtle highlights
    ctx.strokeStyle="rgba(255,255,255,.10)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-5,-345); ctx.lineTo(-5,-165); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-50,-177); ctx.lineTo(45,-177); ctx.stroke();

    ctx.restore();

    if(performance.now()<state.muzzleFlashUntil){
      const flash=ctx.createRadialGradient(640,390,0,640,390,180);
      flash.addColorStop(0,"rgba(255,234,176,.18)"); flash.addColorStop(1,"rgba(255,234,176,0)");
      ctx.fillStyle=flash; ctx.fillRect(470,240,340,300);
    }
  }

  function reticle(){
    const x=state.mouse.x;
    const y=state.mouse.y-state.recoil;
    ctx.save();
    ctx.strokeStyle="rgba(15,15,14,.92)";
    ctx.lineWidth=1.2;
    ctx.beginPath();
    ctx.arc(x,y,13,0,Math.PI*2);
    ctx.moveTo(x-40,y); ctx.lineTo(x-8,y);
    ctx.moveTo(x+8,y); ctx.lineTo(x+40,y);
    ctx.moveTo(x,y-40); ctx.lineTo(x,y-8);
    ctx.moveTo(x,y+8); ctx.lineTo(x,y+40);
    ctx.stroke();
    ctx.fillStyle="#111";
    ctx.beginPath();
    ctx.arc(x,y,1.7,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function pause(){
    if(!state.paused) return;
    ctx.fillStyle="rgba(0,0,0,.5)";
    ctx.fillRect(0,0,1280,720);
    ctx.fillStyle="#fff";
    ctx.textAlign="center";
    ctx.font="700 42px system-ui";
    ctx.fillText("PAUSED",640,350);
    ctx.font="18px system-ui";
    ctx.fillText("Press Esc to resume",640,387);
  }

  function frame(now){
    const dt=Math.min(.035,(now-state.last)/1000||0);
    if (!state.last) state.last = now;
    state.last=now;

    if(state.running && !state.paused) update(dt,now);
    background();
    [...state.animals].sort((a,b)=>a.depth-b.depth).forEach(deer);
    particles();
    rifle();
    if (state.running) reticle();
    pause();

    requestAnimationFrame(frame);
  }

  function reset(){
    state.score=0;
    state.harvests=0;
    state.shots=0;
    state.hits=0;
    state.animals=[];
    state.particles=[];
    state.roundOver=false;
    state.paused=false;
    state.lastShotAt=0;
    updateUI();
  }

  function start(){
    reset();
    state.running=true;
    document.querySelector(".game-wrap").classList.add("playing");
    state.last=performance.now();
    state.nextSpawn=state.last+800;
    spawn(true); spawn(true); spawn(true);
    ui.startPanel.classList.add("hidden");
    ui.panelTitle.textContent="Northwoods Hunter";
    ui.panelText.textContent="Move your mouse to aim and left-click to fire. Harvest 5 animals to complete the round.";
    ui.startBtn.textContent="Start Hunt";
  }

  canvas.addEventListener("mousemove",pointer);
  canvas.addEventListener("mousedown",e=>{
    if(e.button===0){ pointer(e); fire(); }
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape" && state.running){
      state.paused=!state.paused;
      msg(state.paused?"Paused":"Hunt resumed");
    }
  });
  ui.startBtn.addEventListener("click",start);

  updateUI();
  document.querySelector(".game-wrap").classList.remove("playing");
  background();
  spawn(true); spawn(true);
  state.animals.forEach(deer);
  rifle();
  requestAnimationFrame(frame);
})();
