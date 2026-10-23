import { app, auth, firebaseReady } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";

const $ = id => document.getElementById(id);
const GIMMICKS = [
  ["weak", "弱点出現"], ["moving", "動く弱点"], ["shield", "シールド解除"],
  ["clock", "時間制限"], ["ring", "リング"], ["decoy", "本物探し"],
  ["rain", "弾幕"], ["cross", "十字"], ["clone", "分身"],
  ["overheat", "オーバーヒート"], ["bombcore", "爆弾コア"],
  ["armorParts", "装甲パーツ"], ["bombFuse", "爆弾解除"], ["energyDrain", "エネルギー吸収"]
];
const DEFAULTS = {
  bossHpMultiplier: 1, bossSpeedMultiplier: 1, bossAttackFrequencyMultiplier: 1,
  bossBulletSpeedMultiplier: 1, playerDamageMultiplier: 1, incomingDamageMultiplier: 1,
  gimmickTimeMultiplier: 1, itemEffectDurationMultiplier: 1, itemLifetimeMultiplier: 1,
  itemDropRateMultiplier: 1, playerMaxHp: 5, bossAttacksEnabled: true,
  itemDropsEnabled: true, playerInvincible: false, disabledGimmicks: []
};
let functionsApi;
let isOwner = false;
let allAccounts = [];
let toastTimer;
const invoke = name => httpsCallable(functionsApi, name);

function toast(message, error = false) {
  const element = $("toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.style.display = "none"; }, 6000);
}

function showPanel(id) { $(id).hidden = false; }
function hidePanel(id) { $(id).hidden = true; }

function setupGimmickChecks() {
  const parent = $("gimmickChecks");
  GIMMICKS.forEach(([value, label]) => {
    const wrapper = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "disabledGimmicks";
    input.value = value;
    const text = document.createElement("span");
    text.textContent = label;
    wrapper.append(input, text);
    parent.appendChild(wrapper);
  });
}

function readConfigForm() {
  const config = {};
  for (const key of [
    "bossHpMultiplier", "bossSpeedMultiplier", "bossAttackFrequencyMultiplier", "bossBulletSpeedMultiplier",
    "playerDamageMultiplier", "incomingDamageMultiplier", "gimmickTimeMultiplier",
    "itemEffectDurationMultiplier", "itemLifetimeMultiplier", "itemDropRateMultiplier", "playerMaxHp"
  ]) config[key] = Number($(key).value);
  config.bossAttacksEnabled = $("bossAttacksEnabled").checked;
  config.itemDropsEnabled = $("itemDropsEnabled").checked;
  config.playerInvincible = $("playerInvincible").checked;
  config.disabledGimmicks = [...document.querySelectorAll('input[name="disabledGimmicks"]:checked')].map(el => el.value);
  return config;
}

function fillConfigForm(config = DEFAULTS) {
  const merged = { ...DEFAULTS, ...config };
  for (const key of Object.keys(DEFAULTS)) {
    if (["bossAttacksEnabled", "itemDropsEnabled", "playerInvincible", "disabledGimmicks"].includes(key)) continue;
    if ($(key)) $(key).value = String(merged[key]);
  }
  $("bossAttacksEnabled").checked = merged.bossAttacksEnabled !== false;
  $("itemDropsEnabled").checked = merged.itemDropsEnabled !== false;
  $("playerInvincible").checked = merged.playerInvincible === true;
  const disabled = new Set(Array.isArray(merged.disabledGimmicks) ? merged.disabledGimmicks : []);
  document.querySelectorAll('input[name="disabledGimmicks"]').forEach(el => { el.checked = disabled.has(el.value); });
}

async function loadConfig() {
  const result = await invoke("getGameConfig")({});
  fillConfigForm(result.data || DEFAULTS);
}

function makeButton(label, className, action, uid, extra = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.uid = uid;
  for (const [key, value] of Object.entries(extra)) button.dataset[key] = String(value);
  return button;
}

function renderAccounts() {
  const parent = $("accountsList");
  const query = $("accountSearch").value.trim().toLowerCase();
  const filtered = allAccounts.filter(account => [account.username, account.displayName, account.uid].some(value => String(value || "").toLowerCase().includes(query)));
  $("accountCount").textContent = `${filtered.length} / ${allAccounts.length} 件`;
  parent.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "該当するアカウントがありません。"; parent.appendChild(empty); return;
  }
  filtered.forEach(account => {
    const card = document.createElement("article"); card.className = "account-card";
    const main = document.createElement("div"); main.className = "account-main";
    const name = document.createElement("div"); name.className = "account-name"; name.textContent = account.displayName || account.username || "Player";
    const username = document.createElement("div"); username.className = "account-meta"; username.textContent = `ID: ${account.username}`;
    const uid = document.createElement("div"); uid.className = "account-uid"; uid.textContent = `UID: ${account.uid}`;
    main.append(name, username, uid);

    const meta = document.createElement("div"); meta.className = "account-meta";
    const state = document.createElement("span"); state.className = `status${account.disabled ? " disabled" : ""}`; state.textContent = account.disabled ? "ログイン停止中" : "有効"; meta.appendChild(state);
    if (account.isAdmin) { const admin = document.createElement("p"); const badge = document.createElement("span"); badge.className = "status admin"; badge.textContent = account.adminRole === "owner" ? "オーナー管理者" : "管理者"; admin.appendChild(badge); meta.appendChild(admin); }
    const created = document.createElement("p"); created.textContent = `登録: ${account.createdAt ? new Date(account.createdAt).toLocaleDateString("ja-JP") : "不明"}`;
    const signIn = document.createElement("p"); signIn.textContent = `最終ログイン: ${account.lastSignInAt ? new Date(account.lastSignInAt).toLocaleString("ja-JP") : "記録なし"}`;
    const rank = document.createElement("p"); rank.textContent = account.hasRank ? `最高記録: ${Number(account.rankScore).toLocaleString("ja-JP")} 点 / WAVE ${account.rankWave}` : "ランキング記録なし";
    meta.append(created, signIn, rank);

    const actions = document.createElement("div"); actions.className = "account-actions";
    if (account.uid !== window.adminUid && account.adminRole !== "owner" && (!account.isAdmin || isOwner)) {
      actions.appendChild(makeButton(account.disabled ? "ログイン再開" : "アカウント停止", "secondary", "toggle-disable", account.uid, { disabled: !account.disabled }));
      actions.appendChild(makeButton("パスワードを変更", "secondary", "reset-password", account.uid));
      if (account.hasRank) actions.appendChild(makeButton("ランキング削除", "secondary", "delete-rank", account.uid));
      actions.appendChild(makeButton("アカウント削除", "danger", "delete-account", account.uid));
    }
    if (isOwner && account.uid !== window.adminUid && account.adminRole !== "owner") {
      actions.appendChild(makeButton(account.isAdmin ? "管理者権限を解除" : "管理者権限を付与", "secondary", "toggle-admin", account.uid, { enabled: !account.isAdmin }));
    }
    card.append(main, meta, actions);
    parent.appendChild(card);
  });
}

