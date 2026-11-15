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
let score = 0, timeLeft = ROUND_SECONDS, combo = 0, fever = 0;
let running = false, paused = false, roundEnded = false, roundStarting = false, timer = null;
let lastClearAt = 0, shuffleReadyAt = 0, pointerDown = false;

function say(text) { $("message").textContent = text; }
function imageFor(face) { return face.imageUrl || CLOUDINARY_FACE_URLS[face.id] || CLOUDINARY_FACE_URLS.face2 || ""; }
function safeName(face) { return String(face.name || face.id || "顔").slice(0, 32); }
function randomFace() { return gameFaces[Math.floor(Math.random() * gameFaces.length)] || gameFaces[0] || ownedFaces[0]; }
function chooseGameFaces() {
  const pool = ownedFaces.filter(face => face.id !== activeFace?.id);
  pool.unshift(activeFace || ownedFaces[0]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  gameFaces = pool.slice(0, Math.min(faceTypeCount, pool.length));
  physics?.setFacePool(gameFaces);
}
function updateFaceModeUI() {
  $("pointsBalance").textContent = points.toLocaleString();
  $("faceMode").textContent = faceTypeCount + "種類";
  $("buyFour").textContent = faceTypeCount === 4 ? "5種類に戻す" : "4種類で1試合（5,000pt）";
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
async function loadMyTsumSkill() {
  skillModule = await loadSkill(activeFace.id, activeFace.skillId || "");
  const level = Math.max(1, Number(activeFace.skill?.level) || 1);
  skillRequired = skillModule ? getRequiredKills(skillModule, level) : 20;
  skillCharge = 0;
  $("skillButton").textContent = "✨ " + (skillModule?.name || "マイツムスキル");
  $("skillDescription").textContent = (skillModule?.description || "マイツムを消してゲージをためよう") + "（必要：" + skillRequired + "個）";
  updateSkillUI();
}
function updateSkillUI() {
  const percent = Math.min(100, skillCharge / Math.max(1, skillRequired) * 100);
  $("skillFill").style.width = percent + "%";
  $("skillChargeText").textContent = Math.min(skillCharge, skillRequired) + " / " + skillRequired;
  $("skillButton").disabled = !running || paused || skillBusy || skillCharge < skillRequired;
}
async function activateMyTsumSkill() {
  if (!running || paused || skillBusy || skillCharge < skillRequired || !skillModule) return;
  skillBusy = true;
  skillCharge = 0;
  updateSkillUI();
  const level = Math.max(1, Number(activeFace?.skill?.level) || 1);
  let result;
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
    result = {};
  }
  const balls = [...physics.balls];
  let targets = [];
  const type = result.type || "explosion";
  if (["screen_clear", "explosion", "black_hole", "time_stop", "bullet_counter", "laser", "slash"].includes(type)) {
    const amount = type === "screen_clear" ? balls.length
      : Math.min(balls.length, Math.max(5, Math.round((Number(result.damage) || 70) / 5)));
    targets = balls.sort(() => Math.random() - 0.5).slice(0, amount);
  } else if (["line_clear"].includes(type)) {
    const centerY = physics.height * 0.55;
    targets = balls.filter(ball => Math.abs(ball.body.position.y - centerY) < Math.max(70, Number(result.height) || 130))
      .slice(0, Math.max(5, Number(result.maxTargets) || 12));
  } else if (type === "defense" || type === "teleport" || type === "orbit_guard") {
    targets = balls.sort(() => Math.random() - 0.5).slice(0, Math.max(3, Number(result.heal) || 5));
  } else {
    targets = balls.sort(() => Math.random() - 0.5).slice(0, 8);
  }
  if (targets.length) clearBalls(targets, "skill");
  else say((skillModule.name || "スキル") + " 発動！");
  skillBusy = false;
  updateSkillUI();
}
function updateHud() {
  $("score").textContent = score.toLocaleString();
  $("time").textContent = String(timeLeft);
  $("combo").textContent = String(combo);
  $("feverFill").style.width = fever + "%";
  $("fever").disabled = !running || paused || fever < 100;
  updateSkillUI();
  $("shuffle").disabled = !running || paused || performance.now() < shuffleReadyAt;
  $("shuffleCooldown").textContent = performance.now() < shuffleReadyAt
    ? Math.ceil((shuffleReadyAt - performance.now()) / 1000) + "秒"
    : "いつでもOK";
}
function setChain(next) {
  chain = next;
  physics?.setChain(chain);
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
  const selected = chain.slice();
  setChain([]);
  if (selected.length < 3) {
    if (selected.length) say("同じ顔を3個以上つなげてね！");
    return;
  }
  clearBalls(selected, "chain");
}
function clearBalls(balls, source = "chain") {
  if (!running || paused || !balls.length) return;
  const now = Date.now();
  combo = now - lastClearAt < 2400 ? combo + 1 : 1;
  lastClearAt = now;
  const n = balls.length;
  const myTsumCount = balls.filter(ball => String(ball.face?.id) === String(activeFace?.id)).length;
  if (source !== "skill" && myTsumCount > 0) skillCharge = Math.min(skillRequired, skillCharge + myTsumCount);
  const gained = Math.round(n * n * 12 * Math.min(combo, 6));
  score += gained;
  fever = Math.min(100, fever + n * 6);
  physics.removeAndDrop(balls);
  updateHud();
  updateSkillUI();
  say(source === "skill" ? "🌟 " + (skillModule?.name || "マイツムスキル") + " 発動！" : source === "fever"
    ? "顔面フィーバー！ " + n + "個を一気に消した！"
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
      if (!purchase.ok) { faceTypeCount = 5; roundStarting = false; $("start").disabled = false; updateFaceModeUI(); say("ポイント不足で5種類モードに戻しました。"); return; }
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
  score = 0; timeLeft = ROUND_SECONDS; combo = 0; fever = 0;
  lastClearAt = 0; roundEnded = false; running = true; paused = false;
  pointerDown = false; setChain([]);
  skillCharge = 0; skillBusy = false;
  chooseGameFaces();
  physics.seed(gameFaces, 70);
  $("result").classList.add("hidden");
  $("start").disabled = true; $("start").textContent = "プレイ中";
  $("faceSelect").disabled = true;
  updateFaceModeUI();
  updateSkillUI();
  $("pause").disabled = false; $("pause").textContent = "⏸ 一時停止";
  $("shuffle").disabled = false;
  updateHud();
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
  clearInterval(timer); timer = null;
  $("start").disabled = false; $("start").textContent = "▶ もう一度";
  $("faceSelect").disabled = false;
  faceTypeCount = 5; // 4種類モードは1試合ごとの購入なので、終了後は標準に戻す。
  updateFaceModeUI();
  $("pause").disabled = true; $("shuffle").disabled = true; $("fever").disabled = true;
  const earned = Math.floor(score / 1000);
  $("resultText").textContent = "スコア：" + score.toLocaleString() + "点 / " + combo + "コンボ。ポイント " + earned + " を獲得しました。";
  $("result").classList.remove("hidden");
  if (earned > 0) void addMatchPoints(uid, earned).then(result => {
    if (!result?.success) { say("ポイントの保存に失敗しました。"); return; }
    points = Math.max(0, Number(result.points) || points);
    updateFaceModeUI();
  }).catch(error => { console.error(error); say("ポイントの保存に失敗しました。"); });
}
function useFever() {
  if (!running || paused || fever < 100) return;
  fever = 0;
  const balls = [...physics.balls].sort(() => Math.random() - 0.5)
    .slice(0, Math.min(physics.balls.length, 7 + Math.max(0, (Number(activeFace?.skill?.level) || 1) - 1) * 2));
  clearBalls(balls, "fever");
}
function shuffleBoard() {
  if (!running || paused || performance.now() < shuffleReadyAt) return;
  physics.shuffle();
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
  physics.seed(gameFaces, 70);
  $("start").disabled = false;
  say("準備完了！ボールが重力で落ちて積み重なるよ。");
}

$("boardCanvas").addEventListener("pointerdown", event => {
  if (!running || paused) return;
  event.preventDefault();
  $("boardCanvas").setPointerCapture?.(event.pointerId);
  pointerDown = true;
  setChain([]);
  const ball = physics.hitTest(physics.pointerPoint(event));
  tryAddBall(ball);
});
$("boardCanvas").addEventListener("pointermove", event => {
  if (!pointerDown || !running || paused) return;
  const ball = physics.hitTest(physics.pointerPoint(event), 1.45);
  tryAddBall(ball);
});
$("boardCanvas").addEventListener("pointerup", finishChain);
$("boardCanvas").addEventListener("pointercancel", finishChain);
$("start").addEventListener("click", startRound);
$("fever").addEventListener("click", useFever);
$("shuffle").addEventListener("click", shuffleBoard);
$("buyFour").addEventListener("click", buyFourMode);
$("skillButton").addEventListener("click", activateMyTsumSkill);
$("pause").addEventListener("click", () => {
  if (!running) return;
  paused = !paused;
  $("pause").textContent = paused ? "▶ 再開" : "⏸ 一時停止";
  say(paused ? "一時停止中" : "再開！");
});
$("faceSelect").addEventListener("change", event => void selectFace(event.target.value));
$("again").addEventListener("click", () => { $("result").classList.add("hidden"); startRound(); });
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
