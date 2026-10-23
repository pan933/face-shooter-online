"use strict";
// Run locally from a trusted computer. Never upload the service-account key or this
// script's execution environment to GitHub Pages. ADMIN_UID must be copied from Firebase Auth.
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const projectId = process.env.FIREBASE_PROJECT_ID || "face-61ed1";
const uid = String(process.env.ADMIN_UID || "").trim();
if (!uid) {
  console.error("ADMIN_UID を環境変数で指定してください（Firebase Authenticationに表示されるUID）。");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });

(async () => {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}), admin: true, adminRole: "owner" };
  await auth.setCustomUserClaims(uid, claims);
  console.log(`管理者権限を設定しました: UID=${uid}`);
  console.log("対象アカウントで再ログインするか、IDトークンを更新してください。");
  console.log("秘密鍵やパスワードは表示・保存していません。");
})().catch(error => {
  console.error("管理者権限の設定に失敗しました:", error.message);
  process.exit(1);
});