async function loadAccounts() {
  $("accountsList").textContent = "アカウントを読み込んでいます…";
  const response = await invoke("adminListAccounts")({});
  allAccounts = response.data.accounts || [];
  $("truncatedNotice").hidden = !response.data.truncated;
  renderAccounts();
}

async function loadAudit() {
  if (!isOwner) return;
  $("auditList").textContent = "操作ログを読み込んでいます…";
  const response = await invoke("adminReadAuditLog")({});
  const parent = $("auditList"); parent.replaceChildren();
  const labels = {
    save_game_config: "ゲーム設定の保存", disable_account: "アカウント停止", enable_account: "アカウント再開",
    delete_account: "アカウント削除", delete_leaderboard_entry: "ランキング削除", reset_password: "パスワード変更",
    grant_admin: "管理者権限付与", revoke_admin: "管理者権限解除"
  };
  (response.data.entries || []).forEach(entry => {
    const row = document.createElement("div"); row.className = "audit-row";
    const action = document.createElement("div"); action.className = "audit-action"; action.textContent = labels[entry.action] || entry.action;
    const meta = document.createElement("div"); meta.className = "audit-meta";
    meta.textContent = `${entry.createdAt ? new Date(entry.createdAt).toLocaleString("ja-JP") : "日時不明"}\n実行者: ${entry.actorUid}\n対象: ${entry.targetUid || "—"}`;
    row.append(action, meta); parent.appendChild(row);
  });
  if (!parent.children.length) parent.textContent = "操作ログはまだありません。";
}

