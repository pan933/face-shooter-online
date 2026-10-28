import {
  firebaseReady,
  firebaseConfigError,
  auth,
  db
} from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  signInWithPopup,
  TwitterAuthProvider
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

const REGISTRATION_CODE = "komakikouka";
const msgEl = $("globalMessage");

let pendingXUser = null;

// ========================================
// ログイン後の移動先
// ========================================

function getLoginRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo");

  // 移動を許可するページ
  const allowedPages = [
    "game.html",
    "gacha.html",
    "admin.html"
  ];

  if (returnTo && allowedPages.includes(returnTo)) {
    return `./${returnTo}`;
  }

  return "./game.html";
}

function redirectAfterLogin() {
  window.location.replace(getLoginRedirectUrl());
}

// ========================================
// メッセージ
// ========================================

function setMessage(message, isError = false) {
  if (!msgEl) return;

  msgEl.textContent = message || "";
  msgEl.classList.toggle("error", !!isError);
}

function showMode(mode) {
  const isRegister = mode === "register";

  $("loginForm").hidden = isRegister;
  $("registerForm").hidden = !isRegister;

  $("loginTab").classList.toggle("active", !isRegister);
  $("registerTab").classList.toggle("active", isRegister);

  setMessage("");
}

// ========================================
// ユーザー情報
// ========================================

function validUsername(username) {
  return /^[A-Za-z0-9_-]{2,24}$/.test(username);
}

function usernameToAuthEmail(username) {
  return `${String(username).trim().toLowerCase()}@face-shooter.invalid`;
}

function humanizeError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/email-already-in-use":
      "このIDはすでに使われています。別のIDにしてください。",

    "auth/invalid-credential":
      "IDまたはパスワードが違います。",

    "auth/invalid-email":
      "IDの形式が正しくありません。英数字・_・-で入力してください。",

    "auth/weak-password":
      "パスワードは8文字以上にしてください。",

    "auth/too-many-requests":
      "操作が多すぎます。少し時間をおいて再度お試しください。",

    "auth/network-request-failed":
      "通信に失敗しました。接続を確認してください。",

    "permission-denied":
      "Firestoreのセキュリティルールを確認してください。",

    "auth/operation-not-allowed":
      "Firebase ConsoleでEmail/Password認証を有効にしてください。",

    "auth/unauthorized-domain":
      "Firebase Authenticationの承認済みドメインに pan933.github.io を追加してください。"
  };

  return messages[code] || error?.message || "処理に失敗しました。";
}

// ========================================
// プロフィール
// ========================================

async function getProfile(user) {
  const profileRef = doc(db, "profiles", user.uid);
  const snapshot = await getDoc(profileRef);

  return snapshot.exists() ? snapshot.data() : null;
}

async function ensureProfile(user, preferredUsername = "") {
  const existing = await getProfile(user);

  if (existing) return existing;
  let username = String(preferredUsername || "").trim();

  const isTwitterUser = user.providerData?.some(
    item => item.providerId === "twitter.com"
  );

  if (!validUsername(username)) {
    username = isTwitterUser
      ? `x_${user.uid.slice(0, 10)}`
      : `p_${user.uid.slice(0, 10)}`;
  }

  const displayName =
    String(user.displayName || username).trim().slice(0, 32) || username;

  const profile = {
    uid: user.uid,
    username,
    displayName,
    createdAt: serverTimestamp()
  };

  await setDoc(doc(db, "profiles", user.uid), profile);

  try {
    await updateProfile(user, { displayName });
  } catch (error) {
    console.warn("Auth display name update skipped:", error);
  }

  return {
    ...profile,
    createdAt: new Date()
  };
}

// ========================================
// ガチャ用ユーザーデータ
// ========================================

async function ensureGameUserData(user) {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  // すでにデータがあれば上書きしない
  if (snapshot.exists()) return;

  await setDoc(userRef, {
    points: 0,
    faces: [],
    selectedFace: "face2",
    skillTickets: 0,
    createdAt: serverTimestamp()
  });
}

// ========================================
// ログイン完了
// ========================================

async function finishLogin(user, preferredUsername = "") {
  await ensureProfile(user, preferredUsername);
  await ensureGameUserData(user);
  redirectAfterLogin();
}


// ========================================
// ボタン制御
// ========================================

function setBusy(form, busy) {
  if (!form) return;

  form.querySelectorAll('button[type="submit"]').forEach(button => {
    button.disabled = busy;
  });
}

// ========================================
// タブ切り替え
// ========================================

$("loginTab").addEventListener("click", () => showMode("login"));

$("registerTab").addEventListener("click", () => showMode("register"));

// ========================================
// 通常ログイン
// ========================================

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!firebaseReady || !auth || !db) {
    setMessage("先にREADMEのFirebase設定を完了してください。", true);
    return;
  }

  const form = event.currentTarget;
  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  if (!validUsername(username)) {
    setMessage(
      "IDは英字・数字・_・-の2〜24文字で入力してください。",
      true
    );
    return;
  }

  setBusy(form, true);
  setMessage("ログインしています…");

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      usernameToAuthEmail(username),
      password
    );

    await finishLogin(credential.user, username);

  } catch (error) {
    console.error("ログインエラー:", error);
    setMessage(humanizeError(error), true);

  } finally {
    setBusy(form, false);
  }
});

