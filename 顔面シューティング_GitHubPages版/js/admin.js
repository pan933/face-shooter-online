import { auth, db, firebaseReady } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query,
  serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const GIMMICKS = [
  ["weak", "弱点出現"], ["moving", "動く弱点"], ["shield", "シールド解除"],
  ["clock", "時間制限"], ["ring", "リング"], ["decoy", "本物探し"],
  ["rain", "弾幕"], ["cross", "十字"], ["clone", "分身"],
  ["overheat", "オーバーヒート"], ["bombcore", "爆弾コア"],
  ["armorParts", "装甲パーツ"], ["bombFuse", "爆弾解除"], ["energyDrain", "エネルギー吸収"],
  ["pulse", "タイミング"]
];
const DEFAULTS = {
  bossHpMultiplier: 1, bossSpeedMultiplier: 1, bossAttackFrequencyMultiplier: 1,
  bossBulletSpeedMultiplier: 1, playerDamageMultiplier: 1, incomingDamageMultiplier: 1,
  gimmickTimeMultiplier: 1, itemEffectDurationMultiplier: 1, itemLifetimeMultiplier: 1,
  itemDropRateMultiplier: 1, playerMaxHp: 5, bossAttacksEnabled: true,
  itemDropsEnabled: true, playerInvincible: false, disabledGimmicks: []
};
let currentUser = null;
let isOwner = false;
let accounts = [];
let toastTimer;

