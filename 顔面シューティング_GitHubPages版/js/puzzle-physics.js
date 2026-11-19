import Matter from "https://cdn.jsdelivr.net/npm/matter-js@0.20.0/+esm";

const { Engine, Bodies, Body, Composite } = Matter;

export class TsumPhysicsBoard {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = Engine.create({ enableSleeping: false });
    this.engine.gravity.y = 1.18;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 7;
    this.engine.constraintIterations = 2;
    this.balls = [];
    this.images = new Map();
    this.chain = [];
    this.bombs = [];
    this.skillEffects = [];
    this.skillTrail = [];
    this.width = 360;
    this.height = 520;
    this.radius = 25;
    this.running = true;
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedStep = 1000 / 60;
    // 盤面の論理サイズは初回表示時にだけ決定する。
    // スマホのアドレスバー開閉・ピンチズーム・画面UI変化で
    // Matter.jsのワールドやツムの半径が変わらないようにする。
    this.logicalSizeLocked = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.handleWindowResize = () => this.resize();
    window.addEventListener("resize", this.handleWindowResize);
    this.resize();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();

    // 初回だけ画面に収まる論理サイズを決める。
    if (!this.logicalSizeLocked) {
      this.width = Math.max(1, rect.width || 360);
      const isPhone = window.matchMedia("(max-width: 600px)").matches;
      const phoneHeight = Math.floor((window.innerHeight || 700) * 0.42);
      this.height = isPhone
        ? Math.max(250, Math.min(440, this.width * 1.32, phoneHeight))
        : Math.max(380, Math.min(620, this.width * 1.32));
      this.radius = Math.max(17, Math.min(31, this.width / 12.5));
      this.logicalSizeLocked = true;

      // CSS上の幅が変わっても、初回の縦横比を維持する。
      this.canvas.style.aspectRatio = this.width + " / " + this.height;
      this.canvas.style.height = "auto";

      const t = 80;
      this.walls = [
        Bodies.rectangle(this.width / 2, this.height + t / 2 - 3, this.width + t * 2, t, { isStatic: true }),
        Bodies.rectangle(-t / 2 + 2, this.height / 2, t, this.height + t * 2, { isStatic: true }),
        Bodies.rectangle(this.width + t / 2 - 2, this.height / 2, t, this.height + t * 2, { isStatic: true })
      ];
      Composite.add(this.engine.world, this.walls);
    }

    // DPRだけ追従。物理ワールド・ツムの大きさ・壁の位置は変更しない。
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.round(this.width * dpr);
    const backingHeight = Math.round(this.height * dpr);
    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  loadImage(url) {
    if (!url || this.images.has(url)) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => this.images.set(url, img);
    img.onerror = () => this.images.set(url, null);
    img.src = url;
    this.images.set(url, img);
  }

  addBall(face, x = Math.random() * this.width, y = -this.radius * 2) {
    const r = this.radius;
    const body = Bodies.circle(Math.max(r, Math.min(this.width - r, x)), y, r, {
      restitution: 0.22, friction: 0.035, frictionStatic: 0.12,
      frictionAir: 0.006, density: 0.0014, slop: 0.02, label: "face-ball"
    });
    body.plugin.faceId = String(face.id);
    body.plugin.face = face;
    this.loadImage(face.imageUrl || "");
    const ball = { body, face, radius: r };
    this.balls.push(ball);
    Composite.add(this.engine.world, body);
    return ball;
  }

  setFacePool(faces, guaranteedFace = null) {
    this.faces = faces.filter(Boolean);
    this.guaranteedFace = guaranteedFace && this.faces.some(face => String(face.id) === String(guaranteedFace.id))
      ? this.faces.find(face => String(face.id) === String(guaranteedFace.id))
      : this.faces[0] || null;
    this.randomFace = () => this.faces[Math.floor(Math.random() * this.faces.length)];
  }

