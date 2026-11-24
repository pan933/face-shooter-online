"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");

initializeApp();
setGlobalOptions({ region: "asia-northeast1", maxInstances: 5 });

const auth = getAuth();
const db = getFirestore();
const CONFIG_REF = db.doc("adminSettings/gameplay");

const GIMMICK_IDS = [
  "weak", "moving", "shield", "clock", "ring", "decoy", "rain", "cross",
  "clone", "overheat", "bombcore", "armorParts", "bombFuse", "energyDrain"
];

const DEFAULT_CONFIG = Object.freeze({
  bossHpMultiplier: 1,
  bossSpeedMultiplier: 1,
  bossAttackFrequencyMultiplier: 1,
  bossBulletSpeedMultiplier: 1,
  playerDamageMultiplier: 1,
  incomingDamageMultiplier: 1,
  gimmickTimeMultiplier: 1,
  itemEffectDurationMultiplier: 1,
  itemLifetimeMultiplier: 1,
  itemDropRateMultiplier: 1,
  playerMaxHp: 5,
  bossAttacksEnabled: true,
  itemDropsEnabled: true,
  playerInvincible: false,
  disabledGimmicks: []
});

function requireAdmin(request, ownerOnly = false) {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "管理権限がありません。");
  }
  if (ownerOnly && request.auth.token.adminRole !== "owner") {
    throw new HttpsError("permission-denied", "オーナー管理者のみ実行できます。");
  }
  return request.auth;
}

function cleanUid(value) {
  const uid = typeof value === "string" ? value.trim() : "";
  if (!uid || uid.length > 128 || /[\\/\s]/.test(uid)) {
    throw new HttpsError("invalid-argument", "UIDが正しくありません。");
  }
  return uid;
}

function clampNumber(value, fallback, min, max, integer = false) {
  let number = Number(value);
  if (!Number.isFinite(number)) number = fallback;
  number = Math.max(min, Math.min(max, number));
  return integer ? Math.round(number) : number;
}

function sanitizeConfig(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  return {
    bossHpMultiplier: clampNumber(raw.bossHpMultiplier, 1, 0.1, 10),
    bossSpeedMultiplier: clampNumber(raw.bossSpeedMultiplier, 1, 0.1, 4),
    bossAttackFrequencyMultiplier: clampNumber(raw.bossAttackFrequencyMultiplier, 1, 0.1, 5),
    bossBulletSpeedMultiplier: clampNumber(raw.bossBulletSpeedMultiplier, 1, 0.1, 4),
    playerDamageMultiplier: clampNumber(raw.playerDamageMultiplier, 1, 0.1, 50),
    incomingDamageMultiplier: clampNumber(raw.incomingDamageMultiplier, 1, 0, 10),
    gimmickTimeMultiplier: clampNumber(raw.gimmickTimeMultiplier, 1, 0.25, 10),
    itemEffectDurationMultiplier: clampNumber(raw.itemEffectDurationMultiplier, 1, 0.1, 10),
    itemLifetimeMultiplier: clampNumber(raw.itemLifetimeMultiplier, 1, 0.1, 10),
    itemDropRateMultiplier: clampNumber(raw.itemDropRateMultiplier, 1, 0, 5),
    playerMaxHp: clampNumber(raw.playerMaxHp, 5, 1, 20, true),
    bossAttacksEnabled: raw.bossAttacksEnabled !== false,
    itemDropsEnabled: raw.itemDropsEnabled !== false,
    playerInvincible: raw.playerInvincible === true,
    disabledGimmicks: Array.isArray(raw.disabledGimmicks)
      ? [...new Set(raw.disabledGimmicks.filter(id => GIMMICK_IDS.includes(id)))].slice(0, GIMMICK_IDS.length)
      : []
  };
}

function publicConfig(data) {
  // Return only known gameplay values. Never return actor IDs or audit data here.
  return sanitizeConfig(data || DEFAULT_CONFIG);
}

async function audit(actorUid, action, targetUid = null, details = {}) {
  await db.collection("adminAuditLog").add({
    actorUid,
    action,
    targetUid,
    details,
    createdAt: FieldValue.serverTimestamp()
  });
}

async function getTarget(uid, actor) {
  const targetUid = cleanUid(uid);
  if (targetUid === actor.uid) {
    throw new HttpsError("failed-precondition", "自分自身への停止・削除・パスワード変更は管理画面から実行できません。");
  }
  const target = await auth.getUser(targetUid).catch(error => {
    if (error.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "アカウントが見つかりません。");
    }
    throw error;
  });
  if (target.customClaims?.admin === true && actor.token.adminRole !== "owner") {
    throw new HttpsError("permission-denied", "管理者アカウントの操作はオーナー管理者のみ実行できます。");
  }
  if (target.customClaims?.adminRole === "owner") {
    throw new HttpsError("failed-precondition", "オーナー管理者のアカウントはこの操作では変更できません。");
  }
  return target;
}

exports.getGameConfig = onCall(async () => {
  const snapshot = await CONFIG_REF.get();
  return publicConfig(snapshot.exists ? snapshot.data() : DEFAULT_CONFIG);
});