function toast(message, error = false) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", error);
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 6000);
}
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }
function setupGimmicks() {
  const parent = $("gimmickChecks");
  for (const [value, label] of GIMMICKS) {
    const lab = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox"; input.name = "disabledGimmicks"; input.value = value;
    const span = document.createElement("span"); span.textContent = label;
    lab.append(input, span); parent.appendChild(lab);
  }
}
function readConfigForm() {
  const cfg = {};
  for (const key of [
    "bossHpMultiplier", "bossSpeedMultiplier", "bossAttackFrequencyMultiplier", "bossBulletSpeedMultiplier",
    "playerDamageMultiplier", "incomingDamageMultiplier", "gimmickTimeMultiplier",
    "itemEffectDurationMultiplier", "itemLifetimeMultiplier", "itemDropRateMultiplier", "playerMaxHp"
  ]) cfg[key] = Number($(key).value);
  cfg.bossAttacksEnabled = $("bossAttacksEnabled").checked;
  cfg.itemDropsEnabled = $("itemDropsEnabled").checked;
  cfg.playerInvincible = $("playerInvincible").checked;
  cfg.disabledGimmicks = [...document.querySelectorAll('input[name="disabledGimmicks"]:checked')].map(el => el.value);
  return cfg;
}
function fillConfigForm(input = {}) {
  const cfg = { ...DEFAULTS, ...input };
  for (const key of Object.keys(DEFAULTS)) {
    if (["bossAttacksEnabled", "itemDropsEnabled", "playerInvincible", "disabledGimmicks"].includes(key)) continue;
    if ($(key)) $(key).value = String(cfg[key]);
  }
  $("bossAttacksEnabled").checked = cfg.bossAttacksEnabled !== false;
  $("itemDropsEnabled").checked = cfg.itemDropsEnabled !== false;
  $("playerInvincible").checked = cfg.playerInvincible === true;
  const disabled = new Set(Array.isArray(cfg.disabledGimmicks) ? cfg.disabledGimmicks : []);
  document.querySelectorAll('input[name="disabledGimmicks"]').forEach(el => { el.checked = disabled.has(el.value); });
}
function escapeText(value) { return String(value ?? ""); }
async function audit(action, targetUid = null, details = {}) {
  try {
    await addDoc(collection(db, "adminAuditLog"), {
      actorUid: currentUser.uid, action, targetUid, details, createdAt: serverTimestamp()
    });
  } catch (error) {
    // Log failure should not mask a successful operation; console can help during setup.
    console.warn("Audit log could not be saved:", error);
  }
}
async function loadConfig() {
  const snap = await getDoc(doc(db, "adminSettings", "gameplay"));
  fillConfigForm(snap.exists() ? snap.data() : DEFAULTS);
}
function button(label, action, uid, danger = false) {
  const b = document.createElement("button");
  b.type = "button"; b.className = danger ? "danger" : "secondary";
  b.textContent = label; b.dataset.action = action; b.dataset.uid = uid;
  return b;
}
function renderAccounts() {
  const parent = $("accountsList");
  const search = $("accountSearch").value.trim().toLowerCase();
  const rows = accounts.filter(a => [a.uid, a.username, a.displayName].some(v => escapeText(v).toLowerCase().includes(search)));
  $("accountCount").textContent = `${rows.length} / ${accounts.length} 件`;
  parent.replaceChildren();
  if (!rows.length) {
    const p = document.createElement("p"); p.className = "muted"; p.textContent = "該当するアカウントがありません。"; parent.appendChild(p); return;
  }
  for (const a of rows) {
    const card = document.createElement("article"); card.className = "account-card";
    const main = document.createElement("div"); main.className = "account-main";
    const title = document.createElement("div"); title.className = "account-name"; title.textContent = a.displayName || a.username || "未登録プロフィール";
    const id = document.createElement("div"); id.className = "account-meta"; id.textContent = `ID: ${a.username || "（プロフィールなし）"}`;
    const uid = document.createElement("div"); uid.className = "account-uid"; uid.textContent = `UID: ${a.uid}`;
    main.append(title, id, uid);
    const meta = document.createElement("div"); meta.className = "account-meta";
    const state = document.createElement("span"); state.className = `status${a.disabled ? " disabled" : ""}`;
    state.textContent = a.disabled ? "ゲーム利用停止中" : "ゲーム利用可能"; meta.appendChild(state);
    if (a.isAdmin) {
      const role = document.createElement("p"); const badge = document.createElement("span"); badge.className = "status admin";
      badge.textContent = a.adminRole === "owner" ? "オーナー管理者" : "管理者"; role.appendChild(badge); meta.appendChild(role);
    }
    const rank = document.createElement("p"); rank.textContent = a.hasRank ? `ランキング: ${Number(a.rankScore || 0).toLocaleString("ja-JP")} 点 / WAVE ${a.rankWave || 1}` : "ランキング記録なし"; meta.appendChild(rank);
    const actions = document.createElement("div"); actions.className = "account-actions";
    const canManageRegular = a.uid !== currentUser.uid && !a.isAdmin;
    if (canManageRegular) {
      actions.appendChild(button(a.disabled ? "利用再開" : "ゲーム利用停止", "toggle-disable", a.uid));
      if (a.hasRank) actions.appendChild(button("ランキング削除", "delete-rank", a.uid));
      if (a.hasProfile) actions.appendChild(button("プロフィール・記録を削除", "delete-data", a.uid, true));
    }
    if (isOwner && a.uid !== currentUser.uid && a.adminRole !== "owner") {
      actions.appendChild(button(a.isAdmin ? "管理者権限を解除" : "管理者権限を付与", "toggle-admin", a.uid));
    }
    card.append(main, meta, actions); parent.appendChild(card);
  }
}
async function loadAccounts() {
  $("accountsList").textContent = "読み込んでいます…";
  const [profileSnap, rankSnap, accessSnap, adminSnap] = await Promise.all([
    getDocs(collection(db, "profiles")), getDocs(collection(db, "leaderboard")),
    getDocs(collection(db, "accessControl")), getDocs(collection(db, "admins"))
  ]);
  const profiles = new Map(profileSnap.docs.map(d => [d.id, d.data()]));
  const ranks = new Map(rankSnap.docs.map(d => [d.id, d.data()]));
  const accesses = new Map(accessSnap.docs.map(d => [d.id, d.data()]));
  const admins = new Map(adminSnap.docs.map(d => [d.id, d.data()]));
  const allUids = new Set([...profiles.keys(), ...ranks.keys(), ...accesses.keys(), ...admins.keys()]);
  accounts = [...allUids].map(uid => {
    const p = profiles.get(uid) || {}, r = ranks.get(uid), access = accesses.get(uid) || {}, adm = admins.get(uid) || {};
    return {
      uid, username: p.username || "", displayName: p.displayName || p.username || (access.disabled ? "停止・削除済みアカウント" : uid),
      hasProfile: profiles.has(uid), hasRank: !!r, rankScore: r?.score || 0, rankWave: r?.wave || 1,
      disabled: access.disabled === true, isAdmin: !!admins.has(uid), adminRole: adm.role || ""
    };
  }).sort((a,b) => (a.username || a.uid).localeCompare(b.username || b.uid, "ja"));
  renderAccounts();
  renderAdmins();
}
function renderAdmins() {
  const parent = $("adminsList");
  parent.replaceChildren();
  const admins = accounts.filter(a => a.isAdmin);
  for (const a of admins) {
    const item = document.createElement("article"); item.className = "account-card";
    const info = document.createElement("div"); info.className = "account-main";
    const name = document.createElement("div"); name.className = "account-name"; name.textContent = `${a.displayName} — ${a.adminRole === "owner" ? "オーナー" : "管理者"}`;
    const uid = document.createElement("div"); uid.className = "account-uid"; uid.textContent = a.uid;
    info.append(name, uid); item.appendChild(info); parent.appendChild(item);
  }
  if (!admins.length) parent.textContent = "管理者データがありません。Firestore Consoleで初期設定してください。";
}
async function doAccountAction(action, uid) {
  const account = accounts.find(a => a.uid === uid);
  if (!account || uid === currentUser.uid) return;
  if (account.isAdmin && !(isOwner && account.adminRole === "admin" && action === "toggle-admin")) {
    toast("管理者アカウントのこの操作はできません。", true); return;
  }
  if (action === "toggle-disable") {
    if (account.disabled) {
      if (!confirm(`${account.username || uid} のゲーム利用を再開しますか？`)) return;
      await deleteDoc(doc(db, "accessControl", uid));
      await audit("enable_game_access", uid);
      toast("ゲーム利用を再開しました。本人は再ログインしてください。");
    } else {
      if (!confirm(`${account.username || uid} のゲーム利用を停止しますか？Firebase Authenticationのアカウント自体は停止されません。`)) return;
      await setDoc(doc(db, "accessControl", uid), { disabled: true, reason: "管理者による停止", updatedAt: serverTimestamp() });
      await audit("disable_game_access", uid);
      toast("ゲーム内の利用を停止しました。");
    }
  } else if (action === "delete-rank") {
    if (!confirm(`${account.username || uid} のランキング記録を削除しますか？`)) return;
    await deleteDoc(doc(db, "leaderboard", uid));
    await audit("delete_leaderboard_entry", uid);
    toast("ランキング記録を削除しました。");
  } else if (action === "delete-data") {
    const typed = prompt(`ゲーム側のデータを削除し、アクセスを停止します。Firebase Authenticationのユーザーは残ります。確認のためUIDを入力してください:\n${uid}`);
    if (typed !== uid) { toast("UIDが一致しないため中止しました。"); return; }
    if (!confirm("プロフィールとランキングを削除し、ゲーム利用を停止します。続けますか？")) return;
    await setDoc(doc(db, "accessControl", uid), { disabled: true, reason: "管理者によるデータ削除", updatedAt: serverTimestamp() });
    await deleteDoc(doc(db, "leaderboard", uid)).catch(() => {});
    await deleteDoc(doc(db, "profiles", uid)).catch(() => {});
    await audit("delete_game_profile_and_rank", uid);
    toast("プロフィール・ランキングを削除し、ゲーム利用を停止しました。AuthのユーザーはFirebase Consoleに残ります。");
  } else if (action === "toggle-admin") {
    if (!isOwner) throw new Error("管理者権限の変更はオーナーのみ行えます。");
    if (account.adminRole === "owner") throw new Error("オーナー権限はこの画面から変更できません。");
    if (account.isAdmin) {
      if (!confirm(`${account.username || uid} の管理者権限を解除しますか？`)) return;
      await deleteDoc(doc(db, "admins", uid));
      await audit("revoke_admin", uid);
      toast("管理者権限を解除しました。");
    } else {
      if (!account.hasProfile) { toast("先に通常ログインでこのアカウントのプロフィールを作成してください。", true); return; }
      if (!confirm(`${account.username || uid} に管理者権限を付与しますか？`)) return;
      await setDoc(doc(db, "admins", uid), { role: "admin", createdAt: serverTimestamp() });
      await audit("grant_admin", uid);
      toast("管理者権限を付与しました。");
    }
  }
  await loadAccounts();
  if (isOwner) await loadAudit();
}
async function loadAudit() {
  if (!isOwner) return;
  const q = query(collection(db, "adminAuditLog"), orderBy("createdAt", "desc"), limit(100));
  const result = await getDocs(q);
  const parent = $("auditList"); parent.replaceChildren();
  for (const snap of result.docs) {
    const entry = snap.data();
    const row = document.createElement("div"); row.className = "audit-row";
    const action = document.createElement("div"); action.className = "audit-action"; action.textContent = entry.action || "操作";
    const meta = document.createElement("div"); meta.className = "audit-meta";
    meta.textContent = `${entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleString("ja-JP") : "日時不明"}\n実行者: ${entry.actorUid || "不明"}\n対象: ${entry.targetUid || "—"}`;
    row.append(action, meta); parent.appendChild(row);
  }
  if (!parent.children.length) parent.textContent = "操作ログはまだありません。";
}
async function start() {
  setupGimmicks();
  if (!firebaseReady || !auth || !db) {
    hide("checkingPanel"); show("deniedPanel"); $("deniedText").textContent = "Firebaseの初期化に失敗しました。"; return;
  }
  try {
    await auth.authStateReady();
    currentUser = auth.currentUser;
    if (!currentUser) { hide("checkingPanel"); show("loginPanel"); return; }
    const adminDoc = await getDoc(doc(db, "admins", currentUser.uid));
    if (!adminDoc.exists() || !["owner", "admin"].includes(adminDoc.data().role)) {
      hide("checkingPanel"); show("deniedPanel"); return;
    }
    isOwner = adminDoc.data().role === "owner";
    $("signedInLabel").textContent = `ログイン中: ${currentUser.displayName || currentUser.email || currentUser.uid}`;
    $("ownerBadge").hidden = !isOwner;
    $("logoutBtn").hidden = false;
    if (isOwner) { show("adminsPanel"); show("auditPanel"); }
    hide("checkingPanel"); show("adminPanel");
    await Promise.all([loadConfig(), loadAccounts()]);
    if (isOwner) await loadAudit();
  } catch (error) {
    console.error(error);
    hide("checkingPanel"); show("deniedPanel");
    $("deniedText").textContent = `初期化に失敗しました: ${error.code || error.message || error}`;
  }
}

