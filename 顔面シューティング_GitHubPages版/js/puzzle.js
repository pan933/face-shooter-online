import { firebaseReady, auth, db } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { loadFaceData, loadGachaFaces, CLOUDINARY_FACE_URLS, saveFaceData, addMatchPoints } from "./face-system.js";
import { TsumPhysicsBoard } from "./puzzle-physics.js";
import { loadSkill, getRequiredKills } from "./skill-system.js";

const $ = id => document.getElementById(id);
const ROUND_SECONDS = 60;
let physics, uid = "", ownedFaces = [], gameFaces = [], activeFace = null, chain = [];
let points = 0, faceTypeCount = 5, skillModule = null, skillCharge = 0, skillRequired = 20, skillBusy = false;
let score = 0, timeLeft = ROUND_SECONDS, combo = 0;
let running = false, paused = false, roundEnded = false, roundStarting = false, timer = null;
let lastClearAt = 0, shuffleReadyAt = 0, pointerDown = false, previousPointer = null;
let skillMode = null, skillHitBalls = [], skillFreezeUntil = 0, skillFreezeTimer = null;
let skillChargeMultiplier = 1;

let soundContext = null;
function unlockSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!soundContext) soundContext = new AudioCtx();
  if (soundContext.state === "suspended") void soundContext.resume();
}
function playSfx(kind) {
  if (!soundContext || soundContext.state !== "running") return;
  const patterns = {
    chain: [[520, 0, .07], [680, .07, .08]],
    bomb: [[260, 0, .12], [390, .09, .13]],
    time: [[620, 0, .08], [820, .09, .1], [1040, .19, .14]],
    star: [[440, 0, .08], [660, .08, .08], [880, .16, .1], [1180, .26, .18]],
    explode: [[180, 0, .16], [110, .06, .2]],
    skill: [[660, 0, .07], [880, .08, .07], [1120, .16, .14]],
    shuffle: [[360, 0, .06], [520, .08, .06], [420, .16, .12]],
    start: [[440, 0, .08], [660, .1, .16]],
    end: [[660, 0, .12], [440, .13, .2]]
  };
  for (const [frequency, offset, duration] of (patterns[kind] || patterns.chain)) {
    const oscillator = soundContext.createOscillator();
    const gain = soundContext.createGain();
    const at = soundContext.currentTime + offset;
    oscillator.type = kind === "explode" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(.12, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(soundContext.destination);
    oscillator.start(at); oscillator.stop(at + duration + .02);
  }
}

function say(text) { $("message").textContent = text; }
function imageFor(face) { return face.imageUrl || CLOUDINARY_FACE_URLS[face.id] || CLOUDINARY_FACE_URLS.face2 || ""; }
function safeName(face) { return String(face.name || face.id || "顔").slice(0, 32); }
function randomFace() { return gameFaces[Math.floor(Math.random() * gameFaces.length)] || gameFaces[0] || ownedFaces[0]; }
function chooseGameFaces() {
  const selectedMyTsum = activeFace || ownedFaces[0];
  const otherFaces = ownedFaces.filter(face => String(face.id) !== String(selectedMyTsum?.id));
  for (let i = otherFaces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [otherFaces[i], otherFaces[j]] = [otherFaces[j], otherFaces[i]];
  }
  // 先にマイツムを確定枠へ入れてから、残りの種類を抽選する。
  // これなら所持顔が多くても、sliceでマイツムが落ちない。
  const maxTypes = Math.max(1, Math.min(faceTypeCount, ownedFaces.length));
  gameFaces = [selectedMyTsum, ...otherFaces.slice(0, maxTypes - 1)].filter(Boolean);
  physics?.setFacePool(gameFaces, selectedMyTsum);
}
function updateFaceModeUI() {
  $("pointsBalance").textContent = points.toLocaleString();
  $("faceMode").textContent = faceTypeCount + "種類";
  $("buyFour").textContent = faceTypeCount === 4 ? "4種類モード ON（キャンセル）" : "4種類モード OFF（5,000pt/試合）";
  $("buyFour").setAttribute("aria-pressed", faceTypeCount === 4 ? "true" : "false");
  $("buyFour").classList.toggle("is-selected", faceTypeCount === 4);
  $("buyFour").disabled = running;
}
async function buyFourMode() {
  if (running) return;
  if (faceTypeCount === 4) {
    faceTypeCount = 5;
    updateFaceModeUI();
    say("5種類モードに戻しました。");
    return;
  }
  if (points < 5000) {
    say("4種類モードには5,000ポイント必要です。");
    return;
  }
  faceTypeCount = 4;
  updateFaceModeUI();
  say("4種類モードを選択中。ゲーム開始時に5,000ポイントを消費します。");
}
function puzzleSkillHint(type) {
  const hints = {
    screen_clear: "画面全体に光が広がり、最大数のツムを一掃",
    explosion: "炎や星の爆発で周囲のツムを消す",
    black_hole: "渦がツムを吸い込み、まとまった数を消す",
    line_clear: "横一列を貫くビーム",
    laser: "盤面を縦に照らす光の柱",
    slash: "なぞったルート上のツムを光で集めて消す",
    time_stop: "盤面を止める。停止中は残り時間も減らない",
    power_up: "一定時間、違う顔のツムもつなげられる",
    bullet_counter: "雷の反撃でツムをまとめて消す",
    defense: "シールド展開＋時間回復",
    teleport: "ワープで盤面をシャッフルし、時間も回復",
    orbit_guard: "周囲を回る光輪でツムを消す",
    homing_volley: "光弾がツムを追尾して消す",
    score_boost: "得点ボーナス付きの星を降らせる"
  };
  return hints[type] || "顔をまとめて消してスコアを獲得";
}
async function loadMyTsumSkill() {
  const skillId = String(activeFace?.skillId || activeFace?.skill?.skillId || "");
  skillModule = await loadSkill(String(activeFace?.id || ""), skillId);
  const level = Math.max(1, Number(activeFace.skill?.level) || 1);
  // どのツムでもスキル回転率が極端に変わらないよう必要数を統一帯へ補正。
  const rawRequired = skillModule ? getRequiredKills(skillModule, level) : 20;
  skillRequired = Math.max(16, Math.min(22, Math.round(rawRequired * 0.82)));
  skillCharge = 0;
  $("skillTitle").textContent = skillModule?.name || "マイツムスキル";
  $("skillButton").setAttribute("aria-label", skillModule?.name || "マイツムスキル");
  let preview = {};
  try {
    preview = skillModule?.activate({
      skillLevel: level,
      player: { x: 180, y: 280 },
      canvas: { width: 360, height: 520 },
      viewportWidth: 360,
      viewportHeight: 520,
      enemies: []
    }) || {};
  } catch (error) {
    console.warn("[Puzzle] スキル説明の取得に失敗", error);
  }
  const hint = preview.type ? puzzleSkillHint(preview.type) : "マイツムを消してゲージをためよう";
  // スキルが強いツムほど、マイツムを消したときのゲージ増加量を抑える。
  // 強力な全体攻撃は低め、補助系・小規模スキルは高めにして回転率を調整。
  const strongTypes = ["screen_clear", "time_stop", "black_hole", "explosion", "laser", "bullet_counter"];
  const mediumTypes = ["line_clear", "homing_volley", "slash", "teleport", "power_up"];
  const baseRate = strongTypes.includes(preview.type) ? 0.68
    : mediumTypes.includes(preview.type) ? 0.82 : 0.95;
  const levelPenalty = (level - 1) * (strongTypes.includes(preview.type) ? 0.025 : 0.02);
  skillChargeMultiplier = Math.max(0.52, baseRate - levelPenalty);
  $("skillDescription").textContent = hint + "（必要：マイツム" + skillRequired + "個 / Lv." + level + "）";
  updateSkillUI();
}
function updateSkillUI() {
  const percent = Math.min(100, skillCharge / Math.max(1, skillRequired) * 100);
  $("skillButton").style.setProperty("--skill-progress", percent + "%");
  $("skillChargeText").textContent = Math.floor(Math.min(skillCharge, skillRequired)) + " / " + skillRequired;
  $("skillButton").disabled = !running || paused || skillBusy || skillCharge < skillRequired || !skillModule;
}
async function activateMyTsumSkill() {
  if (!running || paused || skillBusy || skillCharge < skillRequired || !skillModule) return;
  skillBusy = true;
  const level = Math.max(1, Number(activeFace?.skill?.level) || 1);
  // 発動後も約半分を持ち越し。強いスキルほど持ち越しを少し少なくする。
  const carryoverRate = Math.max(0.50, Math.min(0.60, 0.38 + skillChargeMultiplier * 0.20));
  skillCharge = skillRequired * carryoverRate;
  updateSkillUI();
  let result = {};
  try {
    result = skillModule.activate({
      skillLevel: level,
      player: { x: physics.width / 2, y: physics.height * 0.58 },
      canvas: { width: physics.width, height: physics.height },
      viewportWidth: physics.width,
      viewportHeight: physics.height,
      enemies: physics.balls
    }) || {};
  } catch (error) {
    console.error("[Puzzle] スキル実行エラー", error);
  }

  const balls = [...physics.balls];
  const type = result.type || "explosion";
  const levelStep = Math.max(0, Math.min(5, level - 1));
  const centerX = Number.isFinite(Number(result.x)) ? Number(result.x) : physics.width / 2;
  const centerY = Number.isFinite(Number(result.y)) ? Number(result.y) : physics.height * 0.56;
  const nearest = (count, x = centerX, y = centerY) => balls
    .map(ball => ({ ball, d: Math.hypot(ball.body.position.x - x, ball.body.position.y - y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(balls.length, count))
    .map(item => item.ball);
  const baseline = 7 + Math.floor(levelStep * 1.2);
  let targets = [];
  let effect = { type, x: centerX, y: centerY, width: physics.width, height: physics.height, duration: 950 };

  // スキルの種類ごとに違う動き・見た目・効果へ変換する。
  if (type === "slash") {
    // 居合斬り：発動後、指でなぞった軌跡をレーザー斬撃にする。
    const maxChain = Math.min(12, 6 + Math.round((level - 1) * 1.2));
    const duration = 3500 + (Math.min(6, level) - 1) * 550;
    skillMode = { type: "trace_link", maxChain, expiresAt: Date.now() + duration };
    skillHitBalls = [];
    physics.setSkillTrail([]);
    effect = { type: "light_trail", x: centerX, y: centerY, duration: 650 };
    physics.showSkillEffect(effect);
    say("✨ 光のルートモード！盤面をなぞると、通ったツムがキラキラ消える！");
  } else if (type === "power_up") {
    // シンデレラ型：一定時間、違う顔同士もつなげられる。
    const maxChain = Math.min(12, 6 + Math.round((level - 1) * 1.2));
    const duration = 3500 + (Math.min(6, level) - 1) * 550;
    skillMode = { type: "rainbow_chain", maxChain, expiresAt: Date.now() + duration };
    physics.showSkillEffect({ type: "power_up", x: centerX, y: centerY, duration: 900 });
    score += 250 + levelStep * 70;
    say("🌈 レインボータイム！Lv." + level + "：最大" + maxChain + "チェーン / " + (duration / 1000).toFixed(1) + "秒");
  } else if (type === "time_stop") {
    // 2秒間だけ盤面を止め、複数チェーンを保留して終了時に周囲ごと一括消去。
    const duration = 2000;
    skillFreezeUntil = Date.now() + duration;
    skillMode = {
      type: "time_stop_chain",
      expiresAt: skillFreezeUntil,
      queuedBalls: new Set(),
      skillLevel: level,
      centerX,
      centerY
    };
    physics.engine.timing.timeScale = 0;
    physics.accumulator = 0;
    physics.setSkillMarkedBalls([]);
    clearTimeout(skillFreezeTimer);
    skillFreezeTimer = window.setTimeout(resolveTimeStopChain, duration);
    effect = { type: "time_stop", x: centerX, y: centerY, duration };
    say("⏱ 時間停止！2秒間にチェーンを仕込もう！");
  } else if (type === "screen_clear") {
    targets = nearest(Math.min(20 + levelStep * 2, balls.length));
    effect = { type: "screen_clear", x: centerX, y: centerY, duration: 1100 };
  } else if (type === "explosion") {
    const radius = Math.max(physics.radius * 3.1, Math.min(physics.width * 0.72, Number(result.radius) || physics.width * (0.28 + levelStep * 0.025)));
    targets = balls.filter(ball => Math.hypot(ball.body.position.x - centerX, ball.body.position.y - centerY) <= radius);
    if (targets.length < 6) targets = nearest(baseline, centerX, centerY);
    targets = targets.slice(0, 12 + levelStep * 2);
    effect = { type: "explosion", x: centerX, y: centerY, radius, duration: 1050 };
  } else if (type === "black_hole") {
    const radius = Math.max(physics.radius * 3.8, Math.min(physics.width * 0.78, Number(result.radius) || physics.width * 0.38));
    targets = balls.filter(ball => Math.hypot(ball.body.position.x - centerX, ball.body.position.y - centerY) <= radius);
    if (targets.length < 7) targets = nearest(baseline + 2, centerX, centerY);
    targets = targets.slice(0, 13 + levelStep * 2);
    effect = { type: "black_hole", x: centerX, y: centerY, radius, duration: 1200 };
  } else if (type === "laser" || type === "line_clear") {
    const vertical = type === "laser";
    const band = Math.max(physics.radius * 2.4, Number(vertical ? result.width : result.height) || physics.radius * 3.4);
    targets = balls.filter(ball => vertical
      ? Math.abs(ball.body.position.x - centerX) <= band / 2
      : Math.abs(ball.body.position.y - centerY) <= band / 2);
    if (targets.length < 6) targets = nearest(baseline, centerX, centerY);
    targets = targets.slice(0, 12 + levelStep * 2);
    effect = { type: vertical ? "light_column" : "line_clear", x: centerX, y: centerY, width: vertical ? band : physics.width, height: vertical ? physics.height : band, duration: 900 };
  } else if (type === "homing_volley") {
    const counts = new Map();
    for (const ball of balls) {
      const id = String(ball.face?.id ?? ball.body?.plugin?.faceId ?? "");
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const targetId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    targets = balls.filter(ball => String(ball.face?.id ?? ball.body?.plugin?.faceId ?? "") === targetId)
      .slice(0, Math.max(baseline, Math.min(14, Number(result.maxTargets) || baseline + 2)));
    if (targets.length < 6) targets = nearest(baseline);
    effect = { type: "homing_volley", x: centerX, y: centerY, duration: 1050 };
  } else if (type === "score_boost") {
    targets = nearest(baseline);
    score += Math.max(450, Number(result.score) || 550);
    effect = { type: "score_boost", x: centerX, y: centerY, duration: 1100 };
  } else if (type === "teleport") {
    physics.shuffle();
    targets = nearest(6 + levelStep);
    timeLeft = Math.min(ROUND_SECONDS + 30, timeLeft + 2);
    effect = { type: "teleport", x: centerX, y: centerY, duration: 1000 };
  } else if (type === "defense") {
    targets = nearest(baseline);
    timeLeft = Math.min(ROUND_SECONDS + 30, timeLeft + Math.min(4, Math.max(2, Math.round(Number(result.heal) || 2))));
    effect = { type: "defense", x: centerX, y: centerY, duration: 1100 };
  } else if (type === "orbit_guard" || type === "bullet_counter") {
    const radius = Math.max(physics.radius * 3.5, Math.min(physics.width * 0.65, Number(result.radius) || physics.width * 0.34));
    targets = balls.filter(ball => {
      const d = Math.hypot(ball.body.position.x - centerX, ball.body.position.y - centerY);
      return type === "orbit_guard" ? d >= radius * 0.35 && d <= radius : d <= radius;
    });
    if (targets.length < 6) targets = nearest(baseline + 1);
    if (type === "bullet_counter") timeLeft = Math.min(ROUND_SECONDS + 30, timeLeft + 1);
    effect = { type, x: centerX, y: centerY, radius, duration: 1000 };
  } else {
    targets = nearest(baseline);
    effect = { type: "explosion", x: centerX, y: centerY, duration: 900 };
  }

  if (type !== "slash" && type !== "power_up") physics.showSkillEffect(effect);
  playSfx("skill");
  if (targets.length) clearBalls(targets, "skill");
  else if (type !== "slash" && type !== "power_up") {
    score += 300;
    say((skillModule.name || "スキル") + " 発動！追加ボーナス +300点！");
  }
  score += Math.max(0, Number(result.scoreBonus) || 0);
  updateHud();
  skillBusy = false;
  updateSkillUI();
}
function updateHud() {
  $("score").textContent = score.toLocaleString();
  $("time").textContent = String(timeLeft);
  $("combo").textContent = String(combo);
  updateSkillUI();
  $("shuffle").disabled = !running || paused || performance.now() < shuffleReadyAt;
  $("shuffleCooldown").textContent = performance.now() < shuffleReadyAt
    ? Math.ceil((shuffleReadyAt - performance.now()) / 1000) + "秒"
    : "いつでもOK";
}
function setChain(next) {
  chain = next;
  physics?.setChain(chain);
  if (next.length) $("chainCount").textContent = String(next.length);
}
function showChainPopup(count) {
  const popup = $("chainPopup");
  if (!popup || count < 3) return;
  const reactions = count >= 12
    ? ["神チェーンwww", "うますぎwww", "バカ強いwww"]
    : count >= 10
      ? ["やばwww", "天才か？", "バカwww"]
      : count >= 7
        ? ["いいねwww", "うまっ！", "www"]
        : ["ナイス！", "www", "いい感じ！"];
  const reaction = reactions[Math.floor(Math.random() * reactions.length)];
  popup.innerHTML = '<span class="chainPopupText">' + reaction + '</span><small>' + count + 'チェーン！</small>';
  popup.classList.remove("show");
  void popup.offsetWidth;
  popup.classList.add("show");
}
function tryAddBall(ball) {
  if (!pointerDown || !ball || chain.includes(ball)) return;
  if (!chain.length) {
    setChain([ball]);
    return;
  }
  const first = chain[0], last = chain[chain.length - 1];
  if (ball === first && chain.length > 1) {
    setChain(chain.slice(0, -1));
    return;
  }
  const rainbowActive = skillMode?.type === "rainbow_chain" && Date.now() < skillMode.expiresAt;
  const specialChainActive = (rainbowActive || (skillMode?.type === "trace_link" && Date.now() < skillMode.expiresAt));
  const chainLimit = specialChainActive ? Math.min(12, Number(skillMode.maxChain) || 12) : Infinity;
  if (chain.length >= chainLimit) return;
  if ((!rainbowActive && ball.face.id !== first.face.id) || !physics.neighbors(last, ball)) return;
  setChain([...chain, ball]);
}
function resolveTimeStopChain() {
  if (skillMode?.type !== "time_stop_chain") return;
  const mode = skillMode;
  skillMode = null;
  skillFreezeUntil = 0;
  skillFreezeTimer = null;
  if (physics?.engine) physics.engine.timing.timeScale = 1;
  if (!running || roundEnded) {
    physics?.setSkillMarkedBalls([]);
    return;
  }
  const selected = [...mode.queuedBalls].filter(ball => physics.balls.includes(ball));
  const radius = physics.radius * (2.25 + Math.min(6, Math.max(1, mode.skillLevel) - 1) * 0.22);
  const affected = new Set(selected);
  for (const center of selected) {
    for (const ball of physics.balls) {
      if (Math.hypot(ball.body.position.x - center.body.position.x, ball.body.position.y - center.body.position.y) <= radius) {
        affected.add(ball);
      }
    }
  }
  physics.setSkillMarkedBalls([]);
  physics.showSkillEffect({
    type: "time_stop_burst",
    x: mode.centerX,
    y: mode.centerY,
    radius: Math.max(radius, physics.radius * 3),
    duration: 850
  });
  setChain([]);
  if (affected.size) {
    playSfx("explode");
    clearBalls([...affected], "skill");
    say("⏱ 時間解放！保留したチェーンと周囲" + affected.size + "個を一斉消去！");
  } else {
    say("時間停止終了！チェーンを3個以上つなぐと消去できるよ。");
  }
  updateHud();
}

function finishChain() {
  if (!pointerDown) return;
  pointerDown = false;
  previousPointer = null;

  if (skillMode?.type === "time_stop_chain" && Date.now() < skillMode.expiresAt) {
    const selected = [...new Set(chain)];
    setChain([]);
    if (selected.length >= 3) {
      for (const ball of selected) skillMode.queuedBalls.add(ball);
      physics.setSkillMarkedBalls([...skillMode.queuedBalls]);
      say("⏱ " + skillMode.queuedBalls.size + "個を保留中！続けて別のチェーンも作れるよ！");
    } else if (selected.length) {
      say("3個以上つなげると保留できるよ！");
    }
    return;
  }

  if (skillMode?.type === "trace_link" && Date.now() < skillMode.expiresAt) {
    const sliced = [...new Set(skillHitBalls)].slice(0, Math.min(12, Number(skillMode.maxChain) || 12));
    skillHitBalls = [];
    physics.setSkillTrail([]);
    if (sliced.length) {
      physics.showSkillEffect({ type: "light_trail", x: physics.width / 2, y: physics.height / 2, duration: 520 });
      clearBalls(sliced, "skill");
      playSfx("skill");
      say("✨ 光のルート！ " + sliced.length + "個のツムを消去！");
    } else {
      say("⚔ なぞった場所にツムがなかったよ。もう一度なぞって！");
    }
    return;
  }

  const selected = chain.slice();
  setChain([]);
  if (selected.length < 3) {
    if (selected.length) say("同じ顔を3個以上つなげてね！");
    return;
  }
  const center = selected.reduce((point, ball) => ({
    x: point.x + ball.body.position.x / selected.length,
    y: point.y + ball.body.position.y / selected.length
  }), { x: 0, y: 0 });
  let bombType = null;
  if (selected.length >= 13) bombType = "star";
  else if (selected.length >= 10) bombType = "time";
  else if (selected.length >= 7) bombType = "normal";
  if (bombType) { physics.createBomb(bombType, center.x, center.y); playSfx(bombType === "time" ? "time" : bombType === "star" ? "star" : "bomb"); }
  else playSfx("chain");
  clearBalls(selected, "chain");
  if (bombType) say((bombType === "time" ? "⏱ タイムボム！" : bombType === "star" ? "🌟 スターボム！" : "💣 ボム！") + " タップして爆発させよう！");
}
function activateBomb(bomb) {
  if (!running || paused || !bomb) return;
  const radius = bomb.type === "star" ? physics.radius * 5.2 : bomb.type === "time" ? physics.radius * 3.8 : physics.radius * 4.3;
  const targets = physics.balls.filter(ball => Math.hypot(ball.body.position.x - bomb.x, ball.body.position.y - bomb.y) <= radius);
  physics.removeBomb(bomb);
  playSfx("explode");
  if (bomb.type === "time") { timeLeft = Math.min(ROUND_SECONDS + 30, timeLeft + 3); score += 300; }
  else if (bomb.type === "star") score += 500;
  else score += 150;
  if (targets.length) clearBalls(targets, "bomb");
  updateHud();
  say(bomb.type === "time" ? "⏱ タイムボム！残り時間 +3秒！" : bomb.type === "star" ? "🌟 スターボム！広範囲を消去！" : "💣 ボム！周りの顔を消去！");
}

function clearBalls(balls, source = "chain") {
  if (!running || paused || !balls.length) return;
  const now = Date.now();
  combo = now - lastClearAt < 2400 ? combo + 1 : 1;
  lastClearAt = now;
  const n = balls.length;
  if (source === "chain") showChainPopup(n);
  // 物理演算で顔データの参照が入れ替わっても、保存されたfaceIdでマイツムを判定する。
  const activeId = String(activeFace?.id ?? "");
  const myTsumCount = balls.filter(ball =>
    String(ball.face?.id ?? ball.body?.plugin?.faceId ?? "") === activeId
  ).length;
  // マイツムを消した数だけゲージ加算。スキルで消した分は再充填対象外。
  if (source !== "skill" && activeId && myTsumCount > 0) {
    skillCharge = Math.min(skillRequired, skillCharge + myTsumCount * skillChargeMultiplier);
  }
  const chainBonus = source === "chain" && n >= 3 ? Math.max(0, n - 3) * 35 : 0;
  const gained = Math.round(n * n * 12 * Math.min(combo, 6)) + chainBonus;
  score += gained;
  physics.removeAndDrop(balls);
  updateHud();
  updateSkillUI();
  say(source === "skill" ? "🌟 " + (skillModule?.name || "マイツムスキル") + " 発動！"
    : n + "個つなげた！ +" + gained.toLocaleString() + "点" + (combo > 1 ? " / " + combo + "コンボ" : ""));
}
async function startRound() {
  if (running || roundStarting) return;
  roundStarting = true;
  $("start").disabled = true;
  if (faceTypeCount === 4) {
    const ref = doc(db, "users", uid);
    try {
      const purchase = await runTransaction(db, async transaction => {
        const snap = await transaction.get(ref);
        const current = Math.max(0, Number(snap.exists() ? snap.data().points : 0) || 0);
        if (current < 5000) return { ok: false, points: current };
        const next = current - 5000;
        transaction.set(ref, { points: next, updatedAt: serverTimestamp() }, { merge: true });
        return { ok: true, points: next };
      });
      points = purchase.points;
      updateFaceModeUI();
      if (!purchase.ok) { roundStarting = false; $("start").disabled = false; updateFaceModeUI(); say("ポイント不足です。4種類モードはONのままです。5,000ポイント以上にして再挑戦してね。"); return; }
    } catch (error) {
      console.error("[Puzzle] 4種類モード購入失敗", error);
      roundStarting = false;
      $("start").disabled = false;
      say("購入に失敗しました。通信状態を確認してください。");
      return;
    }
  }
  roundStarting = false;
  clearInterval(timer);
  if (physics?.engine) physics.engine.timing.timeScale = 1;
  clearTimeout(skillFreezeTimer); skillFreezeTimer = null; skillFreezeUntil = 0;
  skillMode = null; skillHitBalls = []; physics?.setSkillTrail([]); physics?.setSkillMarkedBalls([]);
  score = 0; timeLeft = ROUND_SECONDS; combo = 0;
  $("chainCount").textContent = "0";
  $("chainPopup").classList.remove("show");
  lastClearAt = 0; roundEnded = false; running = true; paused = false;
  pointerDown = false; previousPointer = null; setChain([]);
  physics?.clearBombs();
  skillCharge = 0; skillBusy = false;
  chooseGameFaces();
  physics.seed(gameFaces, physics.width < 480 ? 42 : 70, activeFace);
  $("result").classList.add("hidden");
  $("start").disabled = true; $("start").textContent = "プレイ中";
  $("faceSelect").disabled = true;
  updateFaceModeUI();
  updateSkillUI();
  $("pause").disabled = false; $("pause").textContent = "⏸ 一時停止";
  $("shuffle").disabled = false;
  updateHud();
  unlockSound();
  playSfx("start");
  say("スタート！顔をなぞって3個以上つなげよう！");
  timer = setInterval(() => {
    if (!running || paused) return;
    // 時間停止スキルの間は残り時間を減らさない。
    if (Date.now() < skillFreezeUntil) return;
    if (skillMode?.type !== "time_stop_chain" && skillMode && Date.now() >= skillMode.expiresAt) {
      const endedMode = skillMode.type;
      skillMode = null;
      skillHitBalls = [];
      physics.setSkillTrail([]);
      say(endedMode === "trace_link" ? "光のルートモード終了！" : "レインボータイム終了！");
    }
    timeLeft--;
    updateHud();
    if (timeLeft <= 0) showResult();
  }, 1000);
}
function showResult() {
  if (roundEnded) return;
  roundEnded = true; running = false; paused = false;
  if (physics?.engine) physics.engine.timing.timeScale = 1;
  clearTimeout(skillFreezeTimer); skillFreezeTimer = null; skillFreezeUntil = 0;
  skillMode = null; skillHitBalls = []; physics?.setSkillTrail([]); physics?.setSkillMarkedBalls([]);
  playSfx("end");
  clearInterval(timer); timer = null;
  $("start").disabled = false; $("start").textContent = "▶ もう一度";
  $("faceSelect").disabled = false;
  updateFaceModeUI();
  $("pause").disabled = true; $("shuffle").disabled = true;
  const earned = Math.floor(score / 1000);
  $("resultText").textContent = "スコア：" + score.toLocaleString() + "点 / " + combo + "コンボ。ポイント " + earned + " を獲得しました。";
  $("result").classList.remove("hidden");
  if (earned > 0) void addMatchPoints(uid, earned).then(result => {
    if (!result?.success) { say("ポイントの保存に失敗しました。"); return; }
    points = Math.max(0, Number(result.points) || points);
    updateFaceModeUI();
  }).catch(error => { console.error(error); say("ポイントの保存に失敗しました。"); });
}
function returnToReady() {
  clearInterval(timer); timer = null;
  if (physics?.engine) physics.engine.timing.timeScale = 1;
  clearTimeout(skillFreezeTimer); skillFreezeTimer = null; skillFreezeUntil = 0;
  skillMode = null; skillHitBalls = []; physics?.setSkillTrail([]); physics?.setSkillMarkedBalls([]);
  running = false; paused = false; roundEnded = false; roundStarting = false;
  pointerDown = false; previousPointer = null; setChain([]);
  skillBusy = false; skillCharge = 0;
  physics?.clearBombs();
  score = 0; timeLeft = ROUND_SECONDS; combo = 0;
  $("chainCount").textContent = "0";
  $("chainPopup").classList.remove("show");
  $("result").classList.add("hidden");
  $("faceSelect").disabled = false;
  $("start").disabled = false; $("start").textContent = "▶ ゲーム開始";
  $("pause").disabled = true; $("pause").textContent = "⏸ 一時停止";
  $("shuffle").disabled = true;
  if (physics) physics.seed(gameFaces, physics.width < 480 ? 42 : 70, activeFace);
  updateFaceModeUI();
  updateHud();
  updateSkillUI();
  say("ゲーム開始前の準備画面に戻りました。");
}
function shuffleBoard() {
  if (!running || paused || performance.now() < shuffleReadyAt) return;
  physics.shuffle();
  playSfx("shuffle");
  shuffleReadyAt = performance.now() + 5000;
  setChain([]);
  updateHud();
  say("シャッフル！顔の配置を入れ替えて、ボールをかき混ぜた！");
}
async function selectFace(id) {
  const face = ownedFaces.find(item => item.id === id);
  if (!face) return;
  activeFace = face;
  $("leaderName").textContent = safeName(face);
  $("leaderSkill").textContent = "マイツム / スキル Lv." + Math.max(1, Number(face.skill?.level) || 1) + " / 所持顔 " + ownedFaces.length + "体";
  await loadMyTsumSkill();
  $("skillFace").src = imageFor(face);
  $("skillFace").onerror = () => { $("skillFace").src = ""; };
  const img = $("leaderFace");
  img.hidden = false; $("leaderFallback").hidden = true;
  img.onerror = () => { img.hidden = true; $("leaderFallback").hidden = false; };
  img.src = imageFor(face);
  if (uid) {
    try { await saveFaceData(uid, { selectedFace: id }); }
    catch (error) { console.warn(error); say("顔の選択保存に失敗しました。"); }
  }
}
function populateFaces(faces) {
  const select = $("faceSelect");
  select.replaceChildren();
  for (const face of faces) {
    const option = document.createElement("option");
    option.value = face.id; option.textContent = safeName(face); select.append(option);
  }
  select.disabled = faces.length === 0;
}
async function initialize() {
  if (!firebaseReady || !auth || !db) throw new Error("Firebase is not configured");
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) { window.location.replace("./login.html?returnTo=puzzle.html"); return; }
  uid = user.uid;
  const profile = await getDoc(doc(db, "profiles", uid));
  const profileName = profile.exists()
    ? String(profile.data().displayName || profile.data().username || "プレイヤー")
    : "プレイヤー";
  const data = await loadFaceData(uid);
  const catalog = await loadGachaFaces();
  const catalogMap = new Map((catalog || []).map(face => [String(face.id), face]));
  const actual = (data.faces || []).map(face => ({
    ...catalogMap.get(String(face.id)), ...face, id: String(face.id),
    skill: face.skill || { level: 1 }
  }));
  ownedFaces = actual.length ? actual : [{
    id: "face2", name: "初期顔", imageUrl: CLOUDINARY_FACE_URLS.face2, skill: { level: 1 }
  }];
  if (ownedFaces.length < 5) {
    for (const face of catalog || []) {
      if (ownedFaces.length >= 5) break;
      if (!ownedFaces.some(item => item.id === String(face.id))) {
        ownedFaces.push({ ...face, id: String(face.id), skill: face.skill || { level: 1 }, catalogOnly: true });
      }
    }
  }
  points = Math.max(0, Number(data.points) || 0);
  faceTypeCount = 5;
  updateFaceModeUI();
  const selectedId = String(data.selectedFace || ownedFaces[0].id);
  activeFace = ownedFaces.find(face => face.id === selectedId) || ownedFaces[0];
  populateFaces(actual.length ? actual : ownedFaces.slice(0, 1));
  $("faceSelect").value = activeFace.id;
  $("leaderName").textContent = safeName(activeFace);
  $("leaderSkill").textContent = "マイツム：" + profileName + " / スキル Lv." + Math.max(1, Number(activeFace.skill?.level) || 1);
  const img = $("leaderFace");
  img.src = imageFor(activeFace);
  img.onerror = () => { img.hidden = true; $("leaderFallback").hidden = false; };
  await loadMyTsumSkill();
  $("skillFace").src = imageFor(activeFace);
  physics = new TsumPhysicsBoard($("boardCanvas"));
  chooseGameFaces();
  physics.seed(gameFaces, physics.width < 480 ? 42 : 70);
  $("start").disabled = false;
  say("準備完了！ボールが重力で落ちて積み重なるよ。");
}

$("boardCanvas").addEventListener("pointerdown", event => {
  if (!running || paused) return;
  event.preventDefault();
  unlockSound();
  $("boardCanvas").setPointerCapture?.(event.pointerId);
  previousPointer = physics.pointerPoint(event);
  const bomb = physics.hitTestBomb(previousPointer);
  if (bomb) { pointerDown = false; activateBomb(bomb); return; }
  pointerDown = true;
  setChain([]);
  if (skillMode?.type === "trace_link" && Date.now() < skillMode.expiresAt) {
    skillHitBalls = [];
    const firstHit = physics.hitTest(previousPointer, 2.0);
    if (firstHit) skillHitBalls.push(firstHit);
    physics.setSkillTrail([previousPointer]);
  } else {
    const ball = physics.hitTest(previousPointer, 1.85);
    tryAddBall(ball);
  }
});
$("boardCanvas").addEventListener("pointermove", event => {
  if (!pointerDown || !running || paused) return;
  const currentPointer = physics.pointerPoint(event);
  const crossed = physics.hitTestSegment(previousPointer || currentPointer, currentPointer, 1.9);
  if (skillMode?.type === "trace_link" && Date.now() < skillMode.expiresAt) {
    const limit = Math.min(12, Number(skillMode.maxChain) || 12);
    for (const ball of crossed) {
      if (skillHitBalls.length >= limit) break;
      if (!skillHitBalls.includes(ball)) skillHitBalls.push(ball);
    }
    physics.setSkillTrail([...(physics.skillTrail || []), currentPointer].slice(-36));
  } else {
    for (const ball of crossed) tryAddBall(ball);
  }
  previousPointer = currentPointer;
});
$("boardCanvas").addEventListener("pointerup", finishChain);
$("boardCanvas").addEventListener("pointercancel", finishChain);
$("start").addEventListener("click", startRound);
$("shuffle").addEventListener("click", shuffleBoard);
$("buyFour").addEventListener("click", buyFourMode);
$("skillButton").addEventListener("click", activateMyTsumSkill);
$("pause").addEventListener("click", () => {
  if (!running) return;
  paused = !paused;
  unlockSound();
  $("pause").textContent = paused ? "▶ 再開" : "⏸ 一時停止";
  if (!paused) playSfx("start");
  say(paused ? "一時停止中" : "再開！");
});
$("faceSelect").addEventListener("change", event => void selectFace(event.target.value));
$("again").addEventListener("click", () => { $("result").classList.add("hidden"); startRound(); });
$("readyBack").addEventListener("click", returnToReady);
$("back").addEventListener("click", () => { window.location.href = "./game.html"; });
$("logout").addEventListener("click", async () => {
  if (auth) await signOut(auth);
  window.location.href = "./login.html";
});
setInterval(() => { if (running && !paused) updateHud(); }, 250);
window.addEventListener("pagehide", () => { clearInterval(timer); physics?.destroy(); });
void initialize().catch(error => {
  console.error("[Puzzle] 初期化失敗", error);
  say("読み込みに失敗しました。通信状態を確認して再読み込みしてください。");
});