exports.adminListAccounts = onCall(async request => {
  requireAdmin(request);
  // This project is intended for a small game community. Load up to 500 accounts per request.
  const result = await auth.listUsers(500);
  const users = result.users;
  const profileRefs = users.map(user => db.doc(`profiles/${user.uid}`));
  const rankRefs = users.map(user => db.doc(`leaderboard/${user.uid}`));
  const docs = users.length ? await db.getAll(...profileRefs, ...rankRefs) : [];
  const profiles = docs.slice(0, users.length);
  const ranks = docs.slice(users.length);
  return {
    truncated: !!result.pageToken,
    accounts: users.map((user, index) => {
      const profile = profiles[index]?.exists ? profiles[index].data() : {};
      const rank = ranks[index]?.exists ? ranks[index].data() : null;
      return {
        uid: user.uid,
        username: String(profile.username || (user.email || "").split("@")[0] || "unknown"),
        displayName: String(profile.displayName || user.displayName || profile.username || "Player"),
        disabled: !!user.disabled,
        isAdmin: user.customClaims?.admin === true,
        adminRole: user.customClaims?.adminRole || "",
        providers: (user.providerData || []).map(item => item.providerId),
        createdAt: user.metadata?.creationTime || "",
        lastSignInAt: user.metadata?.lastSignInTime || "",
        hasRank: !!rank,
        rankScore: rank ? Number(rank.score) || 0 : null,
        rankWave: rank ? Number(rank.wave) || 1 : null
      };
    })
  };
});

exports.adminSaveGameConfig = onCall(async request => {
  const actor = requireAdmin(request);
  const config = sanitizeConfig(request.data?.config);
  await CONFIG_REF.set({ ...config, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
  await audit(actor.uid, "save_game_config", null, {
    bossHpMultiplier: config.bossHpMultiplier,
    playerMaxHp: config.playerMaxHp,
    disabledGimmicks: config.disabledGimmicks
  });
  return { ok: true, config };
});

exports.adminSetAccountDisabled = onCall(async request => {
  const actor = requireAdmin(request);
  const target = await getTarget(request.data?.uid, actor);
  const disabled = request.data?.disabled === true;
  await auth.updateUser(target.uid, { disabled });
  if (disabled) await auth.revokeRefreshTokens(target.uid);
  await audit(actor.uid, disabled ? "disable_account" : "enable_account", target.uid);
  return { ok: true, uid: target.uid, disabled };
});

exports.adminDeleteAccount = onCall(async request => {
  const actor = requireAdmin(request);
  const target = await getTarget(request.data?.uid, actor);
  // Delete the known per-user records before deleting the Auth record. These are the
  // two UID-keyed collections used by this game's current client.
  await Promise.all([
    db.doc(`leaderboard/${target.uid}`).delete(),
    db.doc(`profiles/${target.uid}`).delete()
  ]);
  await auth.deleteUser(target.uid);
  await audit(actor.uid, "delete_account", target.uid, { deletedLeaderboardAndProfile: true });
  return { ok: true, uid: target.uid };
});

exports.adminDeleteLeaderboardEntry = onCall(async request => {
  const actor = requireAdmin(request);
  const uid = cleanUid(request.data?.uid);
  await db.doc(`leaderboard/${uid}`).delete();
  await audit(actor.uid, "delete_leaderboard_entry", uid);
  return { ok: true, uid };
});

exports.adminResetPassword = onCall(async request => {
  const actor = requireAdmin(request);
  const target = await getTarget(request.data?.uid, actor);
  const newPassword = typeof request.data?.newPassword === "string" ? request.data.newPassword : "";
  if (newPassword.length < 12 || newPassword.length > 128) {
    throw new HttpsError("invalid-argument", "新しいパスワードは12〜128文字にしてください。");
  }
  await auth.updateUser(target.uid, { password: newPassword });
  await auth.revokeRefreshTokens(target.uid);
  // Never log or return the password. Passwords cannot be retrieved from Firebase Auth.
  await audit(actor.uid, "reset_password", target.uid);
  return { ok: true, uid: target.uid, message: "パスワードを変更し、既存セッションを無効化しました。" };
});

exports.adminSetAdminRole = onCall(async request => {
  const actor = requireAdmin(request, true);
  const uid = cleanUid(request.data?.uid);
  if (uid === actor.uid) throw new HttpsError("failed-precondition", "自分自身の管理権限は変更できません。");
  const target = await auth.getUser(uid);
  const enable = request.data?.enabled === true;
  const requestedRole = request.data?.role === "owner" ? "owner" : "admin";
  if (target.customClaims?.adminRole === "owner" && enable && requestedRole !== "owner") {
    throw new HttpsError("failed-precondition", "オーナー管理者を通常の管理者へ降格させる操作は許可されていません。");
  }
  if (target.customClaims?.adminRole === "owner" && !enable) {
    const page = await auth.listUsers(1000);
    const otherOwners = page.users.filter(user => user.uid !== uid && user.customClaims?.admin === true && user.customClaims?.adminRole === "owner");
    if (otherOwners.length === 0) throw new HttpsError("failed-precondition", "最後のオーナー管理者は解除できません。");
  }
  const claims = { ...(target.customClaims || {}) };
  if (enable) {
    claims.admin = true;
    claims.adminRole = requestedRole;
  } else {
    delete claims.admin;
    delete claims.adminRole;
  }
  await auth.setCustomUserClaims(uid, Object.keys(claims).length ? claims : null);
  await audit(actor.uid, enable ? "grant_admin" : "revoke_admin", uid, { role: enable ? requestedRole : null });
  return { ok: true, uid, enabled: enable, role: enable ? requestedRole : null };
});

exports.adminReadAuditLog = onCall(async request => {
  requireAdmin(request, true);
  const snapshot = await db.collection("adminAuditLog").orderBy("createdAt", "desc").limit(100).get();
  return {
    entries: snapshot.docs.map(doc => {
      const row = doc.data();
      return {
        id: doc.id,
        actorUid: row.actorUid || "",
        action: row.action || "",
        targetUid: row.targetUid || "",
        details: row.details || {},
        createdAt: row.createdAt?.toDate?.().toISOString?.() || ""
      };
    })
  };
});