$("configForm").addEventListener("submit", async event => {
  event.preventDefault();
  const buttonEl = event.submitter;
  buttonEl.disabled = true;
  try {
    const cfg = readConfigForm();
    await setDoc(doc(db, "adminSettings", "gameplay"), { ...cfg, updatedBy: currentUser.uid, updatedAt: serverTimestamp() });
    await audit("save_game_config", null, { disabledGimmicks: cfg.disabledGimmicks, playerMaxHp: cfg.playerMaxHp });
    toast("ゲーム設定を保存しました。再読み込み後に反映されます。");
    await loadAudit();
  } catch (error) { console.error(error); toast(`保存に失敗しました: ${error.code || error.message}`, true); }
  finally { buttonEl.disabled = false; }
});
$("resetConfigBtn").addEventListener("click", () => {
  if (confirm("フォームを初期値に戻しますか？ 保存ボタンを押すまで保存されません。")) fillConfigForm(DEFAULTS);
});
$("accountSearch").addEventListener("input", renderAccounts);
$("accountsList").addEventListener("click", async event => {
  const btn = event.target.closest("button[data-action]"); if (!btn) return;
  btn.disabled = true;
  try { await doAccountAction(btn.dataset.action, btn.dataset.uid); }
  catch (error) { console.error(error); toast(`操作に失敗しました: ${error.code || error.message}`, true); }
  finally { btn.disabled = false; }
});
$("reloadAccountsBtn").addEventListener("click", () => loadAccounts().catch(e => toast(e.message, true)));
$("reloadAuditBtn").addEventListener("click", () => loadAudit().catch(e => toast(e.message, true)));
$("refreshAllBtn").addEventListener("click", async () => {
  try { await Promise.all([loadConfig(), loadAccounts()]); if (isOwner) await loadAudit(); toast("更新しました。"); }
  catch (e) { toast(e.message || "更新に失敗しました。", true); }
});
$("logoutBtn").addEventListener("click", async () => { await signOut(auth); window.location.href = "./login.html"; });
void start();
