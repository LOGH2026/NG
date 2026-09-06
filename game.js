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
    const bob=d.alive?Math.sin(d.gait)*2.2:0;
    const y=d.y+bob;

    ctx.save();
    ctx.translate(d.x,y);
    ctx.scale(d.dir,1);
    if(!d.alive){
      ctx.rotate(d.tilt);
      ctx.globalAlpha=.94;
    }

    // shadow
    ctx.fillStyle="rgba(0,0,0,.26)";
    ctx.beginPath();
    ctx.ellipse(0,5,83*s,12*s,0,0,Math.PI*2);
    ctx.fill();

    const coat=ctx.createLinearGradient(-70*s,-70*s,70*s,-10*s);
    coat.addColorStop(0,"#4b3527");
    coat.addColorStop(.45,"#72513a");
    coat.addColorStop(1,"#3f2d22");

    // rear legs
    ctx.strokeStyle="#32251e";
    ctx.lineCap="round";
    ctx.lineWidth=8*s;
    const phase=Math.sin(d.gait);
    const legs=[
      [-48,-18,-54+phase*8,45],
      [-24,-16,-20-phase*7,48],
      [28,-15,36-phase*8,48],
      [49,-15,44+phase*8,45]
    ];
    for(const [x1,y1,x2,y2] of legs){
      ctx.beginPath();
      ctx.moveTo(x1*s,y1*s);
      ctx.quadraticCurveTo(x2*s,(y1+y2)*.5*s,x2*s,y2*s);
      ctx.stroke();

      ctx.strokeStyle="#161513";
      ctx.lineWidth=3*s;
      ctx.beginPath();
      ctx.moveTo(x2*s,y2*s);
      ctx.lineTo((x2+5)*s,(y2+5)*s);
      ctx.stroke();
      ctx.strokeStyle="#32251e";
      ctx.lineWidth=8*s;
    }

    // belly/chest
    ctx.fillStyle=coat;
    ctx.beginPath();
    ctx.ellipse(-3*s,-41*s,68*s,34*s,-.05,0,Math.PI*2);
    ctx.fill();

    // shoulder musculature
    ctx.fillStyle="rgba(155,110,75,.22)";
    ctx.beginPath();
    ctx.ellipse(31*s,-38*s,23*s,27*s,.1,0,Math.PI*2);
    ctx.fill();

    // belly lighter
    ctx.fillStyle="rgba(205,184,157,.15)";
    ctx.beginPath();
    ctx.ellipse(-4*s,-21*s,44*s,10*s,0,0,Math.PI*2);
    ctx.fill();

    // neck
    ctx.fillStyle=coat;
    ctx.beginPath();
    ctx.moveTo(38*s,-58*s);
    ctx.quadraticCurveTo(50*s,-82*s,55*s,-106*s);
    ctx.lineTo(79*s,-94*s);
    ctx.quadraticCurveTo(67*s,-65*s,58*s,-43*s);
    ctx.closePath();
    ctx.fill();

    // head
    ctx.beginPath();
    ctx.ellipse(79*s,-96*s,25*s,15*s,-.08,0,Math.PI*2);
    ctx.fill();

    // muzzle
    ctx.fillStyle="#2b211b";
    ctx.beginPath();
    ctx.ellipse(101*s,-92*s,11*s,7*s,-.05,0,Math.PI*2);
    ctx.fill();

    // nose
    ctx.fillStyle="#121211";
    ctx.beginPath();
    ctx.ellipse(107*s,-92*s,4*s,3*s,0,0,Math.PI*2);
    ctx.fill();

    // ear
    ctx.fillStyle="#5b402e";
    ctx.beginPath();
    ctx.moveTo(69*s,-110*s);
    ctx.lineTo(58*s,-132*s);
    ctx.lineTo(78*s,-114*s);
    ctx.closePath();
    ctx.fill();

    // white throat
    ctx.fillStyle="rgba(220,210,192,.3)";
    ctx.beginPath();
    ctx.ellipse(60*s,-73*s,7*s,18*s,-.25,0,Math.PI*2);
    ctx.fill();

    // tail
    ctx.fillStyle="#d4c6af";
    ctx.beginPath();
    ctx.moveTo(-66*s,-55*s);
    ctx.lineTo(-91*s,-70*s);
    ctx.lineTo(-75*s,-35*s);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle="#070707";
    ctx.beginPath();
    ctx.arc(86*s,-100*s,2.6*s,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.7)";
    ctx.beginPath();
    ctx.arc(87*s,-101*s,.8*s,0,Math.PI*2);
    ctx.fill();

    // antlers
    if(d.trophy){
      ctx.strokeStyle="#3a2d22";
      ctx.lineCap="round";
      ctx.lineWidth=3*s;
      ctx.beginPath();
      ctx.moveTo(67*s,-108*s);
      ctx.lineTo(60*s,-129*s);
      ctx.lineTo(46*s,-144*s);
      ctx.moveTo(60*s,-129*s);
      ctx.lineTo(65*s,-150*s);
      ctx.moveTo(53*s,-137*s);
      ctx.lineTo(43*s,-157*s);
      ctx.moveTo(72*s,-107*s);
      ctx.lineTo(73*s,-130*s);
      ctx.lineTo(85*s,-147*s);
      ctx.moveTo(75*s,-128*s);
      ctx.lineTo(88*s,-135*s);
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
    ctx.translate(640,734+r*.7);

    // wood stock
    const wood=ctx.createLinearGradient(-130,-10,120,-70);
    wood.addColorStop(0,"#3b2519");
    wood.addColorStop(.5,"#70482e");
    wood.addColorStop(1,"#2d1c14");
    ctx.fillStyle=wood;
    ctx.beginPath();
    ctx.moveTo(-155,0);
    ctx.lineTo(-112,-42);
    ctx.lineTo(-70,-74);
    ctx.lineTo(25,-76);
    ctx.lineTo(88,-43);
    ctx.lineTo(155,0);
    ctx.closePath();
    ctx.fill();

    // receiver
    ctx.fillStyle="#262727";
    ctx.fillRect(-27,-125,54,62);
    ctx.fillStyle="#111";
    ctx.fillRect(-19,-184,38,61);

    // barrel
    const metal=ctx.createLinearGradient(-10,-330,10,-100);
    metal.addColorStop(0,"#101111");
    metal.addColorStop(.5,"#343536");
    metal.addColorStop(1,"#0f1010");
    ctx.fillStyle=metal;
    ctx.fillRect(-8,-345,16,170);

    // scope
    ctx.fillStyle="#111212";
    ctx.fillRect(-58,-170,116,18);
    ctx.beginPath();
    ctx.ellipse(-58,-161,16,22,0,0,Math.PI*2);
    ctx.ellipse(58,-161,18,24,0,0,Math.PI*2);
    ctx.fill();

    // scope mounts
    ctx.fillStyle="#2b2b2b";
    ctx.fillRect(-35,-151,12,25);
    ctx.fillRect(23,-151,12,25);

    // bolt handle
    ctx.strokeStyle="#222";
    ctx.lineWidth=8;
    ctx.beginPath();
    ctx.moveTo(28,-108); ctx.lineTo(55,-94); ctx.lineTo(61,-79);
    ctx.stroke();

    // trigger guard
    ctx.strokeStyle="#1b1b1b";
    ctx.lineWidth=5;
    ctx.beginPath();
    ctx.ellipse(18,-50,22,20,0,0,Math.PI*2);
    ctx.stroke();

    ctx.restore();

    if(performance.now()<state.muzzleFlashUntil){
      ctx.fillStyle="rgba(255,232,174,.13)";
      ctx.fillRect(0,0,1280,720);
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
  background();
  spawn(true); spawn(true);
  state.animals.forEach(deer);
  rifle();
  requestAnimationFrame(frame);
})();
