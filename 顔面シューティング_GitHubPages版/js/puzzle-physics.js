import Matter from "https://cdn.jsdelivr.net/npm/matter-js@0.20.0/+esm";

const { Engine, Bodies, Body, Composite, Events, Vector } = Matter;

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
    this.width = 360;
    this.height = 520;
    this.radius = 25;
    this.running = true;
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedStep = 1000 / 60;
    this.onSettle = options.onSettle || (() => {});
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const oldW = this.width;
    const oldH = this.height;
    this.width = Math.max(280, rect.width || 360);
    this.height = Math.max(380, Math.min(620, this.width * 1.32));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.height = this.height + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.radius = Math.max(17, Math.min(31, this.width / 12.5));
    if (this.walls) Composite.remove(this.engine.world, this.walls);
    const t = 80;
    this.walls = [
      Bodies.rectangle(this.width / 2, this.height + t / 2 - 3, this.width + t * 2, t, { isStatic: true, label: "wall-floor" }),
      Bodies.rectangle(-t / 2 + 2, this.height / 2, t, this.height + t * 2, { isStatic: true, label: "wall-left" }),
      Bodies.rectangle(this.width + t / 2 - 2, this.height / 2, t, this.height + t * 2, { isStatic: true, label: "wall-right" })
    ];
    Composite.add(this.engine.world, this.walls);
    if (this.balls.length && oldW > 0) {
      const sx = this.width / oldW;
      const sy = this.height / oldH;
      for (const ball of this.balls) {
        Body.setPosition(ball.body, { x: Math.max(this.radius, Math.min(this.width - this.radius, ball.body.position.x * sx)), y: Math.min(this.height - this.radius, ball.body.position.y * sy) });
        Body.scale(ball.body, this.radius / ball.radius, this.radius / ball.radius);
        ball.radius = this.radius;
      }
    }
  }

  loadImage(url) {
    if (!url || this.images.has(url)) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { this.images.set(url, img); };
    img.onerror = () => { this.images.set(url, null); };
    img.src = url;
    this.images.set(url, img);
  }

  addBall(face, x = Math.random() * this.width, y = -this.radius * 2) {
    const r = this.radius;
    const body = Bodies.circle(
      Math.max(r, Math.min(this.width - r, x)), y, r,
      { restitution: 0.22, friction: 0.035, frictionStatic: 0.12, frictionAir: 0.006, density: 0.0014, slop: 0.02, label: "face-ball" }
    );
    body.plugin.faceId = String(face.id);
    body.plugin.face = face;
    body.plugin.radius = r;
    const url = face.imageUrl || "";
    this.loadImage(url);
    const ball = { body, face, radius: r, born: performance.now(), wobble: Math.random() * Math.PI * 2 };
    this.balls.push(ball);
    Composite.add(this.engine.world, body);
    return ball;
  }

  seed(faces, count = 38) {
    this.clear();
    for (let i = 0; i < count; i++) {
      const face = faces[Math.floor(Math.random() * faces.length)];
      const col = i % 7;
      const row = Math.floor(i / 7);
      const x = (col + 0.5 + (Math.random() - 0.5) * 0.2) * this.width / 7;
      const y = -row * this.radius * 2.05 - Math.random() * this.radius;
      this.addBall(face, x, y);
    }
  }

  clear() {
    for (const ball of this.balls) Composite.remove(this.engine.world, ball.body);
    this.balls.length = 0;
  }

  hitTest(point, extra = 1.35) {
    let best = null;
    let bestD = Infinity;
    for (const ball of this.balls) {
      const dx = ball.body.position.x - point.x;
      const dy = ball.body.position.y - point.y;
      const d = Math.hypot(dx, dy);
      if (d <= ball.radius * extra && d < bestD) { best = ball; bestD = d; }
    }
    return best;
  }

  neighbors(a, b) {
    const dx = a.body.position.x - b.body.position.x;
    const dy = a.body.position.y - b.body.position.y;
    return Math.hypot(dx, dy) <= (a.radius + b.radius) * 1.42;
  }

  removeAndDrop(balls) {
    const removed = new Set(balls);
    for (const ball of removed) {
      Composite.remove(this.engine.world, ball.body);
      this.balls = this.balls.filter(item => item !== ball);
    }
    for (let i = 0; i < balls.length; i++) {
      const face = this.randomFace || balls[i].face;
      this.addBall(face, Math.random() * this.width, -this.radius * (2 + Math.random() * 5));
    }
    this.kickNearby();
  }

  setFacePool(faces) { this.faces = faces; this.randomFace = () => faces[Math.floor(Math.random() * faces.length)]; }

  shuffle() {
    if (!this.balls.length || !this.faces?.length) return;
    const faces = this.balls.map(() => this.randomFace());
    for (let i = faces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [faces[i], faces[j]] = [faces[j], faces[i]];
    }
    this.balls.forEach((ball, i) => {
      ball.face = faces[i];
      ball.body.plugin.faceId = String(faces[i].id);
      ball.body.plugin.face = faces[i];
      this.loadImage(faces[i].imageUrl || "");
      Body.applyForce(ball.body, ball.body.position, { x: (Math.random() - 0.5) * 0.012, y: -0.008 - Math.random() * 0.009 });
      Body.setAngularVelocity(ball.body, (Math.random() - 0.5) * 0.12);
    });
    this.kickNearby();
  }

  kickNearby() {
    for (const ball of this.balls) {
      Body.applyForce(ball.body, ball.body.position, { x: (Math.random() - 0.5) * 0.0018, y: -0.0009 });
    }
  }

  pointerPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * this.width / rect.width, y: (event.clientY - rect.top) * this.height / rect.height };
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
    this.draw(time);
    this.raf = requestAnimationFrame(this.frame);
  }

  draw(time) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const bg = ctx.createLinearGradient(0, 0, 0, this.height);
    bg.addColorStop(0, "#17253a");
    bg.addColorStop(1, "#101827");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.strokeStyle = "rgba(165,190,220,.10)";
    ctx.lineWidth = 1;
    for (let y = 28; y < this.height; y += 42) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
    }
    ctx.restore();

    for (const ball of this.balls) {
      const { x, y } = ball.body.position;
      const r = ball.radius;
      const img = this.images.get(ball.face.imageUrl || "");
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ball.body.angle);
      ctx.shadowColor = "rgba(0,0,0,.42)";
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.96, 0, Math.PI * 2); ctx.fillStyle = "#34445e"; ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2); ctx.clip();
      if (img?.complete && img.naturalWidth) {
        ctx.drawImage(img, -r * 0.88, -r * 0.88, r * 1.76, r * 1.76);
      } else {
        ctx.fillStyle = "#596d8d"; ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.fillStyle = "#fff"; ctx.font = `bold ${r}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🙂", 0, 1);
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.34, r * 0.22, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,.65)"; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.clear();
    Engine.clear(this.engine);
  }
}