  seed(faces, count = 70, guaranteedFace = null) {
    this.setFacePool(faces, guaranteedFace);
    this.clear();
    for (let i = 0; i < count; i++) {
      // 最初の1個は必ずマイツム。残りは通常抽選。
      const face = i === 0 && this.guaranteedFace ? this.guaranteedFace : this.randomFace();
      const col = i % 7, row = Math.floor(i / 7);
      const x = (col + 0.5 + (Math.random() - 0.5) * 0.2) * this.width / 7;
      const y = -row * this.radius * 2.05 - Math.random() * this.radius;
      this.addBall(face, x, y);
    }
  }

  clear() {
    for (const ball of this.balls) Composite.remove(this.engine.world, ball.body);
    this.balls.length = 0;
    this.chain = [];
    this.clearBombs();
  }

  setChain(chain) { this.chain = chain.slice(); }

  showSkillEffect(effect = {}) {
    this.skillEffects.push({ ...effect, bornAt: performance.now(), duration: Math.max(250, Number(effect.duration) || 900) });
    if (this.skillEffects.length > 10) this.skillEffects.shift();
  }

  setSkillTrail(points = []) { this.skillTrail = points.slice(-36); }

  createBomb(type, x, y) {
    if (this.bombs.length >= 3) this.bombs.shift();
    const bomb = { id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()), type, x, y, radius: this.radius * 0.92, bornAt: performance.now() };
    this.bombs.push(bomb);
    return bomb;
  }

  hitTestBomb(point) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      if (Math.hypot(point.x - bomb.x, point.y - bomb.y) <= bomb.radius * 1.7) return bomb;
    }
    return null;
  }

  removeBomb(bomb) { this.bombs = this.bombs.filter(item => item !== bomb); }
  clearBombs() { this.bombs.length = 0; }

  hitTest(point, extra = 1.8) {
    let best = null, bestD = Infinity;
    for (const ball of this.balls) {
      const d = Math.hypot(ball.body.position.x - point.x, ball.body.position.y - point.y);
      if (d <= ball.radius * extra && d < bestD) { best = ball; bestD = d; }
    }
    return best;
  }

  hitTestSegment(start, end, extra = 1.8) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const hits = [];
    for (const ball of this.balls) {
      const px = ball.body.position.x - start.x;
      const py = ball.body.position.y - start.y;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
      const nearestX = start.x + dx * t;
      const nearestY = start.y + dy * t;
      const distance = Math.hypot(ball.body.position.x - nearestX, ball.body.position.y - nearestY);
      if (distance <= ball.radius * extra) hits.push({ ball, t, distance });
    }
    hits.sort((a, b) => a.t - b.t || a.distance - b.distance);
    return hits.map(hit => hit.ball);
  }

  neighbors(a, b) {
    return Math.hypot(a.body.position.x - b.body.position.x, a.body.position.y - b.body.position.y)
      <= (a.radius + b.radius) * 1.62;
  }

  removeAndDrop(balls) {
    const removed = new Set(balls);
    for (const ball of removed) {
      Composite.remove(this.engine.world, ball.body);
      this.balls = this.balls.filter(item => item !== ball);
    }
    // 消した数と同じ数だけ補充する。盤面の顔の総数は増やさない。
    // 初期配置と同じく、スマホ42個・PC70個を上限にする。
    const maxBalls = this.width < 480 ? 42 : 70;
    const refillCount = Math.min(balls.length, Math.max(0, maxBalls - this.balls.length));
    for (let i = 0; i < refillCount; i++) {
      // 顔を補充するたび、少なくとも1個は必ずマイツムを落とす。
      const face = i === 0 && this.guaranteedFace ? this.guaranteedFace : this.randomFace();
      const x = (i % 7 + 0.5) * this.width / 7 + (Math.random() - 0.5) * this.radius;
      const y = -this.radius * (2 + Math.floor(i / 7) * 2.15 + Math.random());
      this.addBall(face, x, y);
    }
    this.kickNearby();
  }

  shuffle() {
    if (!this.balls.length || !this.faces?.length) return;

    // 顔の種類をランダムに入れ替える。
    const faces = this.balls.map(() => this.randomFace());
    // シャッフル後もマイツムが盤面から消えないよう最低1個を保証。
    if (faces.length && this.guaranteedFace) faces[0] = this.guaranteedFace;
    for (let i = faces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [faces[i], faces[j]] = [faces[j], faces[i]];
    }

    // 扇風機の風のように、盤面全体へ渦巻く流れを作る。
    // 中心から外へ押し出しつつ、接線方向の速度を与えてぐるっと回す。
    const cx = this.width / 2;
    const cy = this.height * 0.56;
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];
      const face = faces[i];
      ball.face = face;
      ball.body.plugin.faceId = String(face.id);
      ball.body.plugin.face = face;
      this.loadImage(face.imageUrl || "");

      const dx = ball.body.position.x - cx;
      const dy = ball.body.position.y - cy;
      const distance = Math.max(24, Math.hypot(dx, dy));
      const nx = dx / distance;
      const ny = dy / distance;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const tangentX = -ny * direction;
      const tangentY = nx * direction;

      // 既存の落下速度も活かしながら、渦に巻き込まれるように加速。
      const spin = 5.5 + Math.random() * 3.5;
      const outward = 1.2 + Math.random() * 1.8;
      Body.setVelocity(ball.body, {
        x: tangentX * spin + nx * outward,
        y: tangentY * spin + ny * outward - 1.5
      });
      Body.setAngularVelocity(ball.body, direction * (0.18 + Math.random() * 0.24));
      Body.applyForce(ball.body, ball.body.position, {
        x: tangentX * 0.0018 + nx * 0.0008,
        y: tangentY * 0.0018 + ny * 0.0008
      });
    }
  }

  kickNearby() {
    for (const ball of this.balls) {
      Body.applyForce(ball.body, ball.body.position, {
        x: (Math.random() - 0.5) * 0.0018, y: -0.0009
      });
    }
  }

  pointerPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.width / rect.width,
      y: (event.clientY - rect.top) * this.height / rect.height
    };
  }

  frame(time) {
    if (!this.running) return;
    const dt = Math.min(50, time - (this.lastTime || time));
    this.lastTime = time;
    this.accumulator += dt;
    while (this.accumulator >= this.fixedStep) {
      Engine.update(this.engine, this.fixedStep);
      this.accumulator -= this.fixedStep;
    }
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, "#17253a");
    bg.addColorStop(1, "#101827");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // スキルごとの専用エフェクト。軽量なCanvas描画でスマホでも動かす。
    const now = performance.now();
    this.skillEffects = this.skillEffects.filter(effect => now - effect.bornAt < effect.duration);
    for (const effect of this.skillEffects) {
      const progress = Math.max(0, Math.min(1, (now - effect.bornAt) / effect.duration));
      const fade = 1 - progress;
      const cx = Number(effect.x) || this.width / 2;
      const cy = Number(effect.y) || this.height / 2;
      const radius = Math.max(this.radius * 2, Number(effect.radius) || this.width * 0.28);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (effect.type === "light_column" || effect.type === "line_clear") {
        const vertical = effect.type === "light_column";
        ctx.shadowColor = vertical ? "#9af5ff" : "#ffe46f";
        ctx.shadowBlur = 24;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(5, this.radius * (vertical ? 0.62 : 0.5)) * fade;
        ctx.beginPath();
        if (vertical) { ctx.moveTo(cx, -10); ctx.lineTo(cx, this.height + 10); }
        else { ctx.moveTo(-10, cy); ctx.lineTo(this.width + 10, cy); }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = vertical ? "#8ceeff" : "#ffb84d";
        ctx.lineWidth = Math.max(2, this.radius * 0.16);
        ctx.stroke();
      } else if (effect.type === "light_trail") {
        ctx.translate(cx, cy);
        ctx.rotate(-0.18 + progress * 0.36);
        ctx.shadowColor = "#8beeff"; ctx.shadowBlur = 24;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = Math.max(7, this.radius * 0.42) * fade;
        ctx.beginPath(); ctx.moveTo(-this.width * 0.58, this.height * 0.18); ctx.quadraticCurveTo(0, -this.height * 0.2, this.width * 0.58, -this.height * 0.12); ctx.stroke();
        ctx.strokeStyle = "#7eeaff"; ctx.lineWidth = Math.max(3, this.radius * 0.17);
        ctx.beginPath(); ctx.moveTo(-this.width * 0.62, this.height * 0.22); ctx.lineTo(this.width * 0.62, -this.height * 0.22); ctx.stroke();
      } else if (effect.type === "explosion" || effect.type === "screen_clear") {
        const r = radius * (0.25 + progress * 1.15);
        ctx.shadowColor = "#ff8b38"; ctx.shadowBlur = 24;
        ctx.strokeStyle = effect.type === "screen_clear" ? "#fff0a8" : "#ff762e";
        ctx.lineWidth = Math.max(4, this.radius * 0.34) * fade;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#fff7d0"; ctx.lineWidth = 2 + fade * 3;
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const a = i * Math.PI * 2 / 9 + progress * 1.7;
          const d = r * (0.72 + (i % 3) * 0.1);
          ctx.fillStyle = i % 2 ? "#ffb347" : "#fff1a8";
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(2, this.radius * 0.12) * fade, 0, Math.PI * 2); ctx.fill();
        }
        // 炎の舌のような三角形を外側へ伸ばす。
        if (effect.type === "explosion") {
          for (let i = 0; i < 12; i++) {
            const a = i * Math.PI * 2 / 12 + progress * 0.8;
            const px = cx + Math.cos(a) * r * 0.72;
            const py = cy + Math.sin(a) * r * 0.72;
            const tip = r * (0.18 + (i % 3) * 0.035);
            ctx.fillStyle = i % 2 ? "#ff6a2f" : "#ffd05a";
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(a - 0.22) * tip, py + Math.sin(a - 0.22) * tip);
            ctx.lineTo(px + Math.cos(a + 0.22) * tip, py + Math.sin(a + 0.22) * tip);
            ctx.closePath(); ctx.fill();
          }
        }
      } else if (effect.type === "black_hole") {
        ctx.translate(cx, cy); ctx.rotate(progress * 5);
        ctx.shadowColor = "#b48cff"; ctx.shadowBlur = 22;
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i % 2 ? "#6cecff" : "#d5a4ff";
          ctx.lineWidth = Math.max(2, this.radius * 0.12);
          ctx.beginPath(); ctx.ellipse(0, 0, radius * (0.35 + i * 0.2) * (1 - progress * 0.35), radius * (0.14 + i * 0.08), i * 0.9, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = "#15102d"; ctx.beginPath(); ctx.arc(0, 0, radius * 0.18 * (1 - progress * 0.2), 0, Math.PI * 2); ctx.fill();
      } else if (effect.type === "time_stop") {
        ctx.fillStyle = "rgba(70,220,255,.12)"; ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = "#8df5ff"; ctx.shadowColor = "#4beaff"; ctx.shadowBlur = 20;
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, radius * (0.6 + progress * 0.45), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, radius * (0.35 + progress * 0.35), 0, Math.PI * 2); ctx.stroke();
      } else if (effect.type === "power_up") {
        ctx.strokeStyle = "#ffe27b"; ctx.shadowColor = "#fff0a0"; ctx.shadowBlur = 24;
        ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, radius * (0.5 + progress * 0.7), 0, Math.PI * 2); ctx.stroke();
        ctx.font = "900 " + (this.radius * 0.9) + "px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#fff4b8";
        ctx.fillText("RAINBOW", cx, cy - radius * (0.45 + progress * 0.3));
      } else if (effect.type === "defense") {
        ctx.strokeStyle = "#78f4ff"; ctx.shadowColor = "#78f4ff"; ctx.shadowBlur = 20;
        ctx.lineWidth = Math.max(4, this.radius * 0.2);
        ctx.beginPath(); ctx.arc(cx, cy, radius * (0.7 + progress * 0.3), Math.PI * 0.08, Math.PI * 0.92); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, radius * (0.7 + progress * 0.3), Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      } else if (effect.type === "bullet_counter" || effect.type === "orbit_guard") {
        ctx.translate(cx, cy); ctx.rotate(progress * 4);
        ctx.strokeStyle = effect.type === "orbit_guard" ? "#83f7d0" : "#ffe37a";
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 18;
        ctx.lineWidth = Math.max(3, this.radius * 0.18);
        ctx.beginPath(); ctx.arc(0, 0, radius * (0.5 + progress * 0.35), 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * radius * 0.55, Math.sin(a) * radius * 0.55); ctx.lineTo(Math.cos(a) * radius * 0.85, Math.sin(a) * radius * 0.85); ctx.stroke();
        }
      } else if (effect.type === "teleport") {
        ctx.strokeStyle = "#be9aff"; ctx.shadowColor = "#b28cff"; ctx.shadowBlur = 22;
        ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(cx, cy, radius * (0.25 + progress), radius * (0.6 + progress * 0.3), 0, 0, Math.PI * 2); ctx.stroke();
      } else if (effect.type === "homing_volley") {
        ctx.strokeStyle = "#ffb4f4"; ctx.shadowColor = "#ff8ee8"; ctx.shadowBlur = 16;
        ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const a = i * Math.PI * 2 / 7 + progress * 3;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * radius * 0.9, cy + Math.sin(a) * radius * 0.9);
          ctx.lineTo(cx + Math.cos(a) * radius * 0.15, cy + Math.sin(a) * radius * 0.15); ctx.stroke();
        }
      } else if (effect.type === "score_boost") {
        ctx.fillStyle = "#ffe27b"; ctx.shadowColor = "#fff0a0"; ctx.shadowBlur = 18;
        ctx.font = "900 " + (this.radius * 0.8) + "px system-ui"; ctx.textAlign = "center";
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI * 2 / 8 + progress * 2;
          ctx.fillText("★", cx + Math.cos(a) * radius * 0.75, cy + Math.sin(a) * radius * 0.75);
        }
      }
      ctx.restore();
    }

    if (this.skillTrail.length > 1) {
      ctx.save();
      ctx.beginPath();
      this.skillTrail.forEach((point, index) => {
        if (!index) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = "rgba(255,255,255,.96)";
      ctx.lineWidth = Math.max(7, this.radius * 0.3);
      ctx.shadowColor = "#69eaff"; ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.strokeStyle = "#72eaff"; ctx.lineWidth = Math.max(3, this.radius * 0.13); ctx.stroke();
      ctx.restore();
    }

    if (this.chain.length > 1) {
      ctx.save();
      ctx.beginPath();
      this.chain.forEach((ball, index) => {
        const p = ball.body.position;
        if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = "rgba(255,220,115,.92)";
      ctx.lineWidth = this.radius * 0.22;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "#ffd76a";
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.restore();
    }

    // Chain bombs stay visible on the board and can be tapped to detonate.
    for (const bomb of this.bombs) {
      const pulse = 1 + Math.sin(performance.now() / 180) * 0.07;
      const r = bomb.radius * pulse;
      ctx.save(); ctx.translate(bomb.x, bomb.y);
      ctx.shadowColor = bomb.type === "time" ? "#5eeaff" : bomb.type === "star" ? "#ffe36e" : "#ff8a52";
      ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = bomb.type === "time" ? "#176b9b" : bomb.type === "star" ? "#a77b13" : "#a83e36"; ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fff4d0"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "900 " + (r * 1.05) + "px system-ui,sans-serif";
      ctx.fillText(bomb.type === "time" ? "⏱" : bomb.type === "star" ? "★" : "B", 0, 1);
      ctx.restore();
    }

    for (const ball of this.balls) {
      const { x, y } = ball.body.position, r = ball.radius;
      const img = this.images.get(ball.face.imageUrl || "");
      const selected = this.chain.includes(ball);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ball.body.angle);
      ctx.shadowColor = selected ? "#ffda75" : "rgba(0,0,0,.42)";
      ctx.shadowBlur = selected ? 16 : 7;
      ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#ffda75" : "#34445e"; ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.clip();
      if (img?.complete && img.naturalWidth) {
        ctx.drawImage(img, -r * 0.88, -r * 0.88, r * 1.76, r * 1.76);
      } else {
        ctx.fillStyle = "#596d8d"; ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.fillStyle = "#fff"; ctx.font = `bold ${r}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🙂", 0, 1);
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.34, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.65)"; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.handleWindowResize);
    this.clear();
    Engine.clear(this.engine);
  }
}