async function actOnAccount(action, uid, button) {
  const account = allAccounts.find(item => item.uid === uid);
  if (!account) return;
  button.disabled = true;
  try {
    if (action === "toggle-disable") {
      const disabled = !account.disabled;
      if (!confirm(`${account.username} を${disabled ? "停止" : "再開"}しますか？${disabled ? "既存のログインセッションも無効化します。" : ""}`)) return;
      await invoke("adminSetAccountDisabled")({ uid, disabled });
      toast(disabled ? "アカウントを停止しました。" : "アカウントを再開しました。");
    } else if (action === "reset-password") {
      const value = prompt(`${account.username} の新しいパスワードを入力してください（12文字以上）。\n現在のパスワードは取得できません。`);
      if (value === null) return;
      if (value.length < 12) { toast("パスワードは12文字以上にしてください。", true); return; }
      if (!confirm(`${account.username} のパスワードを変更し、既存セッションを無効化しますか？`)) return;
      const result = await invoke("adminResetPassword")({ uid, newPassword: value });
      toast(result.data.message || "パスワードを変更しました。");
    } else if (action === "delete-rank") {
      if (!confirm(`${account.username} のランキング記録だけを削除しますか？アカウントは残ります。`)) return;
      await invoke("adminDeleteLeaderboardEntry")({ uid });
      toast("ランキング記録を削除しました。");
    } else if (action === "delete-account") {
      const typed = prompt(`【取り消せません】${account.username} のアカウントとランキング・プロフィールを削除します。\n確認のため、このUIDを入力してください。\n${uid}`);
      if (typed !== uid) { toast("UIDが一致しないため削除を中止しました。"); return; }
      if (!confirm("最終確認：このアカウントを完全に削除しますか？復元できません。")) return;
      await invoke("adminDeleteAccount")({ uid });
      toast("アカウントと関連データを削除しました。");
    } else if (action === "toggle-admin") {
      if (!isOwner) throw new Error("管理者権限の変更はオーナーのみ実行できます。");
      const enabled = button.dataset.enabled === "true";
      if (!confirm(`${account.username} の管理者権限を${enabled ? "付与" : "解除"}しますか？`)) return;
      await invoke("adminSetAdminRole")({ uid, enabled, role: "admin" });
      toast(enabled ? "管理者権限を付与しました。対象者は再ログインすると反映されます。" : "管理者権限を解除しました。");
    }
    await loadAccounts();
    if (isOwner) await loadAudit();
  } catch (error) {
    console.error(error);
    toast(error?.message || "操作に失敗しました。", true);
  } finally {
    button.disabled = false;
  }
}

async function start() {
  setupGimmickChecks();
  if (!firebaseReady || !auth || !app) {
    hidePanel("checkingPanel"); showPanel("deniedPanel"); $("deniedText").textContent = "Firebaseの設定が読み込めません。"; return;
  }
  try {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) { hidePanel("checkingPanel"); showPanel("loginPanel"); return; }
    window.adminUid = user.uid;
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      hidePanel("checkingPanel"); showPanel("deniedPanel"); return;
    }
    isOwner = token.claims.adminRole === "owner";
    functionsApi = getFunctions(app, "asia-northeast1");
    $("signedInLabel").textContent = `ログイン中: ${user.displayName || user.email || user.uid}`;
    $("ownerBadge").hidden = !isOwner;
    $("logoutBtn").hidden = false;
    if (isOwner) { showPanel("auditPanel"); }
    hidePanel("checkingPanel"); showPanel("adminPanel");
    await Promise.all([loadConfig(), loadAccounts()]);
    if (isOwner) await loadAudit();
  } catch (error) {
    console.error(error);
    hidePanel("checkingPanel"); showPanel("deniedPanel"); $("deniedText").textContent = `管理画面を初期化できませんでした: ${error.message}`;
  }
}

$("configForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await invoke("adminSaveGameConfig")({ config: readConfigForm() });
    fillConfigForm(result.data.config);
    toast("ゲーム設定を保存しました。ゲームを再読み込みすると反映されます。");
    if (isOwner) await loadAudit();
  } catch (error) { toast(error?.message || "設定の保存に失敗しました。", true); }
  finally { button.disabled = false; }
});

$("resetConfigBtn").addEventListener("click", () => {
  if (confirm("フォームを初期値に戻しますか？このボタンだけではサーバーに保存されません。")) fillConfigForm(DEFAULTS);
});
$("accountSearch").addEventListener("input", renderAccounts);
$("accountsList").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (button) void actOnAccount(button.dataset.action, button.dataset.uid, button);
});
$("reloadAccountsBtn").addEventListener("click", () => loadAccounts().catch(error => toast(error.message, true)));
$("reloadAuditBtn").addEventListener("click", () => loadAudit().catch(error => toast(error.message, true)));
$("refreshAllBtn").addEventListener("click", async () => {
  try { await Promise.all([loadConfig(), loadAccounts()]); if (isOwner) await loadAudit(); toast("管理データを更新しました。"); }
  catch (error) { toast(error.message || "更新に失敗しました。", true); }
});
$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "./login.html";
});

void start();
