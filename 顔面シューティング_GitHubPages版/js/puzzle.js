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
    screen_clear: "盤面の顔をまとめて一掃する",
    explosion: "指定範囲の顔をまとめて消す",
    black_hole: "中央付近の顔を吸い込むように消す",
    line_clear: "横一列に近い範囲の顔を消す",
    laser: "横方向のライン上の顔を消す",
    slash: "横切る斬撃で顔をまとめて消す",
    time_stop: "盤面を一時停止し、中央の顔を消す",
    power_up: "顔を追加で消してスコアボーナス",
    bullet_counter: "お助け効果で中央付近の顔を消す",
    defense: "少し時間を回復して顔を消す",
    teleport: "盤面中央を整理して時間を回復",
    orbit_guard: "周囲を整理して時間を回復",
    homing_volley: "盤面で最も多い顔をまとめて消す",
    score_boost: "顔を消して追加スコアを獲得"
  };
  return hints[type] || "顔をまとめて消してスコアを獲得";
}
async function loadMyTsumSkill() {
  const skillId = String(activeFace?.skillId || activeFace?.skill?.skillId || "");
  skillModule = await loadSkill(String(activeFace?.id || ""), skillId);
  const level = Math.max(1, Number(activeFace.skill?.level) || 1);
  skillRequired = skillModule ? getRequiredKills(skillModule, level) : 20;
  skillCharge = 0;
  $("skillButton").textContent = "✨ " + (skillModule?.name || "マイツムスキル");
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
  $("skillDescription").textContent = hint + "（必要：マイツム" + skillRequired + "個 / Lv." + level + "）";
  updateSkillUI();
}
function updateSkillUI() {
  const percent = Math.min(100, skillCharge / Math.max(1, skillRequired) * 100);
  $("skillFill").style.width = percent + "%";
  $("skillChargeText").textContent = Math.min(skillCharge, skillRequired) + " / " + skillRequired;
  $("skillButton").disabled = !running || paused || skillBusy || skillCharge < skillRequired || !skillModule;
}
async function activateMyTsumSkill() {
  if (!running || paused || skillBusy || skillCharge < skillRequired || !skillModule) return;
  skillBusy = true;
  skillCharge = 0;
  updateSkillUI();
  const level = Math.max(1, Number(activeFace?.skill?.level) || 1);
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
  const levelBonus = Math.max(0, level - 1);
  const centerX = Number.isFinite(Number(result.x)) ? Number(result.x) : physics.width / 2;
  const centerY = Number.isFinite(Number(result.y)) ? Number(result.y) : physics.height * 0.56;
  const radius = Math.max(physics.radius * 2.5, Number(result.radius) || physics.width * (0.24 + levelBonus * 0.025));
  let targets = [];
  const nearest = (count, x = centerX, y = centerY) => balls
    .map(ball => ({ ball, d: Math.hypot(ball.body.position.x - x, ball.body.position.y - y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.min(balls.length, count))
    .map(item => item.ball);

  // 顔面ツム専用の効果へ変換。弾・HP・敵などのシューティング要素には依存しない。
  if (type === "screen_clear") {
    targets = balls;
  } else if (type === "explosion" || type === "black_hole") {
    targets = balls.filter(ball => Math.hypot(ball.body.position.x - centerX, ball.body.position.y - centerY) <= radius);
    if (targets.length < 4) targets = nearest(6 + levelBonus * 2, centerX, centerY);
  } else if (type === "line_clear" || type === "laser" || type === "slash") {
    const halfHeight = Math.max(physics.radius * 1.8, (Number(result.height) || physics.height * (0.24 + levelBonus * 0.025)) / 2);
    const halfWidth = Math.max(physics.width * 0.28, (Number(result.width) || physics.width) / 2);
    targets = balls.filter(ball =>
      Math.abs(ball.body.position.y - centerY) <= halfHeight &&
      Math.abs(ball.body.position.x - centerX) <= halfWidth
    );
    const maxTargets = Number(result.maxTargets) || (10 + levelBonus * 2);
    targets = targets.slice(0, maxTargets);
    if (targets.length < 3) targets = nearest(6 + levelBonus * 2);
  } else if (type === "time_stop") {
    // 盤面の動きを短時間止めて、中央を整理する。
    physics.engine.timing.timeScale = 0;
    window.setTimeout(() => {
      if (physics?.engine) physics.engine.timing.timeScale = 1;
    }, Math.max(500, Math.min(4000, (Number(result.duration || result.stopDuration) || 1.5) * 1000)));
    targets = nearest(6 + levelBonus * 2);
  } else if (type === "power_up") {
    targets = nearest(8 + levelBonus * 2);
    score += Math.round(250 * (Number(result.damageMultiplier) || 1));
  } else if (type === "homing_volley") {
    const counts = new Map();
    for (const ball of balls) {
      const id = String(ball.face?.id ?? ball.body?.plugin?.faceId ?? "");
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const targetId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    targets = balls.filter(ball => String(ball.face?.id ?? ball.body?.plugin?.faceId ?? "") === targetId)
      .slice(0, Math.max(6, Number(result.maxTargets) || 10) + levelBonus * 2);
  } else if (type === "score_boost") {
    targets = nearest(5 + levelBonus);
    score += Math.max(300, Number(result.score) || 500);
  } else if (type === "defense" || type === "teleport" || type === "orbit_guard" || type === "bullet_counter") {
    // シューティング側の防御・弾消しを、ツムでは盤面整理＋時間回復に置き換える。
    targets = nearest(7 + levelBonus * 2);
    timeLeft = Math.min(ROUND_SECONDS + 30, timeLeft + Math.max(1, Math.round(Number(result.heal) || 2)));
  } else {
    targets = nearest(7 + levelBonus * 2);
  }

  playSfx("skill");
  if (targets.length) clearBalls(targets, "skill");
  else say((skillModule.name || "スキル") + " 発動！対象の顔が少なかったためスコアボーナスを付与！");
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
  popup.textContent = count + "チェーン！";
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
  if (ball.face.id !== first.face.id || !physics.neighbors(last, ball)) return;
  setChain([...chain, ball]);
}
function finishChain() {
  if (!pointerDown) return;
  pointerDown = false;
  previousPointer = null;
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
    skillCharge = Math.min(skillRequired, skillCharge + myTsumCount);
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
    timeLeft--;
    updateHud();
    if (timeLeft <= 0) showResult();
  }, 1000);
}
function showResult() {
  if (roundEnded) return;
  roundEnded = true; running = false; paused = false;
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
  const ball = physics.hitTest(previousPointer, 1.85);
  tryAddBall(ball);
});
$("boardCanvas").addEventListener("pointermove", event => {
  if (!pointerDown || !running || paused) return;
  const currentPointer = physics.pointerPoint(event);
  const crossed = physics.hitTestSegment(previousPointer || currentPointer, currentPointer, 1.9);
  for (const ball of crossed) tryAddBall(ball);
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
