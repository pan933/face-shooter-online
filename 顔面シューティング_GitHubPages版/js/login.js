/*
 * GitHub Pages static-only login.
 * This is a local demo, NOT secure server-side authentication.
 * Accounts exist only in this browser's localStorage.
 */
const $ = id => document.getElementById(id);
const USERS_KEY = "faceShooterStaticUsersV1";
const CURRENT_USER_KEY = "faceShooterStaticCurrentUserV1";
const REGISTRATION_CODE = "komakikouka"; // Public client-side code; not a secret.
const msgEl = $("globalMessage");

function setMessage(message, isError = false) {
  if (!msgEl) return;
  msgEl.textContent = message || "";
  msgEl.classList.toggle("error", !!isError);
}
function readUsers() {
  try {
    const value = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
}
function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function makeSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(salt, password) {
  if (!crypto.subtle) throw new Error("HTTPSで開いてください。GitHub PagesのURLからアクセスしてください。");
  const input = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
function setLoggedIn(username) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ username, displayName: username }));
}
function showMode(mode) {
  const isRegister = mode === "register";
  $("loginForm").hidden = isRegister;
  $("registerForm").hidden = !isRegister;
  $("loginTab").classList.toggle("active", !isRegister);
  $("registerTab").classList.toggle("active", isRegister);
  setMessage("");
}
$("loginTab").addEventListener("click", () => showMode("login"));
$("registerTab").addEventListener("click", () => showMode("register"));

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("loginForm").querySelector("button[type=submit]");
  button.disabled = true;
  setMessage("ログインしています…");
  try {
    const username = $("loginUsername").value.trim();
    const password = $("loginPassword").value;
    const user = readUsers().find(item => String(item.username).toLowerCase() === username.toLowerCase());
    if (!user) throw new Error("IDまたはパスワードが違います。");
    const hash = await hashPassword(user.salt, password);
    if (hash !== user.passwordHash) throw new Error("IDまたはパスワードが違います。");
    setLoggedIn(user.username);
    window.location.href = "./game.html";
  } catch (error) {
    setMessage(error.message || "ログインに失敗しました。", true);
  } finally {
    button.disabled = false;
  }
});

$("registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const username = $("registerUsername").value.trim();
  const password = $("registerPassword").value;
  const passwordConfirm = $("registerPasswordConfirm").value;
  const registrationCode = $("registrationCode").value;
  if (!/^[^\s]{2,24}$/.test(username)) {
    setMessage("IDは空白なしの2〜24文字で入力してください。", true); return;
  }
  if (password.length < 8) {
    setMessage("パスワードは8文字以上にしてください。", true); return;
  }
  if (password !== passwordConfirm) {
    setMessage("確認用パスワードが一致しません。", true); return;
  }
  if (registrationCode !== REGISTRATION_CODE) {
    setMessage("新規登録用パスワードが違います。", true); return;
  }
  const button = $("registerForm").querySelector("button[type=submit]");
  button.disabled = true;
  setMessage("アカウントを作成しています…");
  try {
    const users = readUsers();
    if (users.some(item => String(item.username).toLowerCase() === username.toLowerCase())) {
      throw new Error("このIDはすでに使われています。");
    }
    const salt = makeSalt();
    const passwordHash = await hashPassword(salt, password);
    users.push({ username, salt, passwordHash, createdAt: new Date().toISOString() });
    writeUsers(users);
    setLoggedIn(username);
    window.location.href = "./game.html";
  } catch (error) {
    setMessage(error.message || "アカウントを作成できませんでした。", true);
  } finally {
    button.disabled = false;
  }
});

// If already logged in in this browser, go directly to the game.
try {
  const current = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null");
  if (current && current.username) window.location.replace("./game.html");
} catch (_) { /* corrupted local state: keep the login form visible */ }