// ========================================
// 新規登録
// ========================================

$("registerForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!firebaseReady || !auth || !db) {
    setMessage("先にREADMEのFirebase設定を完了してください。", true);
    return;
  }

  const form = event.currentTarget;

  const username = $("registerUsername").value.trim();
  const password = $("registerPassword").value;
  const passwordConfirm = $("registerPasswordConfirm").value;
  const registrationCode = $("registrationCode").value;

  if (!validUsername(username)) {
    setMessage(
      "IDは英字・数字・_・-の2〜24文字で入力してください。",
      true
    );
    return;
  }

  if (password.length < 8) {
    setMessage("パスワードは8文字以上にしてください。", true);
    return;
  }

  if (password !== passwordConfirm) {
    setMessage("確認用パスワードが一致しません。", true);
    return;
  }

  if (registrationCode !== REGISTRATION_CODE) {
    setMessage("新規登録用パスワードが違います。", true);
    return;
  }

  setBusy(form, true);
  setMessage("共有アカウントを作成しています…");

  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      usernameToAuthEmail(username),
      password
    );

    await updateProfile(credential.user, {
      displayName: username
    });

    await finishLogin(credential.user, username);

  } catch (error) {
    console.error("新規登録エラー:", error);
    setMessage(humanizeError(error), true);

  } finally {
    setBusy(form, false);
  }
});

// ========================================
// Xログイン
// ========================================

const xLoginBtn = $("xLoginBtn");

if (xLoginBtn) {
  xLoginBtn.addEventListener("click", async () => {
    if (!firebaseReady || !auth || !db) {
      setMessage("先にREADMEのFirebase設定を完了してください。", true);
      return;
    }

    xLoginBtn.disabled = true;
    setMessage("Xで認証しています…");

    try {
      const result = await signInWithPopup(
        auth,
        new TwitterAuthProvider()
      );

      const profile = await getProfile(result.user);

      if (profile) {
        redirectAfterLogin();
        return;
      }

      pendingXUser = result.user;

      $("standardAuth").hidden = true;
      $("xCompleteSection").hidden = false;

      setMessage(
        "初回のXログインです。新規登録用パスワードを入力してください。"
      );

    } catch (error) {
      console.error("Xログインエラー:", error);

      const xErrorMessages = {
        "auth/operation-not-allowed":
          "FirebaseでX（Twitter）ログインが有効になっていません。",

        "auth/unauthorized-domain":
          "Firebaseの承認済みドメインを確認してください。",

        "auth/popup-blocked":
          "ブラウザが認証画面をブロックしました。",

        "auth/popup-closed-by-user":
          "認証画面が閉じられました。もう一度試してください。",

        "auth/cancelled-popup-request":
          "認証処理がキャンセルされました。もう一度試してください。",

        "auth/invalid-credential":
          "Xの認証情報を確認できません。FirebaseのAPIキー・シークレットとXのコールバックURLを確認してください。",

        "auth/network-request-failed":
          "通信に失敗しました。インターネット接続を確認してください。"
      };

      setMessage(
        xErrorMessages[error?.code] ||
        `Xログインに失敗しました（${error?.code || "エラーコード不明"}）。FirebaseとX Developerの設定を確認してください。`,
        true
      );

      xLoginBtn.disabled = false;
    }
  });
}

// ========================================
// X初回登録
// ========================================

const xCompleteForm = $("xCompleteForm");

if (xCompleteForm) {
  xCompleteForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!pendingXUser) {
      setMessage(
        "Xの認証状態を確認できません。もう一度Xログインを行ってください。",
        true
      );
      return;
    }

    if ($("xRegistrationCode").value !== REGISTRATION_CODE) {
      setMessage("新規登録用パスワードが違います。", true);
      return;
    }

    setBusy(xCompleteForm, true);
    setMessage("Xアカウントを登録しています…");

    try {
      await finishLogin(pendingXUser);

    } catch (error) {
      console.error("X初回登録エラー:", error);
      setMessage(humanizeError(error), true);

    } finally {
      setBusy(xCompleteForm, false);
    }
  });
}

// ========================================
// ログインページ初期化
// ========================================

async function initializeLoginPage() {
  if (!firebaseReady || !auth || !db) {
    const detail = firebaseConfigError
      ? ` (${firebaseConfigError.message})`
      : "";

    setMessage(
      `Firebase設定がまだです。READMEの手順で js/firebase-config.js を設定してください。${detail}`,
      true
    );

    return;
  }

  try {
    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) return;

    const profile = await getProfile(user);

    if (profile) {
      redirectAfterLogin();
      return;
    }

    const isTwitterUser = user.providerData?.some(
      item => item.providerId === "twitter.com"
    );

    if (isTwitterUser) {
      pendingXUser = user;

      $("standardAuth").hidden = true;
      $("xCompleteSection").hidden = false;

      setMessage(
        "初回のXログインです。新規登録用パスワードを入力してください。"
      );

      return;
    }

    // Auth登録後、プロフィール作成に失敗した場合は
    // 通常ログインをやり直せるようにサインアウトする。
    await signOut(auth);

  } catch (error) {
    console.error("ログインページ初期化エラー:", error);
    setMessage(humanizeError(error), true);
  }
}

void initializeLoginPage();
