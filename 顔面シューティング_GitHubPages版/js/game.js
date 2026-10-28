import { firebaseReady, firebaseConfigError, auth, db } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
    addMatchPoints,
    claimDailyLoginBonus,
    loadFaceData,
    CLOUDINARY_FACE_URLS
} from "./face-system.js";
import { loadSkill, getRequiredKills as getSkillRequiredKills, isSkillReady, consumeSkill, normalizeSkillData } from "./skill-system.js";




/* ==================================================
   TOUCH CONTROLS
================================================== */

let touchMode = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const touchJoystick = document.getElementById("touchJoystick");
const touchDpad = document.getElementById("touchDpad");
const joystickKnob = document.getElementById("joystickKnob");
const touchShoot = document.getElementById("touchShoot");
const touchBomb = document.getElementById("touchBomb");
const touchShield = document.getElementById("touchShield");
const touchSkill = document.getElementById("touchSkill");
const skillBtn = document.getElementById("skillBtn");
const skillNotice = document.getElementById("skillNotice");
const touchBombCount = document.getElementById("touchBombCount");
const touchShieldCount = document.getElementById("touchShieldCount");
const controlModeBtn = document.getElementById("controlModeBtn");
const moveControlBtn = document.getElementById("moveControlBtn");
const cursorSensitivity = document.getElementById("cursorSensitivity");
const cursorSensitivityValue = document.getElementById("cursorSensitivityValue");
let cursorSensitivityLevel = 1.0;
let cursorSize = document.getElementById("cursorSize");
let cursorSizeValue = document.getElementById("cursorSizeValue");
let cursorSizeLevel = Number(cursorSize?.value) || 32;
let gameCursor = null;
let cursorBaseX = 0;
let cursorBaseY = 0;

let activeFaceId = "face2";
let activeFaceSkill = null;
let activeSkillData = normalizeSkillData();
let skillActivationBusy = false;

// Firestoreの招待コード式サバイバルPvP状態
let pvpRoomCode = "";
let pvpRoomUnsubscribe = null;
let pvpPlayersUnsubscribe = null;
let pvpHitsUnsubscribe = null;
let pvpSyncTimer = null;
let pvpSyncBusy = false;
let pvpSyncFailureCount = 0;
let pvpSyncRetryAfter = 0;
let pvpStarted = false;
let pvpFinished = false;
let pvpLocalDead = false;
let pvpIsHost = false;
let pvpOpponentState = null;
let pvpLastOpponentUpdate = 0;
let pvpHasSeenOpponentState = false;
let pvpRoundStartedAt = 0;
let pvpLastGimmickCycleHit = -1;
let pvpRapidFireActive = false;
let pvpCurrentGimmick = { type: "", lane: 0.5, active: false, warning: false };
let pvpLastStateSyncAt = 0;
let pvpLastSentX = -1;
let pvpLastSentScore = -1;
let pvpLastSentWave = -1;
let pvpLastSentHp = -1;
let pvpLastSentFaceId = "";
let pvpLocalFaceImageUrl = "";
const pvpProcessedHitIds = new Set();

const CONTROL_LAYOUT_STORAGE_KEY = "faceShooterMobileLayoutV1";
const DEFAULT_CONTROL_LAYOUT = {
    move:   { x: 0.13, y: 0.77, size: 1.00, opacity: 0.82 },
    dpad:   { x: 0.13, y: 0.77, size: 1.00, opacity: 0.90 },
    shoot:  { x: 0.87, y: 0.77, size: 1.00, opacity: 0.96 },
    bomb:   { x: 0.80, y: 0.59, size: 1.00, opacity: 0.93 },
    shield: { x: 0.94, y: 0.59, size: 1.00, opacity: 0.93 },
    skill:  { x: 0.87, y: 0.39, size: 0.90, opacity: 1.00 },
    aim:    { x: 0.50, y: 0.47, size: 1.00, opacity: 0.88 }
};

function copyDefaultControlLayout() {
    return JSON.parse(JSON.stringify(DEFAULT_CONTROL_LAYOUT));
}

function normalizeControlLayout(input) {
    const result = copyDefaultControlLayout();
    if (!input || typeof input !== "object") return result;

    for (const key of Object.keys(result)) {
        const item = input[key];
        if (!item || typeof item !== "object") continue;
        result[key].x = Math.max(0.06, Math.min(0.94, Number(item.x) || result[key].x));
        result[key].y = Math.max(0.08, Math.min(0.92, Number(item.y) || result[key].y));
        result[key].size = Math.max(0.55, Math.min(1.70, Number(item.size) || result[key].size));
        result[key].opacity = Math.max(0.25, Math.min(1, Number(item.opacity) || result[key].opacity));
    }
    return result;
}

function loadControlLayout() {
    try {
        const saved = localStorage.getItem(CONTROL_LAYOUT_STORAGE_KEY);
        return saved ? normalizeControlLayout(JSON.parse(saved)) : copyDefaultControlLayout();
    } catch (error) {
        console.warn("操作レイアウトを読み込めませんでした。初期配置を使います。", error);
        return copyDefaultControlLayout();
    }
}

let controlLayout = loadControlLayout();

// ゲーム中に別の微調整パネルは出さず、カーソル位置は
// タイトル画面の「操作ボタンの配置をカスタム」で設定した場所を使う。
function renderGameCursorPosition() {
    if (!gameCursor) return;
    if (touchMode && gameWrap) {
        gameCursor.style.left = `${controlLayout.aim.x * gameWrap.clientWidth}px`;
        gameCursor.style.top = `${controlLayout.aim.y * gameWrap.clientHeight}px`;
    } else {
        gameCursor.style.left = `${cursorBaseX}px`;
        gameCursor.style.top = `${cursorBaseY}px`;
    }
}


// 既存HTML/CSSを編集せず、タイトル画面にカーソルサイズ設定を追加する。
const sensitivityPanel = document.getElementById("sensitivityPanel");
if (sensitivityPanel && !cursorSize) {
    const cursorSizeLabel = document.createElement("label");
    cursorSizeLabel.htmlFor = "cursorSize";
    cursorSizeLabel.style.cssText = "display:block;margin-top:12px;font-weight:800";

    cursorSizeValue = document.createElement("span");
    cursorSizeValue.id = "cursorSizeValue";
    cursorSizeValue.textContent = `${cursorSizeLevel}px`;
    cursorSizeLabel.append("🖱️ ゲーム内カーソルの大きさ：", cursorSizeValue);

    cursorSize = document.createElement("input");
    cursorSize.id = "cursorSize";
    cursorSize.type = "range";
    cursorSize.min = "12";
    cursorSize.max = "80";
    cursorSize.step = "2";
    cursorSize.value = String(cursorSizeLevel);
    cursorSize.setAttribute("aria-label", "ゲーム内カーソルの大きさ");
    cursorSize.style.cssText = "display:block;width:100%;margin:7px 0;accent-color:#ffe600;cursor:pointer";

    const cursorHint = document.createElement("p");
    cursorHint.textContent = "照準の大きさを12〜80pxで変更できます。";
    cursorHint.style.cssText = "margin:4px 0 0;color:#cbd5ff;font-size:11px";

    const sizePresets = document.createElement("div");
    sizePresets.className = "cursorSizePresets";
    sizePresets.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
    for (const size of [20, 32, 48, 64, 80]) {
        const preset = document.createElement("button");
        preset.type = "button";
        preset.textContent = `${size}px`;
        preset.style.cssText = "flex:1;min-width:48px;min-height:40px;border:1px solid #ffe600;border-radius:8px;background:#252a40;color:white;font-weight:900;cursor:pointer;touch-action:manipulation";
        preset.addEventListener("click", () => {
            cursorSize.value = String(size);
            cursorSizeLevel = size;
            applyCursorSize();
        });
        sizePresets.appendChild(preset);
    }

    sensitivityPanel.append(cursorSizeLabel, cursorSize, cursorHint, sizePresets);
}

// 元々「カーソル感度」と表記されていた項目はタッチ移動感度なので、表示を正確にする。
if (cursorSensitivityValue && cursorSensitivityValue.parentElement) {
    for (const node of cursorSensitivityValue.parentElement.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            node.textContent = node.textContent.replace("カーソル感度", "タッチ移動感度");
        }
    }
}

function applyCursorSize() {
    cursorSizeLevel = Math.max(12, Math.min(80, Number(cursorSizeLevel) || 32));
    const effectiveSize = cursorSizeLevel * (controlLayout?.aim?.size || 1);
    if (gameCursor) {
        gameCursor.style.width = `${effectiveSize}px`;
        gameCursor.style.height = `${effectiveSize}px`;
        gameCursor.style.borderWidth = effectiveSize >= 56 ? "3px" : "2px";
    }
    if (cursorSizeValue) cursorSizeValue.textContent = `${Math.round(cursorSizeLevel)}px`;
}

if (cursorSensitivity) {
    cursorSensitivity.addEventListener("input", () => {
        cursorSensitivityLevel = Number(cursorSensitivity.value);
        if (cursorSensitivityValue) cursorSensitivityValue.textContent = cursorSensitivityLevel.toFixed(1);
    });
}
if (cursorSize) {
    cursorSize.addEventListener("input", () => {
        cursorSizeLevel = Number(cursorSize.value);
        applyCursorSize();
    });
}

// 独自の照準カーソルの見た目もJS内で定義し、CSSファイルの置換を不要にする。
const gameCursorStyle = document.createElement("style");
gameCursorStyle.textContent = `
    #game { cursor: none !important; }
    #gameCursor {
        position:absolute; z-index:16; display:none; left:0; top:0;
        transform:translate(-50%,-50%); box-sizing:border-box;
        border:2px solid #ffe600; border-radius:50%;
        background:rgba(255,230,0,.06); pointer-events:none;
        box-shadow:0 0 0 2px rgba(0,0,0,.8), 0 0 12px rgba(255,230,0,.65);
    }
    #gameCursor::before, #gameCursor::after {
        content:""; position:absolute; background:#ffe600;
        box-shadow:0 0 3px #000;
    }
    #gameCursor::before {
        left:50%; top:-25%; width:2px; height:150%; transform:translateX(-50%);
    }
    #gameCursor::after {
        top:50%; left:-25%; height:2px; width:150%; transform:translateY(-50%);
    }
    #bossSupplyNotice {
        position:absolute; z-index:26; left:50%; bottom:148px; transform:translateX(-50%);
        display:none; max-width:90%; padding:10px 16px; border:2px solid #7ffcff;
        border-radius:12px; background:rgba(2,24,43,.94); color:#fff;
        font:1000 15px system-ui,sans-serif; text-align:center; pointer-events:none;
        box-shadow:0 0 18px rgba(77,255,255,.55);
    }

    /* Smartphone: larger tap targets, less clutter, and a scrollable title panel. */
    @media (max-width: 760px), (pointer: coarse) {
        #start { align-items:center; padding:6px; }
        #start > .panel {
            width:calc(100% - 8px); max-width:620px;
            max-height:calc(100dvh - 12px); overflow-y:auto; overscroll-behavior:contain;
            padding:13px; border-width:2px; border-radius:16px; box-shadow:0 5px 0 #000;
        }
        #start > .panel h1 { font-size:clamp(23px,6vw,36px); margin-bottom:8px; }
        #start > .panel > p { font-size:14px; line-height:1.45; margin:8px 0; }
        #authPanel, #leaderboardPanel { width:100%; margin:8px auto; padding:9px; }
        #authPanel h2, #leaderboardPanel h2 { font-size:16px; }
        #authPanel button, #authPanel a, #faceImageControls button,
        #start .mainButton, #adminPanel button, #sensitivityPanel button {
            min-height:44px; touch-action:manipulation;
        }
        #leaderboardList { max-height:132px; overflow:auto; }
        #sensitivityPanel { width:100%; font-size:13px; }
        #sensitivityPanel input[type=range] { min-height:28px; }
        .profileActions { gap:7px; }
        .profileActions a, .profileActions button { min-height:44px; flex:1; }
        #bossSupplyNotice { bottom:132px; font-size:13px; padding:8px 10px; }
        #touchJoystick { width:112px; height:112px; }
        #joystickKnob { width:52px; height:52px; }
        #touchActions { grid-template-columns:68px 68px; grid-template-rows:60px 60px 60px; gap:6px; }
        #touchShoot { width:142px; min-height:60px; }
        #touchActions .touchAction { min-height:60px; border-radius:15px; font-size:12px; }
        #touchHelp { max-width:46%; left:50%; bottom:6px; font-size:10px; text-align:center; }
    }
    @media screen and (max-width: 900px) and (orientation: landscape) and (pointer: coarse) {
        #start > .panel { max-height:calc(100dvh - 6px); padding:9px 10px; }
        #start > .panel > p { font-size:12px; margin:5px 0; }
        #start #leaderboardList { max-height:68px; }
        #touchJoystick { width:86px; height:86px; left:10px; bottom:9px; }
        #joystickKnob { width:40px; height:40px; }
        #touchActions { grid-template-columns:58px 58px; grid-template-rows:48px 48px 48px; gap:5px; right:10px; bottom:9px; }
        #touchShoot { width:121px; min-height:48px; }
        #touchActions .touchAction { min-height:48px; font-size:10px; padding:3px; }
        #bossSupplyNotice { bottom:75px; }
    }

    /* Minecraft-style pre-game control layout editor and saved touch layout. */
    body.touch-mode #touchActions {
        display:contents !important;
        position:static !important;
        inset:auto !important;
        width:auto !important;
        height:auto !important;
    }
    body.touch-mode #touchActions .touchAction {
        position:absolute !important;
        right:auto !important;
        bottom:auto !important;
        margin:0 !important;
        grid-column:auto !important;
        grid-row:auto !important;
    }
    #controlLayoutButton {
        display:block; width:100%; margin:9px auto 8px; padding:12px 14px;
        min-height:46px; border:2px solid #7fe8ff; border-radius:12px;
        background:#132c47; color:#fff; font-size:15px; font-weight:1000;
        cursor:pointer; touch-action:manipulation;
    }
    #controlLayoutEditor {
        position:absolute; inset:0; z-index:1000; display:none;
        align-items:center; justify-content:center; padding:8px;
        background:rgba(2,5,16,.96); color:#fff; box-sizing:border-box;
        font-family:system-ui,"Yu Gothic",sans-serif;
    }
    .cle-panel {
        display:flex; flex-direction:column; gap:10px; width:min(100%,900px);
        max-height:100%; overflow:auto; padding:14px; box-sizing:border-box;
        border:2px solid rgba(127,232,255,.7); border-radius:18px;
        background:linear-gradient(160deg,#172540,#080e20);
        box-shadow:0 10px 35px rgba(0,0,0,.5);
    }
    .cle-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .cle-heading h2 { margin:0; font-size:clamp(18px,3.2vw,25px); }
    .cle-heading button,.cle-action-button {
        min-height:42px; padding:8px 13px; border:1px solid rgba(255,255,255,.7);
        border-radius:10px; background:#253652; color:#fff; font-weight:900;
        cursor:pointer; touch-action:manipulation;
    }
    .cle-help { margin:0; color:#d6e8ff; font-size:13px; line-height:1.5; }
    .cle-stage {
        position:relative; flex:0 0 auto; width:100%; height:min(43dvh,410px);
        min-height:220px; overflow:hidden; border:2px solid #6c809d;
        border-radius:12px; touch-action:none; user-select:none;
        background:
            radial-gradient(ellipse at 50% 35%,rgba(40,103,132,.65),transparent 58%),
            linear-gradient(180deg,#192e43,#0b1828 70%,#142519);
    }
    .cle-demo-hud {
        position:absolute; top:8px; left:8px; right:8px; display:flex;
        justify-content:space-between; gap:8px; pointer-events:none;
        font-size:clamp(9px,1.7vw,13px); font-weight:1000; text-shadow:1px 2px 3px #000;
    }
    .cle-demo-enemy {
        position:absolute; left:50%; top:23%; transform:translate(-50%,-50%);
        width:clamp(28px,5vw,46px); height:clamp(28px,5vw,46px);
        display:grid; place-items:center; border:2px solid #ff8a91; border-radius:12px;
        background:#8b2634; box-shadow:0 0 25px rgba(255,60,75,.35); pointer-events:none;
    }
    .cle-demo-player {
        position:absolute; left:50%; top:78%; transform:translate(-50%,-50%);
        display:grid; place-items:center; width:42px; height:42px; border-radius:50%;
        border:2px solid #fff; background:#293eff; box-shadow:0 0 20px rgba(75,120,255,.4);
        pointer-events:none;
    }
    .cle-demo-caption {
        position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
        padding:5px 9px; border-radius:8px; background:rgba(0,0,0,.45);
        color:rgba(255,255,255,.8); font-size:12px; white-space:nowrap; pointer-events:none;
    }
    .cle-control {
        position:absolute; z-index:3; display:grid; place-items:center;
        left:50%; top:50%; transform:translate(-50%,-50%);
        box-sizing:border-box; padding:5px; color:#fff; font-weight:1000;
        border:2px solid rgba(255,255,255,.8); background:rgba(24,38,62,.88);
        box-shadow:0 3px 0 rgba(0,0,0,.45); user-select:none; touch-action:none;
        cursor:grab; text-align:center; line-height:1.1;
    }
    .cle-control:active { cursor:grabbing; }
    .cle-control.cle-selected { outline:3px solid #ffe600; outline-offset:3px; z-index:5; }
    .cle-stick { width:clamp(66px,12vw,112px); height:clamp(66px,12vw,112px); border-radius:50%; background:rgba(30,44,63,.78); font-size:12px; }
    .cle-action { min-width:clamp(55px,9vw,82px); min-height:clamp(48px,8vw,66px); border-radius:15px; font-size:clamp(10px,1.7vw,15px); }
    .cle-shoot { background:rgba(126,94,14,.94); border-color:#ffe36b; }
    .cle-bomb { background:rgba(142,62,17,.94); border-color:#ffc28d; }
    .cle-shield { background:rgba(10,93,129,.94); border-color:#91e8ff; }
    .cle-skill { background:rgba(125,75,12,.96); border-color:#ffe36b; }
    .cle-aim {
        width:34px; height:34px; padding:0; min-width:0; min-height:0;
        border:2px solid #ffe600; border-radius:50%; background:rgba(255,230,0,.08);
        color:#ffe600; box-shadow:0 0 12px rgba(255,230,0,.6); font-size:18px;
    }
    .cle-settings { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px 16px; }
    .cle-selected-name { grid-column:1/-1; margin:0; color:#ffe600; font-weight:1000; }
    .cle-range { display:grid; gap:5px; font-size:12px; font-weight:900; }
    .cle-range input { width:100%; min-height:28px; accent-color:#ffe600; }
    .cle-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; }
    .cle-actions button { flex:1 1 120px; min-height:44px; }
    .cle-save { background:#ffe600 !important; color:#111 !important; border-color:#ffe600 !important; }
    .cle-status { min-height:1.2em; margin:0; color:#9ef4e0; font-size:12px; }
    @media (max-width:650px), (pointer:coarse) {
        #controlLayoutEditor { padding:5px; }
        .cle-panel { padding:9px; gap:8px; border-radius:13px; }
        .cle-help { font-size:12px; }
        .cle-stage { height:min(39dvh,330px); min-height:205px; }
        .cle-settings { gap:7px 10px; }
        .cle-actions { gap:6px; }
        .cle-actions button { flex:1 1 100px; padding:7px 8px; font-size:12px; }
    }
`;
document.head.appendChild(gameCursorStyle);

let joystickPointerId = null;
let shootPointerId = null;
let bombPointerId = null;
let shieldPointerId = null;

// タッチ入力状態は、applyControlMode() より前に初期化する
let touchDirX = 0;
let touchDirY = 0;
let touchFireHeld = false;
let touchMoveMode = "stick";
const dpadDirections = new Set();

function applyControlMode() {
    document.body.classList.toggle("touch-mode", touchMode);
    document.body.classList.toggle("touch-dpad-mode", touchMode && touchMoveMode === "dpad");
    if (controlModeBtn) {
        controlModeBtn.textContent = touchMode ? "🎮 タッチ操作：ON" : "📱 タッチ操作：OFF";
        controlModeBtn.classList.toggle("touchOn", touchMode);
    }
    if (moveControlBtn) {
        moveControlBtn.textContent = touchMoveMode === "dpad" ? "✥ 移動：方向パッド" : "🕹 移動：スティック";
        moveControlBtn.setAttribute("aria-pressed", String(touchMoveMode === "dpad"));
    }
    if (!touchMode) {
        touchFireHeld = false;
        joystickPointerId = shootPointerId = bombPointerId = shieldPointerId = null;
        resetJoystick();
        if (touchShoot) touchShoot.classList.remove("pressed");
        if (touchBomb) touchBomb.classList.remove("pressed");
        if (touchShield) touchShield.classList.remove("pressed");
    }
}

function resetJoystick() {
    touchDirX = 0;
    touchDirY = 0;
    dpadDirections.clear();
    touchDpad?.querySelectorAll("button.pressed").forEach(button => button.classList.remove("pressed"));
    if (joystickKnob) { joystickKnob.style.left = "50%"; joystickKnob.style.top = "50%"; }
}

moveControlBtn?.addEventListener("click", () => {
    touchMoveMode = touchMoveMode === "stick" ? "dpad" : "stick";
    resetJoystick();
    applyControlMode();
});

if (touchDpad) {
    const updateDpadVector = () => {
        const x = (dpadDirections.has("right") ? 1 : 0) - (dpadDirections.has("left") ? 1 : 0);
        const y = (dpadDirections.has("down") ? 1 : 0) - (dpadDirections.has("up") ? 1 : 0);
        const length = Math.hypot(x, y) || 1;
        touchDirX = x / length;
        touchDirY = y / length;
    };
    touchDpad.querySelectorAll("button[data-dir]").forEach(button => {
        let pointerId = null;
        const direction = button.dataset.dir;
        button.addEventListener("pointerdown", event => {
            if (!touchMode || touchMoveMode !== "dpad" || !running || paused || pointerId !== null) return;
            event.preventDefault();
            pointerId = event.pointerId;
            dpadDirections.add(direction);
            button.classList.add("pressed");
            try { button.setPointerCapture(event.pointerId); } catch (_) {}
            updateDpadVector();
        }, { passive: false });
        const release = event => {
            if (event?.pointerId !== undefined && event.pointerId !== pointerId) return;
            pointerId = null;
            dpadDirections.delete(direction);
            button.classList.remove("pressed");
            updateDpadVector();
        };
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
    });
}

function updateJoystick(event) {
    if (!touchJoystick || !touchMode) return;
    const rect = touchJoystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
    let x = event.clientX - cx, y = event.clientY - cy;
    const distance = Math.hypot(x, y);
    if (distance > maxRadius) { x = x / distance * maxRadius; y = y / distance * maxRadius; }
    touchDirX = Math.max(-1, Math.min(1, x / maxRadius));
    touchDirY = Math.max(-1, Math.min(1, y / maxRadius));
    if (joystickKnob) {
        joystickKnob.style.left = `calc(50% + ${x}px)`;
        joystickKnob.style.top = `calc(50% + ${y}px)`;
    }
}

if (touchJoystick) {
    touchJoystick.addEventListener("pointerdown", event => {
        if (!touchMode || !running || paused || joystickPointerId !== null) return;
        event.preventDefault(); joystickPointerId = event.pointerId;
        try { touchJoystick.setPointerCapture(event.pointerId); } catch (_) {}
        updateJoystick(event);
    }, {passive:false});
    touchJoystick.addEventListener("pointermove", event => {
        if (!touchMode || paused || event.pointerId !== joystickPointerId) return;
        event.preventDefault(); updateJoystick(event);
    }, {passive:false});
    const releaseJoystick = event => {
        if (event && event.pointerId !== undefined && event.pointerId !== joystickPointerId) return;
        joystickPointerId = null; resetJoystick();
    };
    touchJoystick.addEventListener("pointerup", releaseJoystick);
    touchJoystick.addEventListener("pointercancel", releaseJoystick);
    touchJoystick.addEventListener("lostpointercapture", releaseJoystick);
}

if (touchShoot) {
    touchShoot.addEventListener("pointerdown", event => {
        if (!touchMode || !running || paused || shootPointerId !== null) return;
        event.preventDefault(); shootPointerId = event.pointerId; touchFireHeld = true;
        touchShoot.classList.add("pressed");
        try { touchShoot.setPointerCapture(event.pointerId); } catch (_) {}
        shoot();
    }, {passive:false});
    const releaseShoot = event => {
        if (event && event.pointerId !== undefined && event.pointerId !== shootPointerId) return;
        shootPointerId = null; touchFireHeld = false; touchShoot.classList.remove("pressed");
    };
    touchShoot.addEventListener("pointerup", releaseShoot);
    touchShoot.addEventListener("pointercancel", releaseShoot);
    touchShoot.addEventListener("lostpointercapture", releaseShoot);
}

function setupTouchActionButton(button, action, state) {
    if (!button) return;
    button.addEventListener("pointerdown", event => {
        if (!touchMode || !running || paused || state.id !== null) return;
        event.preventDefault(); state.id = event.pointerId; button.classList.add("pressed");
        try { button.setPointerCapture(event.pointerId); } catch (_) {}
        action();
    }, {passive:false});
    const release = event => {
        if (event && event.pointerId !== undefined && event.pointerId !== state.id) return;
        state.id = null; button.classList.remove("pressed");
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
}

setupTouchActionButton(touchBomb, useBomb, {get id(){return bombPointerId;}, set id(v){bombPointerId=v;}});
setupTouchActionButton(touchShield, useShield, {get id(){return shieldPointerId;}, set id(v){shieldPointerId=v;}});

function updateTouchCounts() {
    if (touchBombCount) touchBombCount.textContent = bombs;
    if (touchShieldCount) touchShieldCount.textContent = shields;
}
setInterval(updateTouchCounts, 100);

if (controlModeBtn) {
    controlModeBtn.addEventListener("click", event => {
        event.preventDefault();
        touchMode = !touchMode;
        applyControlMode();
        applyControlLayout();
        if (gameCursor) {
            if (touchMode && running) {
                renderGameCursorPosition();
                gameCursor.style.display = "block";
            } else if (!touchMode) {
                gameCursor.style.display = "none";
            }
        }
    });
}

// ゲーム途中終了ボタン
const quitGameBtn = document.getElementById("quitGameBtn");
const quitYesBtn = document.getElementById("quitYes");
const quitNoBtn = document.getElementById("quitNo");
const quitConfirm = document.getElementById("quitConfirm");
if (quitGameBtn) quitGameBtn.addEventListener("click", showQuitConfirm);
if (quitYesBtn) quitYesBtn.addEventListener("click", quitGame);
if (quitNoBtn) quitNoBtn.addEventListener("click", hideQuitConfirm);
if (quitConfirm) quitConfirm.addEventListener("click", (e) => {
    if (e.target.id === "quitConfirm") hideQuitConfirm();
});

const pauseGameBtn = document.getElementById("pauseGameBtn");
const pauseOverlay = document.getElementById("pauseOverlay");
const pauseResumeBtn = document.getElementById("pauseResumeBtn");
const pauseToTitleBtn = document.getElementById("pauseToTitleBtn");
if (pauseGameBtn) pauseGameBtn.addEventListener("click", togglePause);
if (pauseResumeBtn) pauseResumeBtn.addEventListener("click", resumeGame);
if (pauseToTitleBtn) pauseToTitleBtn.addEventListener("click", showQuitConfirm);

// 別タブへ移動・スマホでアプリを切り替えた時は自動で一時停止する。
// 戻ってきた時に勝手に再開しないので、再開ボタンで安全に復帰できる。
document.addEventListener("visibilitychange", () => {
    if (document.hidden && running && !paused) {
        pauseGame();
    }
});

applyControlMode();




/* ==================================================
   IMAGE
================================================== */

const FACE_GUEST = "face.png";
const FACE_REGISTERED = CLOUDINARY_FACE_URLS.face2;
pvpLocalFaceImageUrl = FACE_REGISTERED;

function getGachaFaceImage(faceId) {
    if (!faceId) {
        return FACE_REGISTERED;
    }

    return CLOUDINARY_FACE_URLS[faceId] || FACE_REGISTERED;
}


const canvas =
    document.getElementById("game");


const ctx =
    canvas.getContext("2d");


const gameWrap =
    document.getElementById("gameWrap");

// 照準はゲーム画面内だけに表示する。OS全体のカーソル設定は変更しない。
if (gameWrap && canvas) {
    gameCursor = document.createElement("div");
    gameCursor.id = "gameCursor";
    gameCursor.setAttribute("aria-hidden", "true");
    gameWrap.appendChild(gameCursor);

    gameWrap.addEventListener("pointermove", event => {
        if (event.pointerType !== "mouse") {
            if (touchMode && running) {
                renderGameCursorPosition();
                gameCursor.style.display = "block";
            } else {
                gameCursor.style.display = "none";
            }
            return;
        }

        const rect = gameWrap.getBoundingClientRect();
        const x = event.clientX - rect.left - gameWrap.clientLeft;
        const y = event.clientY - rect.top - gameWrap.clientTop;

        if (x < 0 || y < 0 || x > gameWrap.clientWidth || y > gameWrap.clientHeight) {
            gameCursor.style.display = "none";
            return;
        }

        cursorBaseX = x;
        cursorBaseY = y;
        renderGameCursorPosition();
        gameCursor.style.display = "block";
    });

    gameWrap.addEventListener("pointerleave", () => {
        if (touchMode && running) {
            renderGameCursorPosition();
            gameCursor.style.display = "block";
        } else {
            gameCursor.style.display = "none";
        }
    });

}
applyCursorSize();

// 操作レイアウトをゲーム開始前に編集する「Minecraft風カスタム操作」画面。
// 配置・サイズ・透過度はこの端末のlocalStorageに保存する。
function applyControlLayout() {
    if (!gameWrap) return;

    const move = controlLayout.move;
    if (touchJoystick) {
        touchJoystick.style.setProperty("position", "absolute", "important");
        touchJoystick.style.setProperty("left", `${move.x * 100}%`, "important");
        touchJoystick.style.setProperty("top", `${move.y * 100}%`, "important");
        touchJoystick.style.setProperty("right", "auto", "important");
        touchJoystick.style.setProperty("bottom", "auto", "important");
        touchJoystick.style.setProperty("transform", `translate(-50%, -50%) scale(${move.size})`, "important");
        const joystickBase = window.matchMedia("(max-width: 900px) and (orientation: landscape) and (pointer: coarse)").matches
            ? 86
            : window.matchMedia("(max-width: 760px), (pointer: coarse)").matches ? 112 : 132;
        touchJoystick.style.setProperty("width", `${joystickBase * move.size}px`, "important");
        touchJoystick.style.setProperty("height", `${joystickBase * move.size}px`, "important");
        touchJoystick.style.setProperty("opacity", String(move.opacity), "important");
        if (joystickKnob) {
            joystickKnob.style.setProperty("width", `${joystickBase * 0.46 * move.size}px`, "important");
            joystickKnob.style.setProperty("height", `${joystickBase * 0.46 * move.size}px`, "important");
        }
    }

    if (touchDpad) {
        const dpad = controlLayout.dpad;
        const dpadBase = window.matchMedia("(max-width: 900px) and (orientation: landscape) and (pointer: coarse)").matches
            ? 32
            : window.matchMedia("(max-width: 760px), (pointer: coarse)").matches ? 38 : 42;
        touchDpad.style.setProperty("position", "absolute", "important");
        touchDpad.style.setProperty("left", `${dpad.x * 100}%`, "important");
        touchDpad.style.setProperty("top", `${dpad.y * 100}%`, "important");
        touchDpad.style.setProperty("right", "auto", "important");
        touchDpad.style.setProperty("bottom", "auto", "important");
        touchDpad.style.setProperty("transform", `translate(-50%, -50%) scale(${dpad.size})`, "important");
        touchDpad.style.setProperty("grid-template-columns", `repeat(3, ${dpadBase}px)`, "important");
        touchDpad.style.setProperty("grid-template-rows", `repeat(3, ${dpadBase}px)`, "important");
        touchDpad.style.setProperty("opacity", String(dpad.opacity), "important");
    }

    const buttonSpecs = {
        shoot: { element: touchShoot, desktop: [161, 76], compact: [142, 60], landscape: [121, 48] },
        bomb: { element: touchBomb, desktop: [76, 76], compact: [68, 60], landscape: [58, 48] },
        shield: { element: touchShield, desktop: [76, 76], compact: [68, 60], landscape: [58, 48] },
        skill: { element: touchSkill, desktop: [108, 54], compact: [98, 48], landscape: [88, 44] }
    };
    const landscape = window.matchMedia("(max-width: 900px) and (orientation: landscape) and (pointer: coarse)").matches;
    const compact = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;

    for (const [key, spec] of Object.entries(buttonSpecs)) {
        const element = spec.element;
        if (!element) continue;
        const setting = controlLayout[key];
        const [baseW, baseH] = landscape ? spec.landscape : compact ? spec.compact : spec.desktop;
        element.style.setProperty("position", "absolute", "important");
        element.style.setProperty("left", `${setting.x * 100}%`, "important");
        element.style.setProperty("top", `${setting.y * 100}%`, "important");
        element.style.setProperty("right", "auto", "important");
        element.style.setProperty("bottom", "auto", "important");
        element.style.setProperty("margin", "0", "important");
        element.style.setProperty("transform", `translate(-50%, -50%) scale(${setting.size})`, "important");
        element.style.setProperty("width", `${baseW}px`, "important");
        element.style.setProperty("height", `${baseH}px`, "important");
        element.style.setProperty("min-height", `${baseH}px`, "important");
        element.style.setProperty("opacity", String(setting.opacity), "important");
    }

    if (gameCursor) {
        if (touchMode) {
            renderGameCursorPosition();
            gameCursor.style.setProperty("opacity", String(controlLayout.aim.opacity), "important");
        }
    }
    applyCursorSize();
}

function cloneCurrentControlLayout() {
    return JSON.parse(JSON.stringify(controlLayout));
}

function createControlLayoutEditor() {
    if (!gameWrap || document.getElementById("controlLayoutEditor")) return;

    const startButton = document.getElementById("startBtn");
    if (!startButton || !startButton.parentElement) return;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.id = "controlLayoutButton";
    openButton.textContent = "🎮 操作ボタンの配置をカスタム";
    openButton.setAttribute("aria-haspopup", "dialog");
    startButton.parentElement.insertBefore(openButton, startButton);

    const overlay = document.createElement("div");
    overlay.id = "controlLayoutEditor";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "cleTitle");
    overlay.innerHTML = `
        <div class="cle-panel">
            <div class="cle-heading">
                <h2 id="cleTitle">🎮 操作レイアウトを編集</h2>
                <button type="button" id="cleClose" aria-label="閉じる">✕</button>
            </div>
            <p class="cle-help">スマホ版マイクラの操作設定のように、ボタンをドラッグして好きな場所へ動かせます。下のデモ画面で配置を確認してね。</p>
            <div class="cle-stage" id="cleStage" aria-label="操作ボタンの配置プレビュー">
                <div class="cle-demo-hud"><span>❤️ HP 4/5</span><span>WAVE 1</span><span>⭐ SCORE 1200</span></div>
                <div class="cle-demo-enemy">👾</div>
                <div class="cle-demo-player">🙂</div>
                <div class="cle-demo-caption">ここをドラッグして配置</div>
            </div>
            <div class="cle-settings">
                <p class="cle-selected-name" id="cleSelectedName">選択中：移動スティック</p>
                <label class="cle-range">サイズ：<output id="cleSizeValue">100%</output>
                    <input id="cleSize" type="range" min="55" max="170" step="5" value="100">
                </label>
                <label class="cle-range">透明度：<output id="cleOpacityValue">82%</output>
                    <input id="cleOpacity" type="range" min="25" max="100" step="5" value="82">
                </label>
            </div>
            <p class="cle-help">配置できるもの：移動スティック・方向パッド・発射・爆弾・シールド・スキル・照準。選んだボタンは黄色い枠で表示されます。</p>
            <p class="cle-status" id="cleStatus" role="status" aria-live="polite"></p>
            <div class="cle-actions">
                <button type="button" class="cle-action-button" id="cleCancel">キャンセル</button>
                <button type="button" class="cle-action-button cle-save" id="cleSave">✓ 保存して戻る</button>
            </div>
        </div>`;
    gameWrap.appendChild(overlay);

    const stage = overlay.querySelector("#cleStage");
    const selectedName = overlay.querySelector("#cleSelectedName");
    const sizeRange = overlay.querySelector("#cleSize");
    const sizeValue = overlay.querySelector("#cleSizeValue");
    const opacityRange = overlay.querySelector("#cleOpacity");
    const opacityValue = overlay.querySelector("#cleOpacityValue");
    const status = overlay.querySelector("#cleStatus");

    const descriptors = [
        { key: "move", name: "移動スティック", text: "🕹 移動", className: "cle-stick" },
        { key: "dpad", name: "方向パッド", text: "✥ 方向", className: "cle-stick" },
        { key: "shoot", name: "発射ボタン", text: "🔫 発射", className: "cle-action cle-shoot" },
        { key: "bomb", name: "爆弾ボタン", text: "💣 爆弾", className: "cle-action cle-bomb" },
        { key: "shield", name: "シールドボタン", text: "🛡 盾", className: "cle-action cle-shield" },
        { key: "skill", name: "スキルボタン", text: "✨ スキル", className: "cle-action cle-skill" },
        { key: "aim", name: "照準カーソル", text: "＋", className: "cle-aim" }
    ];
    const demoControls = new Map();
    let draft = cloneCurrentControlLayout();
    let selectedKey = "move";
    let dragging = null;

    function renderDemo() {
        for (const desc of descriptors) {
            const setting = draft[desc.key];
            const element = demoControls.get(desc.key);
            element.style.left = `${setting.x * 100}%`;
            element.style.top = `${setting.y * 100}%`;
            element.style.opacity = String(setting.opacity);
            element.style.transform = `translate(-50%, -50%) scale(${setting.size})`;
            element.classList.toggle("cle-selected", desc.key === selectedKey);
        }
        updateEditorSettings();
    }

    function updateEditorSettings() {
        const desc = descriptors.find(item => item.key === selectedKey);
        const setting = draft[selectedKey];
        selectedName.textContent = `選択中：${desc ? desc.name : selectedKey}`;
        sizeRange.value = String(Math.round(setting.size * 100));
        sizeValue.textContent = `${Math.round(setting.size * 100)}%`;
        opacityRange.value = String(Math.round(setting.opacity * 100));
        opacityValue.textContent = `${Math.round(setting.opacity * 100)}%`;
    }

    function selectControl(key) {
        if (!draft[key]) return;
        selectedKey = key;
        renderDemo();
    }

    for (const desc of descriptors) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = `cle-control ${desc.className}`;
        element.dataset.layoutKey = desc.key;
        element.textContent = desc.text;
        element.setAttribute("aria-label", `${desc.name}。ドラッグで移動`);
        demoControls.set(desc.key, element);
        stage.appendChild(element);
    }

    stage.addEventListener("pointerdown", event => {
        const element = event.target.closest("[data-layout-key]");
        if (!element || !stage.contains(element)) return;
        event.preventDefault();
        event.stopPropagation();
        const key = element.dataset.layoutKey;
        selectControl(key);
        dragging = { key, pointerId: event.pointerId };
        try { element.setPointerCapture(event.pointerId); } catch (_) {}
    }, { passive: false });

    stage.addEventListener("pointermove", event => {
        if (!dragging || event.pointerId !== dragging.pointerId) return;
        event.preventDefault();
        const rect = stage.getBoundingClientRect();
        draft[dragging.key].x = Math.max(0.06, Math.min(0.94, (event.clientX - rect.left) / rect.width));
        draft[dragging.key].y = Math.max(0.08, Math.min(0.92, (event.clientY - rect.top) / rect.height));
        renderDemo();
    }, { passive: false });

    const stopDragging = event => {
        if (dragging && (!event || event.pointerId === dragging.pointerId)) dragging = null;
    };
    stage.addEventListener("pointerup", stopDragging);
    stage.addEventListener("pointercancel", stopDragging);
    stage.addEventListener("lostpointercapture", stopDragging);

    sizeRange.addEventListener("input", () => {
        draft[selectedKey].size = Math.max(0.55, Math.min(1.70, Number(sizeRange.value) / 100));
        renderDemo();
    });
    opacityRange.addEventListener("input", () => {
        draft[selectedKey].opacity = Math.max(0.25, Math.min(1, Number(opacityRange.value) / 100));
        renderDemo();
    });

    function openEditor() {
        draft = cloneCurrentControlLayout();
        selectedKey = "move";
        status.textContent = "ボタンを指でドラッグして動かしてね。";
        renderDemo();
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden", "false");
        overlay.querySelector("#cleClose").focus({ preventScroll: true });
    }

    function closeEditor(restore) {
        dragging = null;
        if (restore) {
            draft = cloneCurrentControlLayout();
            renderDemo();
        }
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
        openButton.focus({ preventScroll: true });
    }

    openButton.addEventListener("click", openEditor);
    overlay.querySelector("#cleClose").addEventListener("click", () => closeEditor(true));
    overlay.querySelector("#cleCancel").addEventListener("click", () => closeEditor(true));
    overlay.querySelector("#cleSave").addEventListener("click", () => {
        controlLayout = normalizeControlLayout(draft);
        try {
            localStorage.setItem(CONTROL_LAYOUT_STORAGE_KEY, JSON.stringify(controlLayout));
            status.textContent = "配置をこの端末に保存しました。";
        } catch (error) {
            console.warn("操作レイアウトを保存できませんでした。", error);
            status.textContent = "このブラウザでは保存できませんでしたが、今回のページ内では配置を使います。";
        }
        applyControlLayout();
        closeEditor(false);
    });

    // Escキーでも編集画面を閉じる。配置は保存済みのものを維持する。
    overlay.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeEditor(true);
        }
    });

    renderDemo();
}

createControlLayoutEditor();
applyControlLayout();

const faceImage =
    new Image();


faceImage.src = FACE_GUEST;

// ゲストは face.png、登録ユーザーは face2.png を使用する。
// face2.png が未配置・読み込み失敗の場合は face.png に戻す。
async function setFaceForMode(isGuest) {
    faceImage.onerror = null;

    // ゲストは今まで通り face.png
    if (isGuest) {
        activeFaceId = "face2";
        activeFaceSkill = await loadSkill(activeFaceId) || await loadSkill("face2");
        activeSkillData = normalizeSkillData();
        updateSkillButton();
        faceImage.src = FACE_GUEST;
        return;
    }

    // ログインユーザーはガチャで選択中のFACEを取得
    try {
        const data = await loadFaceData(currentUser?.uid);

        const selectedFace = data?.selectedFace || "face2";
        activeFaceId = selectedFace;
        const ownedFace = (data?.faces || []).find(face => face.id === selectedFace);
        activeSkillData = normalizeSkillData({ ...ownedFace?.skill, progress: 0, totalKills: 0 });
        activeFaceSkill = await loadSkill(selectedFace) || await loadSkill("face2");
        updateSkillButton();
        const imagePath = ownedFace?.imageUrl || getGachaFaceImage(selectedFace);
        pvpLocalFaceImageUrl = imagePath;

        console.log(
            "[FACE] 使用中:",
            selectedFace,
            "画像:",
            imagePath
        );

        faceImage.onerror = () => {
            console.warn(
                "[FACE] 選択したFACEの画像を読み込めません:",
                imagePath
            );

            faceImage.onerror = null;
            faceImage.src = FACE_REGISTERED;
            pvpLocalFaceImageUrl = FACE_REGISTERED;
        };

        faceImage.src = imagePath;

    } catch (error) {
        console.warn(
            "[FACE] ガチャデータ取得失敗。初期FACEを使用します。",
            error
        );

        activeFaceId = "face2";
        activeSkillData = normalizeSkillData({ progress: 0, totalKills: 0 });
        activeFaceSkill = await loadSkill("face2");
        updateSkillButton();
        faceImage.onerror = null;
        faceImage.src = FACE_REGISTERED;
    }
}

function updateSkillButton() {
    const ready = isSkillReady(activeFaceSkill, activeSkillData);
    const required = activeFaceSkill ? getSkillRequiredKills(activeFaceSkill, activeSkillData.level) : 0;
    const label = activeFaceSkill?.name || "スキル";
    const gauge = `${Math.min(activeSkillData.progress, required)} / ${required}`;
    for (const button of [skillBtn, touchSkill]) {
        if (!button) continue;
        button.disabled = !ready || !running || paused || skillActivationBusy;
        button.classList.toggle("ready", ready);
        button.setAttribute("aria-label", `${label} ${gauge}${ready ? " 発動可能" : ""}`);
        const text = button.querySelector("span");
        if (text) text.textContent = gauge;
        if (button === skillBtn) button.childNodes[0].textContent = `✨ ${label} `;
        else button.childNodes[0].textContent = `✨ ${label}`;
    }
}

function showSkillNotice(text) {
    if (!skillNotice) return;
    skillNotice.textContent = `✨ ${text} 発動！`;
    skillNotice.classList.remove("show");
    void skillNotice.offsetWidth;
    skillNotice.classList.add("show");
    clearTimeout(showSkillNotice.timer);
    showSkillNotice.timer = setTimeout(() => skillNotice.classList.remove("show"), 1200);
}

function addSkillProgress(kills = 1) {
    if (!running || !activeFaceSkill) return;
    activeSkillData = normalizeSkillData({
        ...activeSkillData,
        progress: activeSkillData.progress + kills,
        totalKills: activeSkillData.totalKills + kills
    });
    updateSkillButton();
}

function damageSkillTargets(targets, damage) {
    let defeated = 0;
    for (const enemy of targets) {
        const index = enemies.indexOf(enemy);
        if (index < 0) continue;
        enemy.hp -= Math.max(1, Number(damage) || 1);
        boom(enemy.x, enemy.y, !!enemy.elite);
        if (enemy.hp <= 0) {
            enemies.splice(index, 1);
            defeated++;
            defeatedThisWave++;
            score += enemy.elite ? 300 : 100;
            dropItem(enemy.x, enemy.y, enemy.elite);
            combo++;
        }
    }
    if (defeated) checkWaveClear();
    return defeated;
}

function damageBossWithSkill(damage) {
    if (!boss) return;
    boss.hp -= Math.max(1, Number(damage) || 1);
    boss.hitFlash = 0.22;
    if (boss.hp <= 0) defeatBoss();
}

async function activateFaceSkill() {
    if (!running || paused || skillActivationBusy || !isSkillReady(activeFaceSkill, activeSkillData)) return;
    skillActivationBusy = true;
    updateSkillButton();
    try {
        const result = activeFaceSkill.activate({
            player,
            enemies,
            canvas,
            viewportWidth: W,
            viewportHeight: H,
            skillLevel: activeSkillData.level
        });
        if (!result?.success) return;
        showSkillNotice(`${activeFaceSkill.name} Lv.${activeSkillData.level}`);
        switch (result.type) {
            case "explosion": {
                const targets = enemies.filter(enemy => Math.hypot(enemy.x - result.x, enemy.y - result.y) <= result.radius + enemy.size * 0.5);
                damageSkillTargets(targets, result.damage);
                if (boss && Math.hypot(boss.x - result.x, boss.y - result.y) <= result.radius + boss.size * .5) damageBossWithSkill(result.damage);
                boom(result.x, result.y, true);
                showSkillNotice(`${activeFaceSkill.name} Lv.${activeSkillData.level}・${targets.length}体に命中`);
                break;
            }
            case "line_clear": {
                const attackX = result.x ?? player.x;
                const attackY = result.y ?? player.y;
                const targets = enemies
                    .filter(enemy =>
                        Math.abs(enemy.x - attackX) <= result.width / 2 + enemy.size / 2 &&
                        enemy.y - enemy.size / 2 < attackY &&
                        enemy.y + enemy.size / 2 > attackY - result.height
                    );
                damageSkillTargets(targets, result.damage);
                if (boss && Math.abs(boss.x - attackX) <= result.width / 2 + boss.size / 2 && boss.y - boss.size / 2 < attackY && boss.y + boss.size / 2 > attackY - result.height) damageBossWithSkill(result.damage);
                showSkillNotice(`${activeFaceSkill.name} Lv.${activeSkillData.level}・${targets.length}体に命中`);
                break;
            }
            case "power_up":
                rapidTimer = Math.max(rapidTimer, result.duration || 5);
                skillPowerTimer = Math.max(skillPowerTimer, result.duration || 5);
                skillDamageMultiplier = Math.max(1, Number(result.damageMultiplier) || 1);
                skillFireRateMultiplier = Math.max(1, Number(result.fireRateMultiplier) || 1);
                break;
            case "time_stop":
                damageSkillTargets([...enemies], result.damage);
                damageBossWithSkill(result.damage);
                enemyBullets = [];
                timeStopTimer = Math.max(timeStopTimer, result.duration || result.stopDuration || 2);
                break;
            case "defense":
                hp = Math.min(5, hp + (result.heal || 0));
                shields += 1;
                shieldTime = Math.max(shieldTime, result.shieldDuration || 3);
                break;
            case "bullet_counter":
                enemyBullets = [];
                damageSkillTargets(enemies.filter(enemy => Math.hypot(enemy.x - player.x, enemy.y - player.y) <= result.radius).slice(0, result.maxBullets), result.damagePerBullet);
                if (boss && Math.hypot(boss.x - player.x, boss.y - player.y) <= result.radius + boss.size / 2) damageBossWithSkill(result.damagePerBullet * result.maxBullets);
                break;
            case "black_hole":
                {
                const targets = enemies.filter(enemy => Math.hypot(enemy.x - player.x, enemy.y - player.y) <= result.radius);
                const pull = Math.max(0, Math.min(0.55, Number(result.pullPower) || 0.25));
                for (const enemy of targets) {
                    enemy.x += (player.x - enemy.x) * pull;
                    enemy.y += (player.y - enemy.y) * pull;
                }
                damageSkillTargets(targets, result.damage);
                if (boss && Math.hypot(boss.x - player.x, boss.y - player.y) <= result.radius + boss.size / 2) damageBossWithSkill(result.damage);
                enemyBullets = [];
                break;
                }
            default:
                console.warn("未対応のスキル効果:", result.type);
                return;
        }
        const consumed = consumeSkill(activeFaceSkill, activeSkillData);
        if (consumed.success) {
            activeSkillData = consumed.data;
        }
        updateHUD();
    } catch (error) {
        console.error("スキルを発動できませんでした。", error);
    } finally {
        skillActivationBusy = false;
        updateSkillButton();
    }
}

skillBtn?.addEventListener("click", activateFaceSkill);
touchSkill?.addEventListener("click", activateFaceSkill);


// 選んだ画像はこのページのメモリ内だけで使う。
// localStorage / Cookie / Firebase / サーバーへの保存・送信は行わない。
let customFaceObjectURL = null;

function createGuestImagePicker() {
    const authPanel = document.getElementById("authPanel");
    if (!authPanel || document.getElementById("faceImageControls")) return;

    const panel = document.createElement("section");
    panel.id = "faceImageControls";
    panel.style.cssText = "margin:12px auto;padding:12px;max-width:420px;border:1px solid rgba(255,255,255,.3);border-radius:12px;background:rgba(0,0,0,.3);text-align:center";

    const title = document.createElement("h3");
    title.textContent = "🖼️ 顔画像の変更";
    title.style.cssText = "margin:0 0 8px;font-size:16px";

    const description = document.createElement("p");
    description.textContent = "好きな画像を選んでゲームに使えます。";
    description.style.cssText = "font-size:12px;margin:5px 0 10px";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.setAttribute("aria-label", "ゲームで使う顔画像を選択");

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "📁 画像を選択";
    button.style.cssText = "min-height:44px;padding:10px 18px;border:0;border-radius:10px;background:#ffe600;color:#111;font-weight:900;font-size:15px;cursor:pointer;touch-action:manipulation";
    button.addEventListener("click", () => input.click());

    const preview = document.createElement("img");
    preview.alt = "選択した画像のプレビュー";
    preview.hidden = true;
    preview.style.cssText = "display:none;max-width:100px;max-height:100px;object-fit:contain;margin:10px auto 0;border:2px solid white;border-radius:10px";

    const status = document.createElement("p");
    status.id = "guestImageStatus";
    status.textContent = "画像はこのページ内だけで使用し、サーバーには送信しません。";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.cssText = "min-height:1.5em;font-size:11px;overflow-wrap:anywhere;margin:8px 0 0;color:#cfeaff";

    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return;

        if (!file.type || !file.type.startsWith("image/")) {
            status.textContent = "画像ファイルを選んでください。";
            input.value = "";
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            status.textContent = "画像は10 MB以下にしてください。";
            input.value = "";
            return;
        }

        status.textContent = "画像を読み込んでいます…";
        const candidateURL = URL.createObjectURL(file);
        const testImage = new Image();

        testImage.onload = () => {
            // 画像が正しく読み込めた場合だけゲーム内の画像を切り替える。
            const previousURL = customFaceObjectURL;
            customFaceObjectURL = candidateURL;
            faceImage.onerror = () => {
                faceImage.onerror = null;
                status.textContent = "画像をゲームに読み込めませんでした。別の画像を試してください。";
            };
            faceImage.onload = () => {
                faceImage.onload = null;
                faceImage.onerror = null;
                if (previousURL) URL.revokeObjectURL(previousURL);
            };
            faceImage.src = candidateURL;

            preview.src = candidateURL;
            preview.hidden = false;
            preview.style.display = "block";
            status.textContent = "設定しました。画像はサーバーに保存・送信されません。ページを閉じると元に戻ります。";
            input.value = "";
        };
        testImage.onerror = () => {
            URL.revokeObjectURL(candidateURL);
            status.textContent = "画像を読み込めませんでした。別の画像を選んでください。";
            input.value = "";
        };
        testImage.src = candidateURL;
    });

    panel.append(title, description, button, input, preview, status);
    authPanel.appendChild(panel);
}


/* ==================================================
   SCREEN
================================================== */

let W;

let H;

let dpr;


/* ==================================================
   OBJECTS
================================================== */

let player;

let bullets = [];

let enemies = [];

let enemyBullets = [];

let particles = [];

let stars = [];

let boss = null;

let gimmick = null;


/* ==================================================
   STATE
================================================== */

let score = 0;

let hp = 5;

let combo = 0;

let wave = 1;

let bombs = 2;

let shields = 2;

let defeatedThisWave = 0;

let requiredKills = 8;

let waveRunning = false;

let running = false;
let paused = false;

// 管理者デバッグ設定（このページ内だけ有効）
let adminMode = false;
let adminStartWave = 1;
let adminForceBoss = false;


/* ==================================================
   TIMERS
================================================== */

let shootCooldown = 0;

let damageCooldown = 0;

let shieldTime = 0;
let timeStopTimer = 0;

let bombCooldown = 0;

let spawnTimer = 0;

let bossSpawnTimer = 0;

let bossAttackTimer = 0;

let gimmickTimer = 0;

let waveTextTimer = 0;

let shake = 0;

let flash = 0;

// キーボード入力
const keys = {};

let lastTime = 0;

// アイテム
let items = [];
let powerLevel = 1;
let rapidTimer = 0;
let skillPowerTimer = 0;
let skillDamageMultiplier = 1;
let skillFireRateMultiplier = 1;
let pierceTimer = 0;
let magnetTimer = 0;
let scoreBoostTimer = 0;


/* ==================================================
   SETTINGS
================================================== */

const MAX_BOMB_COOLDOWN = 8;


/* ==================================================
   WAVE KILLS
================================================== */

function getRequiredKills() {

    return 7 +
        wave * 2;

}


/* ==================================================
   RESIZE
================================================== */

function resize() {

    const rect =
        gameWrap.getBoundingClientRect();


    dpr =
        Math.min(
            window.devicePixelRatio || 1,
            2
        );


    W =
        rect.width;


    H =
        rect.height;


    canvas.width =
        W * dpr;


    canvas.height =
        H * dpr;


    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );


    stars =
        Array.from(
            {
                length: 110
            },
            () => ({

                x:
                    Math.random() * W,

                y:
                    Math.random() * H,

                s:
                    .5 +
                    Math.random() * 2,

                v:
                    20 +
                    Math.random() * 110

            })
        );

}


window.addEventListener(
    "resize",
    () => {
        resize();
        if (typeof applyControlLayout === "function") applyControlLayout();
    }
);

resize();


/* ==================================================
   RESET
================================================== */

function resetGame() {

    // スキルゲージの撃破数は1試合限り。レベル・重複成長は維持する。
    activeSkillData = normalizeSkillData({
        ...activeSkillData,
        progress: 0,
        totalKills: 0
    });
    updateSkillButton();

    score = 0;

    hp = 5;

    combo = 0;

    wave = Math.max(1, Math.floor(Number(adminStartWave) || 1));

    bombs = 2;

    shields = 2;


    defeatedThisWave = 0;

    requiredKills =
        getRequiredKills();


    bullets = [];

    enemies = [];

    enemyBullets = [];

    particles = [];
    items = [];
    powerLevel = 1;
    rapidTimer = 0;
    skillPowerTimer = 0;
    skillDamageMultiplier = 1;
    skillFireRateMultiplier = 1;
    pierceTimer = 0;
    magnetTimer = 0;
    scoreBoostTimer = 0;

    boss = null;

    gimmick = null;


    shootCooldown = 0;

    damageCooldown = 0;

    shieldTime = 0;
    timeStopTimer = 0;

    bombCooldown = 0;

    spawnTimer = .4;

    bossSpawnTimer = 0;

    bossAttackTimer = 1;

    gimmickTimer = 4;

    waveTextTimer = 2;

    shake = 0;

    flash = 0;


    waveRunning = true;


    player = {

        x:
            W / 2,

        y:
            H - 120,

        w:
            82,

        h:
            82,

        speed:
            430

    };


    updateHUD();

}


/* ==================================================
   HUD
================================================== */

function updateHUD() {

    updateSkillButton();

    document.getElementById(
        "score"
    ).textContent =
        score;


    document.getElementById(
        "wave"
    ).textContent =
        wave;


    const hpEl = document.getElementById("hp");
    if (hpEl) hpEl.textContent = hp + " / 5";

    const hpFill = document.getElementById("hpFill");
    if (hpFill) {
        const hpPercent = Math.max(0, Math.min(100, hp / 5 * 100));
        hpFill.style.width = hpPercent + "%";
        hpFill.style.background = hp <= 1 ? "#ff3030" : hp <= 2 ? "#ff9d25" : "#35e66a";
    }

    const hpHearts = document.getElementById("hpHearts");
    if (hpHearts) hpHearts.textContent = "❤️".repeat(Math.max(0, hp)) + "🖤".repeat(Math.max(0, 5 - hp));


    document.getElementById(
        "combo"
    ).textContent =
        combo;


    document.getElementById(
        "bombCount"
    ).textContent =
        bombs;


    document.getElementById(
        "shieldCount"
    ).textContent =
        shields;


    /* ==========================
       WAVE
    ========================== */

    const waveProgress =
        document.getElementById(
            "waveProgress"
        );


    if (boss) {

        waveProgress.style.display =
            "none";

    }

    else {

        waveProgress.style.display =
            "block";


        const percent =
            Math.min(
                100,
                defeatedThisWave /
                requiredKills *
                100
            );


        document.getElementById(
            "waveProgressFill"
        ).style.width =
            percent + "%";


        document.getElementById(
            "waveProgressText"
        ).textContent =

            "撃破 " +
            defeatedThisWave +
            " / " +
            requiredKills;

    }


    /* ==========================
       BOMB
    ========================== */

    const bombBtn =
        document.getElementById(
            "bombBtn"
        );


    if (
        bombCooldown > 0
    ) {

        document.getElementById(
            "bombCool"
        ).textContent =

            "あと " +
            bombCooldown.toFixed(1) +
            "s";


        bombBtn.disabled =
            true;

    }

    else {

        document.getElementById(
            "bombCool"
        ).textContent =
            "READY";


        bombBtn.disabled =
            bombs <= 0;

    }


    /* ==========================
       SHIELD
    ========================== */

    document.getElementById(
        "shieldBtn"
    ).disabled =

        shields <= 0 ||
        shieldTime > 0;


    /* ==========================
       BOSS
    ========================== */

    const bossBar =
        document.getElementById(
            "bossBar"
        );


    if (boss) {

        bossBar.style.display =
            "block";


        const percent =
            Math.max(
                0,
                boss.hp /
                boss.maxHp *
                100
            );


        document.getElementById(
            "bossFill"
        ).style.width =
            percent + "%";

    }

    else {

        bossBar.style.display =
            "none";

    }


    /* ==========================
       GIMMICK
    ========================== */

    const gimmickUI =
        document.getElementById(
            "bossGimmick"
        );


    gimmickUI.style.display =

        gimmick
            ? "block"
            : "none";

}


/* ==================================================
   START
================================================== */

function startGame() {

    if (pvpRoomCode && !pvpStarted) {
        setPvpStatus("合言葉ルームの待機中です。対戦をキャンセルするか、フレンドの参加を待ってください。");
        return;
    }

    // ゲストはログインユーザーがいなくてもゲームを開始できる。
    if (!guestMode && (!currentUser || !authReady)) {
        window.location.replace("./login.html");
        return;
    }

    runRecorded = false;
    runRecordPromise = null;
    pvpLocalDead = false;
    paused = false;
    if (pauseOverlay) {
        pauseOverlay.style.display = "none";
        pauseOverlay.setAttribute("aria-hidden", "true");
    }
    if (pauseGameBtn) {
        pauseGameBtn.style.display = "none";
        pauseGameBtn.classList.remove("paused");
        pauseGameBtn.textContent = "⏸ 一時停止";
        pauseGameBtn.setAttribute("aria-label", "一時停止");
    }
    resize();
    resetGame();

    if (adminForceBoss) {
        if (wave % 5 !== 0) {
            wave = Math.ceil(wave / 5) * 5;
            if (wave < 5) wave = 5;
            requiredKills = getRequiredKills();
        }
        startBoss();
        adminForceBoss = false;
    }

    // 描画の初期化に成功してから開始画面を隠す
    try {
        draw();
    } catch (error) {
        console.error("ゲーム開始時の描画エラー:", error);
        running = false;
        const start = document.getElementById("start");
        const small = start ? start.querySelector(".small") : null;
        if (small) {
            small.innerHTML = "初期化に失敗しました。face.png がHTMLと同じフォルダにあるか確認してください。";
        }
        if (start) start.style.display = "flex";
        return;
    }

    running = true;
    updateSkillButton();
    applyControlLayout();
    if (gameCursor && touchMode) {
        renderGameCursorPosition();
        gameCursor.style.display = "block";
    }
    document.getElementById("start").style.display = "none";
    document.getElementById("quitGameBtn").style.display = "block";
    if (pauseGameBtn) pauseGameBtn.style.display = "block";
    hideQuitConfirm();
    document.getElementById("gameover").style.display = "none";
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}



function showQuitConfirm() {
    if (!running) return;
    const modal = document.getElementById("quitConfirm");
    if (modal) {
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
    }
}

function hideQuitConfirm() {
    const modal = document.getElementById("quitConfirm");
    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
}

function clearHeldInputs() {
    Object.keys(keys).forEach(key => { keys[key] = false; });
    touchFireHeld = false;
    resetJoystick();
    joystickPointerId = shootPointerId = bombPointerId = shieldPointerId = null;
    if (touchShoot) touchShoot.classList.remove("pressed");
    if (touchBomb) touchBomb.classList.remove("pressed");
    if (touchShield) touchShield.classList.remove("pressed");
}

function syncPauseButton() {
    if (!pauseGameBtn) return;
    pauseGameBtn.textContent = paused ? "▶ 再開" : "⏸ 一時停止";
    pauseGameBtn.classList.toggle("paused", paused);
    pauseGameBtn.setAttribute("aria-label", paused ? "ゲームを再開" : "ゲームを一時停止");
}

function pauseGame() {
    if (!running || paused || (pvpStarted && !pvpFinished)) return;
    paused = true;
    clearHeldInputs();
    if (pauseOverlay) {
        pauseOverlay.style.display = "flex";
        pauseOverlay.setAttribute("aria-hidden", "false");
    }
    syncPauseButton();
}

function resumeGame() {
    if (!running || !paused) return;
    paused = false;
    clearHeldInputs();
    if (pauseOverlay) {
        pauseOverlay.style.display = "none";
        pauseOverlay.setAttribute("aria-hidden", "true");
    }
    lastTime = performance.now();
    syncPauseButton();
}

function togglePause() {
    if (!running) return;
    if (paused) resumeGame();
    else pauseGame();
}

async function quitGame() {
    if (pvpStarted && !pvpFinished) {
        pvpLocalDead = true;
    } else if (!pvpStarted) {
        try {
            await recordCurrentRun();
        } catch (error) {
            console.error("ゲーム結果の保存に失敗:", error);
        }
    }
    hideQuitConfirm();
    paused = false;
    clearHeldInputs();
    if (pauseOverlay) {
        pauseOverlay.style.display = "none";
        pauseOverlay.setAttribute("aria-hidden", "true");
    }
    if (pauseGameBtn) pauseGameBtn.style.display = "none";
    running = false;
    if (pvpStarted && !pvpFinished) await syncPvpPlayerState();
    if (gameCursor) gameCursor.style.display = "none";
    const quitBtn = document.getElementById("quitGameBtn");
    if (quitBtn) quitBtn.style.display = "none";
    document.getElementById("bossBar").style.display = "none";
    document.getElementById("bossGimmick").style.display = "none";
    document.getElementById("gameover").style.display = "none";
    document.getElementById("start").style.display = "flex";
    if (pvpStarted) await leavePvpRoom();
}

async function gameOver() {
    if (pvpStarted) {
        pvpLocalDead = true;
    } else {
        try {
            await recordCurrentRun();
        } catch (error) {
            console.error("ゲーム結果の保存に失敗:", error);
        }
    }

    running = false;
    if (pvpStarted) await syncPvpPlayerState();
    paused = false;
    clearHeldInputs();
    if (pauseOverlay) {
        pauseOverlay.style.display = "none";
        pauseOverlay.setAttribute("aria-hidden", "true");
    }
    if (pauseGameBtn) pauseGameBtn.style.display = "none";
    const quitBtn = document.getElementById("quitGameBtn");
    if (quitBtn) quitBtn.style.display = "none";
    hideQuitConfirm();


    document.getElementById(
        "finalScore"
    ).textContent =
        score;


    document.getElementById(
        "finalWave"
    ).textContent =
        wave;


    document.getElementById(
        "comment"
    ).textContent =

        score > 15000

            ? "顔面界の伝説になりました。"

            : score > 7000

            ? "かなり長生きしました。"

            : "顔に敗北しました。";

    if (pvpStarted) {
        const message = document.getElementById("pvpResultMessage");
        if (message) {
            message.hidden = false;
            message.textContent = pvpOpponentState?.alive
                ? "撃破されました。フレンドの勝ちです。"
                : "対戦相手の結果を待っています…";
        }
    }


    document.getElementById(
        "gameover"
    ).style.display =
        "flex";

}


/* ==================================================
   SHOOT
================================================== */

function shoot() {

    if (!running)
        return;


    if (shootCooldown > 0)
        return;


    shootCooldown =
        Math.max(.045, ((rapidTimer > 0 || (pvpStarted && pvpRapidFireActive)) ? .11 : .28) / skillFireRateMultiplier);


    bullets.push({

        x:
            player.x,

        y:
            player.y - 48,

        v:
            850,

        r:
            9,

        damage:
            Math.max(1, Math.round(powerLevel * skillDamageMultiplier)),

        pierce:
            pierceTimer > 0

    });

}


/* ==================================================
   BOMB
================================================== */

function useBomb() {

    if (!running)
        return;


    if (bombs <= 0)
        return;


    if (bombCooldown > 0)
        return;


    bombs--;

    bombCooldown =
        MAX_BOMB_COOLDOWN;


    if (boss) {

        // シールド中は爆弾でも本体にダメージを与えない
        if (gimmick && gimmick.type === "shield") {
            score += 300;
            boom(boss.x, boss.y, true);
        } else {
            boss.hp -= 150;
            score += 1500;
        }


        boom(
            boss.x,
            boss.y,
            true
        );


        if (
            boss.hp <= 0
        ) {

            defeatBoss();

        }

    }

    else {

        const count =
            enemies.length;


        for (
            const enemy of enemies
        ) {

            boom(
                enemy.x,
                enemy.y,
                true
            );

        }


        defeatedThisWave +=
            count;


        score +=
            count * 150;


        enemies = [];


        combo += count;


        checkWaveClear();

    }


    shake = 30;

    flash = .25;


    updateHUD();

}


/* ==================================================
   SHIELD
================================================== */

function useShield() {

    if (!running)
        return;


    if (shields <= 0)
        return;


    if (shieldTime > 0)
        return;


    shields--;

    shieldTime = 5;


    updateHUD();

}


/* ==================================================
   SPAWN ENEMY
================================================== */

function spawnEnemy() {

    const size =
        48 +
        Math.random() * 45;


    const elite =
        wave >= 3 &&
        Math.random() <
        Math.min(
            .3,
            wave * .035
        );


    enemies.push({

        x:
            size / 2 +
            Math.random() *
            (W - size),

        y:
            -size,

        size:

            size,

        v:

            80 +
            Math.random() *
            90 +
            wave * 6,

        wob:

            Math.random() *
            Math.PI *
            2,

        hp:

            elite
                ? 2
                : 1,

        elite:

            elite,

        shootTimer:

            1.5 +
            Math.random() *
            2.5

    });

}


/* ==================================================
   ITEMS
================================================== */

const ITEM_TYPES = [
    { id: "heal",    label: "回復", icon: "+", color: "#39e66b" },
    { id: "heal2",   label: "大回復", icon: "++", color: "#00ff9d" },
    { id: "power",   label: "攻撃UP", icon: "P", color: "#ffe600" },
    { id: "shield",  label: "盾+1", icon: "S", color: "#58e8ff" },
    { id: "bomb",    label: "爆弾+1", icon: "B", color: "#ff9b32" },
    { id: "rapid",   label: "連射", icon: "R", color: "#ff5de4" },
    { id: "pierce",  label: "貫通", icon: "P", color: "#b58cff" },
    { id: "magnet",  label: "磁石", icon: "M", color: "#ff72a8" },
    { id: "score",   label: "1000点", icon: "1K", color: "#c77dff" },
    { id: "double",  label: "得点2倍", icon: "x2", color: "#ffffff" }
];

function dropItem(x, y, elite = false) {
    // 通常敵はかなり低確率、エリートだけ少し高め
    const chance = elite ? 0.32 : 0.08;
    if (Math.random() > chance) return;

    const roll = Math.random();
    let type;
    if (roll < .16) type = ITEM_TYPES[0];
    else if (roll < .22) type = ITEM_TYPES[1];
    else if (roll < .34) type = ITEM_TYPES[2];
    else if (roll < .44) type = ITEM_TYPES[3];
    else if (roll < .52) type = ITEM_TYPES[4];
    else if (roll < .62) type = ITEM_TYPES[5];
    else if (roll < .72) type = ITEM_TYPES[6];
    else if (roll < .81) type = ITEM_TYPES[7];
    else if (roll < .89) type = ITEM_TYPES[8];
    else if (roll < .96) type = ITEM_TYPES[9];
    else type = ITEM_TYPES[9];

    // 回復系はHPが減っている場合だけ出現。満タンなら有用な非回復アイテムに置き換える。
    if (hp >= 5 && (type.id === "heal" || type.id === "heal2")) {
        const alternatives = ITEM_TYPES.filter(entry => entry.id !== "heal" && entry.id !== "heal2");
        type = alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    items.push({
        x, y,
        vy: 55 + Math.random() * 25,
        type: type.id,
        label: type.label,
        icon: type.icon,
        color: type.color,
        life: 12,
        phase: Math.random() * Math.PI * 2
    });
}

function spawnBossSupply() {
    if (!boss) return;

    const ids = ["power", "shield", "bomb", "rapid", "pierce", "magnet", "double"];
    if (hp < 5) ids.push("heal");
    if (hp <= 3) ids.push("heal2");

    const id = ids[Math.floor(Math.random() * ids.length)];
    const type = ITEM_TYPES.find(entry => entry.id === id) || ITEM_TYPES[2];
    const minX = Math.min(100, W * .18);
    const maxX = Math.max(minX + 1, W - minX);

    items.push({
        x: minX + Math.random() * (maxX - minX),
        y: Math.max(205, boss.y + boss.size * .75),
        vy: 34,
        type: type.id,
        label: `補給：${type.label}`,
        icon: type.icon,
        color: "#45f5ff",
        life: 18,
        phase: Math.random() * Math.PI * 2,
        bossSupply: true
    });

    let notice = document.getElementById("bossSupplyNotice");
    if (!notice && gameWrap) {
        notice = document.createElement("div");
        notice.id = "bossSupplyNotice";
        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");
        gameWrap.appendChild(notice);
    }
    if (notice) {
        notice.textContent = `📦 補給チャンス！ ${type.label} が出現！ 回収しよう`;
        notice.style.display = "block";
        bossSupplyNoticeTimer = 3.2;
    }
}

let bossSupplyNoticeTimer = 0;

function collectItem(item) {
    switch (item.type) {
        case "heal":
            hp = Math.min(5, hp + 1);
            break;
        case "heal2":
            hp = Math.min(5, hp + 2);
            break;
        case "power":
            powerLevel = Math.min(5, powerLevel + 1);
            break;
        case "shield":
            shields++;
            break;
        case "bomb":
            bombs++;
            break;
        case "rapid":
            rapidTimer = Math.max(rapidTimer, 8);
            break;
        case "pierce":
            pierceTimer = Math.max(pierceTimer, 8);
            break;
        case "magnet":
            magnetTimer = Math.max(magnetTimer, 8);
            break;
        case "score":
            score += 1000;
            break;
        case "double":
            scoreBoostTimer = Math.max(scoreBoostTimer, 8);
            break;
    }

    boom(item.x, item.y);
}

function updateItems(dt) {
    timeStopTimer = Math.max(0, timeStopTimer - dt);
    rapidTimer = Math.max(0, rapidTimer - dt);
    skillPowerTimer = Math.max(0, skillPowerTimer - dt);
    if (skillPowerTimer === 0) {
        skillDamageMultiplier = 1;
        skillFireRateMultiplier = 1;
    }
    pierceTimer = Math.max(0, pierceTimer - dt);
    magnetTimer = Math.max(0, magnetTimer - dt);
    scoreBoostTimer = Math.max(0, scoreBoostTimer - dt);

    for (const item of items) {
        item.y += item.vy * dt;
        item.life -= dt;
        item.phase += dt * 4;

        if (magnetTimer > 0) {
            const dx = player.x - item.x;
            const dy = player.y - item.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < 260) {
                item.x += dx / d * 360 * dt;
                item.y += dy / d * 360 * dt;
            }
        }

        const pickupRadius = item.bossSupply ? 52 : 42;
        if (Math.hypot(player.x - item.x, player.y - item.y) < pickupRadius) {
            collectItem(item);
            item.life = -1;
        }
    }

    items = items.filter(item =>
        item.life > 0 && item.y < H + 70
    );
}

/* ==================================================
   ENEMY SHOOT
================================================== */

function enemyShoot(enemy) {

    const angle =
        Math.atan2(

            player.y -
            enemy.y,

            player.x -
            enemy.x

        );


    const speed =
        190 +
        wave * 4;


    enemyBullets.push({

        x:
            enemy.x,

        y:
            enemy.y,

        vx:
            Math.cos(
                angle
            ) *
            speed,

        vy:
            Math.sin(
                angle
            ) *
            speed,

        r:
            6,

        life:
            5,

        kind:
            "enemy"

    });

}


/* ==================================================
   START BOSS
================================================== */

function startBoss() {
    enemies = [];
    enemyBullets = [];

    const bossLevel = Math.floor(wave / 5);
    const names = [
        "顔面大魔王",
        "超顔面機神",
        "顔面終焉王",
        "顔面Ω"
    ];
    const maxHP = 900 + wave * 220 + Math.max(0, bossLevel - 1) * 450;

    boss = {
        x: W / 2,
        y: 135,
        size: bossLevel >= 3 ? 155 : 135,
        maxHp: maxHP,
        hp: maxHP,
        dir: 1,
        moveTimer: 0,
        attackTimer: bossLevel >= 2 ? .9 : 1.4,
        gimmickCooldown: bossLevel === 1 ? 2.5 : .9,
        hitFlash: 0,
        enraged: false,
        level: bossLevel,
        name: names[Math.min(bossLevel - 1, names.length - 1)],
        phase: 0,
        gimmickCount: 0,
        attackCount: 0,
        supplyTimer: 7 + Math.random() * 2.5,
        supplyCount: 0
    };

    gimmick = null;

    document.getElementById("bossName").textContent =
        "☠️ WAVE " + wave + " 「" + boss.name + "」";

    waveTextTimer = 3;
    updateHUD();
}


/* ==================================================
   BOSS GIMMICK
================================================== */

function spawnGimmick() {
    if (!boss || gimmick) return;

    const level = boss.level;
    const basic = ["weak", "moving", "shield", "pulse"];
    const advanced = ["weak", "moving", "shield", "pulse", "clock", "ring", "decoy", "clone", "overheat"];
    const extreme = ["weak", "moving", "shield", "pulse", "clock", "ring", "decoy", "rain", "cross", "clone", "overheat", "bombcore"];
    const pool = level === 1 ? basic : level === 2 ? advanced : extreme;
    // 各ボスの最初のギミックは確実にシールド解除にする
    const type = (boss.gimmickCount === 0)
        ? "shield"
        : pool[Math.floor(Math.random() * pool.length)];

    const data = {
        weak:     { title: "⚠ 弱点出現", text: "黄色い弱点を5回撃て！", hp: 5, life: 8 },
        moving:   { title: "⚠ 高速弱点", text: "動く弱点を10回撃て！", hp: 10, life: 15 },
        shield:   { title: "🛡 シールド解除", text: "青いコアを6回撃ってシールドを破壊！", hp: 6, life: 12 },
        clock:    { title: "⚠ 時間制限", text: "3.2秒以内に10回撃て！", hp: 10, life: 3.2 },
        ring:     { title: "⚠ リングギミック", text: "中心のコアを8回撃て！", hp: 8, life: 6 },
        decoy:    { title: "⚠ 本物を探せ！", text: "赤いコアだけを撃て！", hp: 5, life: 5 },
        rain:     { title: "⚠ 弾幕ギミック", text: "黄色コアを9回撃て！", hp: 9, life: 6 },
        cross:    { title: "⚠ 十字ギミック", text: "十字の中心を10回撃て！", hp: 10, life: 6 },
        clone:    { title: "🟣 分身ギミック", text: "3体の分身から本物だけを3回撃て！", hp: 3, life: 10 },
        overheat: { title: "🔥 オーバーヒート", text: "熱ゲージを下げてボスをオーバーヒートさせろ！", hp: 12, life: 10 },
        bombcore: { title: "💣 爆弾コア", text: "緑コア3個だけを撃て！赤を撃つと失敗！", hp: 3, life: 9 },
        pulse:    { title: "🟢 タイミングギミック", text: "緑に光っている間だけ撃て！赤で撃つと反撃！", hp: 7, life: 11 }
    }[type];

    gimmick = {
        type,
        x: 130 + Math.random() * Math.max(40, W - 260),
        // ボス本体と重ならないよう、下側に出す
        y: 285 + Math.random() * 100,
        radius: type === "ring" ? 42 : 34,
        hp: data.hp,
        maxHp: data.hp,
        life: data.life,
        pulse: 0,
        hits: 0,
        dir: Math.random() < .5 ? -1 : 1,
        targets: [],
        actualIndex: 0,
        heat: 100,
        maxHeat: 100,
        open: false
    };

    if (type === "clone") {
        gimmick.targets = [
            { x: gimmick.x - 115, y: gimmick.y + 10, real: false },
            { x: gimmick.x,       y: gimmick.y - 5,  real: false },
            { x: gimmick.x + 115, y: gimmick.y + 10, real: false }
        ];
        gimmick.actualIndex = Math.floor(Math.random() * 3);
        gimmick.targets[gimmick.actualIndex].real = true;
    }

    if (type === "bombcore") {
        gimmick.targets = [
            { x: gimmick.x - 95, y: gimmick.y, real: true },
            { x: gimmick.x,      y: gimmick.y - 35, real: true },
            { x: gimmick.x + 95, y: gimmick.y, real: false }
        ];
    }

    document.getElementById("gimmickTitle").textContent = data.title;
    document.getElementById("gimmickText").textContent = data.text;
    document.getElementById("gimmickTitle").style.color =
        type === "shield" ? "#168cff" :
        type === "overheat" ? "#ff7b24" :
        type === "clone" ? "#c35cff" :
        type === "bombcore" ? "#35e56d" : "#ffe600";
    document.getElementById("gimmickText").style.color = type === "shield" ? "#9ed5ff" : "#fff";
}


/* ==================================================
   GIMMICK HIT
================================================== */

function hitGimmick(targetIndex = -1) {
    if (!gimmick || !boss) return;

    // タイミングギミック：緑に光っている時間だけ有効。赤い間に撃つと反撃される。
    if (gimmick.type === "pulse" && !gimmick.open) {
        score = Math.max(0, score - 50);
        const angle = Math.atan2(player.y - gimmick.y, player.x - gimmick.x);
        enemyBullets.push({
            x: gimmick.x, y: gimmick.y,
            vx: Math.cos(angle) * (220 + boss.level * 18),
            vy: Math.sin(angle) * (220 + boss.level * 18),
            r: 7, life: 4, kind: "boss"
        });
        boom(gimmick.x, gimmick.y);
        return;
    }

    // 分身: 本物だけが正解
    if (gimmick.type === "clone") {
        if (targetIndex !== gimmick.actualIndex) {
            score = Math.max(0, score - 100);
            bossAttack();
            shake = 10;
            boom(gimmick.targets[targetIndex].x, gimmick.targets[targetIndex].y);
            return;
        }
    }

    // 爆弾コア: 赤を撃ったら即失敗
    if (gimmick.type === "bombcore" && targetIndex >= 0) {
        const target = gimmick.targets[targetIndex];
        if (!target.real) {
            boss.hp = Math.min(boss.maxHp, boss.hp + 220 + boss.level * 50);
            gimmick = null;
            boss.gimmickCooldown = boss.level === 1 ? 3 : 1.2;
            flash = .35;
            shake = 22;
            for (let i = 0; i < 20; i++) boom(boss.x, boss.y, true);
            return;
        }
    }

    gimmick.hp--;
    gimmick.hits++;
    if (gimmick.type === "overheat") {
        gimmick.heat = Math.max(0, 100 - (gimmick.hits / gimmick.maxHp) * 100);
    }
    score += 150;
    boom(gimmick.x, gimmick.y);

    if (boss.level >= 2 && Math.random() < .22) bossAttack();

    if (gimmick.hp <= 0) {
        const damage = gimmick.type === "overheat"
            ? 650 + wave * 55 + boss.level * 250
            : 350 + wave * 30 + boss.level * 180;
        boss.hp -= damage;
        score += 2500 + boss.level * 1000;
        combo += 5 + boss.level * 2;
        shake = 35;
        flash = .3;

        for (let i = 0; i < 35 + boss.level * 12; i++) {
            boom(boss.x + (Math.random() - .5) * 130, boss.y + (Math.random() - .5) * 130, true);
        }

        gimmick = null;
        boss.gimmickCooldown = boss.level === 1 ? 4.5 : boss.level === 2 ? 1.8 : 1;
        if (boss.hp <= 0) defeatBoss();
    }
}


/* ==================================================
   BOSS UPDATE
================================================== */

function updateBoss(dt) {
    if (!boss) return;
    if (timeStopTimer > 0) return;

    boss.moveTimer += dt;
    boss.attackTimer -= dt;
    boss.gimmickCooldown -= dt;
    boss.phase += dt;

    // ボス戦中に一定時間ごとに補給を投下。HPが減っている時だけ回復が候補に入る。
    boss.supplyTimer -= dt;
    if (boss.supplyTimer <= 0) {
        spawnBossSupply();
        boss.supplyCount++;
        boss.supplyTimer = boss.enraged ? 9.5 + Math.random() * 2 : 12 + Math.random() * 3;
    }
    if (bossSupplyNoticeTimer > 0) {
        bossSupplyNoticeTimer -= dt;
        if (bossSupplyNoticeTimer <= 0) {
            const notice = document.getElementById("bossSupplyNotice");
            if (notice) notice.style.display = "none";
        }
    }

    // ボスごとに移動が激しくなる
    const moveSpeed = 70 + wave * 2 + boss.level * 35;
    boss.x += boss.dir * moveSpeed * dt;
    const bossMinX = boss.size * .62;
    const bossMaxX = Math.max(bossMinX, W - boss.size * .62);
    if (boss.x <= bossMinX) {
        boss.x = bossMinX;
        boss.dir = 1;
    } else if (boss.x >= bossMaxX) {
        boss.x = bossMaxX;
        boss.dir = -1;
    }

    // 第2ボス以降は上下にも揺れる
    if (boss.level >= 2) {
        boss.y = 135 + Math.sin(boss.phase * 1.7) * (boss.level >= 3 ? 45 : 25);
    }
    boss.y = Math.max(boss.size * .62, Math.min(H * .38, boss.y));

    if (boss.attackTimer <= 0) {
        bossAttack();
        boss.attackTimer = boss.level >= 3 ? .55 : boss.level === 2 ? .7 : (boss.enraged ? .8 : 1.5);
    }

    if (boss.hp < boss.maxHp * .5) boss.enraged = true;

    // 第1ボス: ギミックを少し増やす
    // 第2ボス: 短い間隔で大量のギミックを切り替える
    // 第3ボス以降: さらに短い間隔
    if (boss.gimmickCooldown <= 0 && !gimmick) {
        spawnGimmick();
        boss.gimmickCount++;
        boss.gimmickCooldown = boss.level === 1 ? (boss.enraged ? 3.5 : 5) : boss.level === 2 ? 1.4 : .8;
    }

    if (gimmick) {
        gimmick.life -= dt;
        gimmick.pulse += dt;

        // 移動ギミック
        if (gimmick.type === "moving") {
            gimmick.x += gimmick.dir * 150 * dt;
            if (gimmick.x < 70 || gimmick.x > W - 70) gimmick.dir *= -1;
            gimmick.y = 315 + Math.sin(gimmick.pulse * 2.5) * 55;
        }

        // リングは外周が回転する
        if (gimmick.type === "ring") {
            gimmick.x = W / 2 + Math.cos(gimmick.pulse * 1.7) * Math.min(190, W * .25);
            gimmick.y = 245 + Math.sin(gimmick.pulse * 1.7) * 65;
        }

        if (gimmick.type === "clone") {
            const sway = Math.sin(gimmick.pulse * 2.2) * 18;
            gimmick.targets.forEach((t, i) => {
                const base = i - 1;
                t.x = gimmick.x + base * 115;
                t.y = gimmick.y + (i === 1 ? -8 : 12) + sway;
            });
        }

        if (gimmick.type === "bombcore") {
            const bob = Math.sin(gimmick.pulse * 3) * 12;
            gimmick.targets[0].x = gimmick.x - 95;
            gimmick.targets[0].y = gimmick.y + bob;
            gimmick.targets[1].x = gimmick.x;
            gimmick.targets[1].y = gimmick.y - 40 - bob * .4;
            gimmick.targets[2].x = gimmick.x + 95;
            gimmick.targets[2].y = gimmick.y + bob;
        }

        if (gimmick.type === "overheat") {
            gimmick.heat = Math.min(100, gimmick.heat + dt * 2.2);
        }

        // タイミングギミックは約1.8秒周期で短い攻撃チャンスが開く。
        if (gimmick.type === "pulse") {
            const isOpen = (gimmick.pulse % 1.8) < 0.62;
            if (isOpen !== gimmick.open) {
                gimmick.open = isOpen;
                const title = document.getElementById("gimmickTitle");
                const text = document.getElementById("gimmickText");
                if (title) title.textContent = isOpen ? "🟢 攻撃チャンス！" : "🔴 反撃状態";
                if (text) text.textContent = isOpen ? "緑のコアを今すぐ撃て！" : "赤い間に撃つと反撃弾！";
            }
        }

        // 弾幕ギミック
        if (gimmick.type === "rain" && Math.random() < dt * 3) {
            enemyBullets.push({
                x: gimmick.x + (Math.random() - .5) * 80, y: gimmick.y - 20,
                vx: (Math.random() - .5) * 80, vy: 230 + boss.level * 25,
                r: 7, life: 4, kind: "boss"
            });
        }

        if (gimmick.type === "cross" && Math.random() < dt * 1.8) {
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2;
                enemyBullets.push({
                    x: gimmick.x, y: gimmick.y,
                    vx: Math.cos(a) * 180, vy: Math.sin(a) * 180,
                    r: 7, life: 3.5, kind: "boss"
                });
            }
        }

        if (gimmick.life <= 0) {
            // 時計ギミックだけ失敗時の回復量を大きくする
            const heal = gimmick.type === "clock" ? 180 + boss.level * 60 : 90 + boss.level * 25;
            boss.hp = Math.min(boss.maxHp, boss.hp + heal);
            gimmick = null;
            boss.gimmickCooldown = boss.level === 1 ? 2.5 : .7;
        }
    }

    if (playerHit(boss.x, boss.y, boss.size * .47)) {
        takeDamage(boss.level >= 2 ? 2 : 2);
        player.y = Math.min(H - 75, player.y + 120);
    }

    bossSpawnTimer -= dt;
    if (bossSpawnTimer <= 0) {
        const maxAdds = boss.level >= 3 ? 5 : boss.level === 2 ? 4 : 3;
        if (enemies.length < maxAdds) spawnEnemy();
        bossSpawnTimer = boss.level >= 3 ? 1.8 : boss.level === 2 ? 2.5 : 3.5;
    }

    boss.hitFlash -= dt;
}


/* ==================================================
   PLAYER HIT
================================================== */

function playerHit(
    x,
    y,
    radius
) {

    return Math.hypot(

        player.x - x,

        player.y - y

    )
    <
    radius + 30;

}


/* ==================================================
   ENEMY BULLETS
================================================== */

function updateEnemyBullets(dt) {

    for (
        const bullet
        of enemyBullets
    ) {

        bullet.x +=
            bullet.vx *
            dt;


        bullet.y +=
            bullet.vy *
            dt;


        bullet.life -=
            dt;

        // 自分の弾と敵弾の相殺判定
        for (const playerBullet of bullets) {
            if (playerBullet.dead) continue;
            const d = Math.hypot(
                playerBullet.x - bullet.x,
                playerBullet.y - bullet.y
            );
            if (d < (playerBullet.r || 9) + (bullet.r || 7)) {
                playerBullet.dead = true;
                bullet.life = -1;
                score += 25;
                combo++;
                boom(bullet.x, bullet.y);
                break;
            }
        }

        if (bullet.life <= 0) continue;

        if (
            playerHit(
                bullet.x,
                bullet.y,
                bullet.r
            )
        ) {

            bullet.life =
                -1;


            takeDamage(
                bullet.kind ===
                "boss"
                    ? 1
                    : 1
            );

        }

    }


    enemyBullets =
        enemyBullets.filter(
            b =>

                b.life > 0

                &&

                b.x > -100

                &&

                b.x < W + 100

                &&

                b.y > -100

                &&

                b.y < H + 150

        );

}


function updateEnemies(dt) {
    if (timeStopTimer > 0) return;

    for (
        const enemy of enemies
    ) {

        enemy.y +=
            enemy.v *
            dt *
            1;


        enemy.wob +=
            dt * 3;


        enemy.x +=
            Math.sin(
                enemy.wob
            ) *
            18 *
            dt;


        /*
            敵がたまに撃つ
        */

        enemy.shootTimer -=
            dt;


        if (
            enemy.shootTimer <= 0
        ) {

            /*
                約25%くらいの敵だけ
                少し撃つ
            */

            if (
                Math.random() < .55
            ) {

                enemyShoot(
                    enemy
                );

            }


            enemy.shootTimer =
                2 +
                Math.random() *
                3;

        }


        /*
            プレイヤー接触
        */

        if (
            playerHit(
                enemy.x,
                enemy.y,
                enemy.size *
                .42
            )
        ) {

            enemy.y =
                H + 300;


            takeDamage();

        }

    }


    /*
        画面外
    */

    for (
        let i =
            enemies.length - 1;

        i >= 0;

        i--
    ) {

        if (
            enemies[i].y >
            H + 100
        ) {

            enemies.splice(
                i,
                1
            );


            combo = 0;

        }

    }

}


function bossAttack() {
    if (!boss) return;

    const level = Math.max(1, boss.level || 1);
    const enraged = !!boss.enraged;
    const aimedAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
    const speedBase = (235 + Math.min(wave, 40) * 1.2 + level * 22) * (enraged ? 1.08 : 1);

    const fire = (angle, speed = speedBase, radius = 7, x = boss.x, y = boss.y) => {
        enemyBullets.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: radius,
            life: 5.5,
            kind: "boss"
        });
    };

    const ring = (count, speed, rotation = 0) => {
        for (let i = 0; i < count; i++) {
            fire(rotation + i * Math.PI * 2 / count, speed, level >= 3 ? 8 : 7);
        }
    };

    // パターンを順番に切り替え、同じ3方向弾ばかりにならないようにする。
    const patternCount = level >= 3 ? 6 : level === 2 ? 5 : 4;
    const patternIndex = (boss.attackCount || 0) % patternCount;
    boss.attackCount = (boss.attackCount || 0) + 1;

    switch (patternIndex) {
        case 0: { // プレイヤー狙いの扇状弾
            const count = level >= 3 ? 9 : level >= 2 ? 7 : 5;
            const spread = level >= 2 ? 0.62 : 0.44;
            for (let i = 0; i < count; i++) {
                const ratio = count === 1 ? 0 : i / (count - 1) - 0.5;
                fire(aimedAngle + ratio * spread, speedBase, 7);
            }
            break;
        }
        case 1: { // 全方向リング弾
            const count = level >= 3 ? 16 : level === 2 ? 12 : 9;
            ring(count, 145 + level * 18, boss.phase * 0.22);
            break;
        }
        case 2: { // 回転するスパイラル弾
            const count = level >= 3 ? 10 : 7;
            const rotation = boss.phase * (enraged ? 1.5 : 0.9);
            for (let i = 0; i < count; i++) {
                const angle = rotation + i * Math.PI * 2 / count;
                fire(angle, 125 + level * 19 + (i % 3) * 24, 6);
            }
            break;
        }
        case 3: { // 狙い撃ちの三連バースト
            for (let i = -1; i <= 1; i++) {
                fire(aimedAngle + i * 0.12, speedBase + 35, 8);
            }
            if (enraged) {
                fire(aimedAngle - 0.06, speedBase + 75, 6);
                fire(aimedAngle + 0.06, speedBase + 75, 6);
            }
            break;
        }
        case 4: { // 上部から降る雨弾。後半ボス用
            const count = level >= 3 ? 11 : 8;
            for (let i = 0; i < count; i++) {
                const x = 35 + (W - 70) * (i + 0.5) / count;
                const drift = Math.max(-90, Math.min(90, (player.x - x) * 0.16));
                enemyBullets.push({
                    x, y: boss.y + 12,
                    vx: drift,
                    vy: 175 + level * 23 + (i % 3) * 15,
                    r: 7,
                    life: 5,
                    kind: "boss"
                });
            }
            break;
        }
        case 5: { // 画面下方向へ広がる掃射
            const count = 11;
            const startAngle = Math.PI / 2 - 0.95;
            const endAngle = Math.PI / 2 + 0.95;
            for (let i = 0; i < count; i++) {
                const angle = startAngle + (endAngle - startAngle) * i / (count - 1);
                fire(angle, 165 + level * 20, 7);
            }
            break;
        }
    }

    // HP半分以下では、一部のパターンに追撃リングを足して緊張感を上げる。
    if (enraged && boss.attackCount % 3 === 0) {
        ring(level >= 3 ? 12 : 8, 135 + level * 16, boss.phase * 0.4);
    }
}


function defeatBoss() {

    if (!boss)
        return;


    score +=
        6000 +
        wave * 1000;


    combo += 20;


    for (
        let i = 0;
        i < 90;
        i++
    ) {

        boom(

            boss.x +
            (
                Math.random() -
                .5
            ) * 180,

            boss.y +
            (
                Math.random() -
                .5
            ) * 180,

            true

        );

    }


    boss = null;

    gimmick = null;
    const supplyNotice = document.getElementById("bossSupplyNotice");
    if (supplyNotice) supplyNotice.style.display = "none";
    bossSupplyNoticeTimer = 0;

    enemyBullets = [];


    wave++;


    defeatedThisWave = 0;


    requiredKills =
        getRequiredKills();


    spawnTimer = .5;


    waveTextTimer = 2.5;


    updateHUD();

}


function takeDamage(
    amount = 1,
    ignoreInvulnerability = false
) {

    if (!ignoreInvulnerability && (
        damageCooldown > 0
    ))
        return;


    if (
        shieldTime > 0
    )
        return;


    hp -= amount;


    combo = 0;


    damageCooldown =
        1.0;


    flash = .2;


    shake = 20;


    boom(
        player.x,
        player.y,
        true
    );


    if (
        hp <= 0
    ) {

        gameOver();

    }


    updateHUD();

}


function boom(
    x,
    y,
    big = false
) {

    for (
        let i = 0;
        i < (
            big
                ? 18
                : 9
        );
        i++
    ) {

        particles.push({

            x:
                x,

            y:
                y,

            vx:
                (
                    Math.random() -
                    .5
                ) *
                (
                    big
                        ? 420
                        : 230
                ),

            vy:
                (
                    Math.random() -
                    .5
                ) *
                (
                    big
                        ? 420
                        : 230
                ),

            life:
                .3 +
                Math.random() *
                .7,

            size:
                2 +
                Math.random() *
                7,

            text:
                Math.random() < .2

                    ? [
                        "顔",
                        "!?",
                        "草",
                        "ｗｗｗ",
                        "アホ"
                    ][
                        Math.floor(
                            Math.random() *
                            5
                        )
                    ]

                    : ""

        });

    }


    shake =
        Math.max(
            shake,
            big ? 15 : 5
        );

}


function checkWaveClear() {

    if (
        boss
    )
        return;


    if (
        defeatedThisWave >=
        requiredKills
    ) {

        nextWave();

    }

}


function nextWave() {

    if (!waveRunning) return;

    waveRunning = false;
    waveTextTimer = 2;

    // 一時停止中はウェーブ切替も待機させる
    const finishWaveTransition = () => {
        if (!running) return;
        if (paused) {
            setTimeout(finishWaveTransition, 200);
            return;
        }

        wave++;
        defeatedThisWave = 0;
        requiredKills = getRequiredKills();
        waveRunning = true;

        if (wave % 5 === 0) {
            startBoss();
        } else {
            spawnTimer = .5;
        }

        updateHUD();
    };

    setTimeout(finishWaveTransition, 900);
}


function updateBullets(dt) {

    for (
        const bullet of bullets
    ) {

        bullet.y -=
            850 * dt;

    }


    bullets =
        bullets.filter(
            bullet =>
                !bullet.dead && bullet.y > -60
        );


    for (
        let i =
            bullets.length - 1;

        i >= 0;

        i--
    ) {

        const bullet =
            bullets[i];


        /*
            ギミック
        */

        if (
            gimmick
        ) {

            let targetIndex = -1;
            let targetX = gimmick.x;
            let targetY = gimmick.y;
            let hitRadius = gimmick.radius;

            if (gimmick.targets && gimmick.targets.length) {
                for (let ti = 0; ti < gimmick.targets.length; ti++) {
                    const t = gimmick.targets[ti];
                    if (Math.hypot(bullet.x - t.x, bullet.y - t.y) < hitRadius) {
                        targetIndex = ti;
                        targetX = t.x;
                        targetY = t.y;
                        break;
                    }
                }
            } else if (Math.hypot(bullet.x - gimmick.x, bullet.y - gimmick.y) < hitRadius) {
                targetIndex = 0;
            }

            if (targetIndex >= 0) {
                bullets.splice(i, 1);
                hitGimmick(targetIndex);
                continue;
            }

        }


        /*
            ボス
        */

        if (
            boss
        ) {

            if (

                Math.hypot(

                    bullet.x -
                    boss.x,

                    bullet.y -
                    boss.y

                )
                <
                boss.size *
                .58

            ) {

                bullets.splice(
                    i,
                    1
                );


                // 青いシールド中は本体ダメージを完全に無効化
                if (gimmick && gimmick.type === "shield") {
                    score += 5;
                    boss.hitFlash = .02;
                    bullets.splice(i, 1);
                    continue;
                }

                boss.hp--;
                score += 15;


                boss.hitFlash =
                    .06;


                if (
                    boss.hp <= 0
                ) {

                    defeatBoss();

                    break;

                }


                continue;

            }

        }

        // PvPでは画面上部を動く相手プレイヤーにも弾が命中する。
        if (pvpStarted && pvpOpponentState?.alive) {
            const remoteX = (Number.isFinite(Number(pvpOpponentState.x)) ? Number(pvpOpponentState.x) : 0.5) * W;
            const remoteY = H * 0.22;
            if (Math.abs(bullet.x - remoteX) < 31 && Math.abs(bullet.y - remoteY) < 34) {
                bullets.splice(i, 1);
                sendPvpHit();
                continue;
            }
        }


        /*
            雑魚
        */

        for (
            let j =
                enemies.length - 1;

            j >= 0;

            j--
        ) {

            const enemy =
                enemies[j];


            if (

                Math.abs(
                    bullet.x -
                    enemy.x
                )
                <
                enemy.size *
                .43

                &&

                Math.abs(
                    bullet.y -
                    enemy.y
                )
                <
                enemy.size *
                .5

            ) {

                if (!bullet.pierce) {
                    bullets.splice(i, 1);
                } else {
                    bullet.x += 18;
                }


                enemy.hp -= bullet.damage || 1;


                boom(
                    enemy.x,
                    enemy.y
                );


                if (
                    enemy.hp <= 0
                ) {

                    enemies.splice(
                        j,
                        1
                    );


                    defeatedThisWave++;

                    addSkillProgress(1);


                    score +=
                        (enemy.elite ? 300 : 100) *
                        (scoreBoostTimer > 0 ? 2 : 1);

                    dropItem(
                        enemy.x,
                        enemy.y,
                        enemy.elite
                    );


                    combo++;


                    checkWaveClear();

                }


                break;

            }

        }

    }

}


/* ==================================================
   UPDATE
================================================== */

function update(dt) {

    shootCooldown -=
        dt;

    if (touchFireHeld) {
        shoot();
    }


    damageCooldown -=
        dt;


    shieldTime -=
        dt;


    bombCooldown =
        Math.max(
            0,
            bombCooldown - dt
        );


    waveTextTimer -=
        dt;


    /*
        移動
    */

    const keyboardDx =

        (
            keys.ArrowRight ||
            keys.d ||
            keys.D
        ? 1 : 0
        )

        -

        (
            keys.ArrowLeft ||
            keys.a ||
            keys.A
        ? 1 : 0
        );


    const keyboardDy =

        (
            keys.ArrowDown ||
            keys.s ||
            keys.S
        ? 1 : 0
        )

        -

        (
            keys.ArrowUp ||
            keys.w ||
            keys.W
        ? 1 : 0
        );


    const dx = keyboardDx !== 0 ? keyboardDx : touchDirX * cursorSensitivityLevel;
    const dy = keyboardDy !== 0 ? keyboardDy : touchDirY * cursorSensitivityLevel;


    player.x +=
        dx *
        player.speed *
        dt;


    player.y +=
        dy *
        player.speed *
        dt;


    player.x =
        Math.max(
            45,
            Math.min(
                W - 45,
                player.x
            )
        );


    player.y =
        Math.max(
            105,
            Math.min(
                H - 75,
                player.y
            )
        );

    // PvPは敵やボスを倒すモードではなく、左右移動で相手の弾を避ける1対1の対面戦。
    if (pvpStarted) {
        player.y = H - 120;
        updatePvpGimmick(dt);
    }


    /*
        ボス
    */

    if (pvpStarted) {
        enemies = [];
        enemyBullets = [];
        items = [];
    } else if (boss) {

        updateBoss(dt);

    }

    /*
        通常敵
    */

    else {

        spawnTimer -=
            dt;


        if (
            spawnTimer <= 0
        ) {

            /*
                必要撃破数に対して
                敵を出していく
            */

            if (
                defeatedThisWave <
                requiredKills
            ) {

                spawnEnemy();


                /*
                    高ウェーブは
                    たまに2体
                */

                if (
                    wave >= 4 &&
                    Math.random() < .25
                ) {

                    spawnEnemy();

                }

            }


            spawnTimer =
                Math.max(
                    .3,
                    .85 -
                    wave * .025
                );

        }


        updateEnemies(dt);

    }


    updateBullets(dt);

    if (!pvpStarted) {
        updateEnemyBullets(dt);
        updateItems(dt);
    }


    /*
        星空
    */

    for (
        const star of stars
    ) {

        star.y +=
            star.v *
            dt;


        if (
            star.y > H
        ) {

            star.y = 0;

        }

    }


    /*
        particles
    */

    for (
        const p of particles
    ) {

        p.x +=
            p.vx *
            dt;


        p.y +=
            p.vy *
            dt;


        p.vy +=
            260 *
            dt;


        p.life -=
            dt;

    }


    particles =
        particles.filter(
            p =>
                p.life > 0
        );


    shake *=
        .88;


    flash =
        Math.max(
            0,
            flash - dt
        );


    updateHUD();

}


/* ==================================================
   DRAW
================================================== */

function draw() {

    ctx.save();


    ctx.translate(

        (
            Math.random() -
            .5
        ) *
        shake,

        (
            Math.random() -
            .5
        ) *
        shake

    );


    ctx.clearRect(
        -50,
        -50,
        W + 100,
        H + 100
    );


    /*
        STAR
    */

    for (
        const star of stars
    ) {

        ctx.globalAlpha =
            .25 +
            star.s * .2;


        ctx.fillStyle =
            "white";


        ctx.fillRect(

            star.x,
            star.y,

            star.s,
            star.s * 2

        );

    }


    ctx.globalAlpha = 1;


    /*
        ENEMY BULLETS
    */

    for (
        const bullet
        of enemyBullets
    ) {

        ctx.beginPath();


        ctx.arc(

            bullet.x,
            bullet.y,

            bullet.r,

            0,
            Math.PI * 2

        );


        ctx.fillStyle =

            bullet.kind ===
            "boss"

                ? "#ff2525"

                : "#ff9900";


        ctx.shadowBlur =
            15;


        ctx.shadowColor =
            "#ff3030";


        ctx.fill();


        ctx.shadowBlur =
            0;

    }


    /*
        SHIELD
    */

    if (
        shieldTime > 0
    ) {

        ctx.beginPath();


        ctx.arc(

            player.x,
            player.y,

            62 +
            Math.sin(
                performance.now() /
                70
            ) * 5,

            0,
            Math.PI * 2

        );


        ctx.strokeStyle =
            "#58e8ff";


        ctx.lineWidth = 6;


        ctx.shadowBlur =
            22;


        ctx.shadowColor =
            "#58e8ff";


        ctx.stroke();


        ctx.shadowBlur =
            0;

    }


    /*
        PLAYER BULLETS
    */

    for (
        const bullet of bullets
    ) {

        ctx.fillStyle =
            "#7ffcff";


        ctx.shadowBlur =
            15;


        ctx.shadowColor =
            "#7ffcff";


        ctx.fillRect(
            bullet.x - 6,
            bullet.y - 16,
            12,
            32
        );
        ctx.beginPath();
        ctx.moveTo(bullet.x, bullet.y - 22);
        ctx.lineTo(bullet.x - 8, bullet.y - 8);
        ctx.lineTo(bullet.x + 8, bullet.y - 8);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.fill();


        ctx.shadowBlur =
            0;

    }


    /*
        ITEMS
    */

    for (const item of items) {
        ctx.save();
        ctx.translate(item.x, item.y);
        const pulse = 1 + Math.sin(item.phase) * .10;
        ctx.scale(pulse, pulse);
        ctx.fillStyle = item.color;
        ctx.shadowBlur = item.bossSupply ? 26 : 16;
        ctx.shadowColor = item.bossSupply ? "#45f5ff" : item.color;
        ctx.beginPath();
        ctx.arc(0, 0, item.bossSupply ? 28 : 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = item.bossSupply ? "#ffffff" : "#111";
        ctx.lineWidth = item.bossSupply ? 5 : 4;
        ctx.stroke();
        if (item.bossSupply) {
            ctx.strokeStyle = "#45f5ff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 34, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = "white";
        ctx.font = "900 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.icon || "?", 0, 0);
        ctx.font = "900 10px sans-serif";
        ctx.fillText(item.label, 0, item.bossSupply ? 44 : 36);
        ctx.restore();
    }


    /*
        ENEMIES
    */

    for (
        const enemy of enemies
    ) {

        ctx.save();


        ctx.translate(
            enemy.x,
            enemy.y
        );


        ctx.rotate(
            Math.sin(
                enemy.wob
            ) * .08
        );


        ctx.beginPath();


        ctx.arc(

            0,
            0,

            enemy.size *
            .48,

            0,
            Math.PI * 2

        );


        ctx.fillStyle =

            enemy.elite
                ? "#ffd633"
                : "white";


        ctx.fill();


        ctx.strokeStyle =

            enemy.elite
                ? "#ff3030"
                : "#111";


        ctx.lineWidth =

            enemy.elite
                ? 5
                : 3;


        ctx.stroke();


        if (
            faceImage.complete &&
            faceImage.naturalWidth > 0
        ) {

            ctx.drawImage(

                faceImage,

                -enemy.size *
                .43,

                -enemy.size *
                .48,

                enemy.size *
                .86,

                enemy.size *
                .96

            );

        }


        ctx.fillStyle =
            "#ffea00";


        ctx.font =
            "900 " +
            Math.max(
                12,
                enemy.size * .18
            ) +
            "px sans-serif";


        ctx.textAlign =
            "center";


        ctx.fillText(

            enemy.elite
                ? "強い顔"
                : "撃て！",

            0,

            enemy.size *
            .68

        );


        /*
            発射準備表示
        */

        if (
            enemy.shootTimer <
            .4
        ) {

            ctx.fillStyle =
                "#ff4444";


            ctx.font =
                "900 16px sans-serif";


            ctx.fillText(
                "!",
                0,
                -enemy.size * .6
            );

        }


        ctx.restore();

    }


    /*
        BOSS
    */

    if (boss) {

        ctx.save();


        ctx.translate(
            boss.x,
            boss.y
        );


        const scale =
            1 +
            Math.sin(
                performance.now() /
                120
            ) *
            .035;


        ctx.scale(
            scale,
            scale
        );

        // ボスのシールド状態を一目で分かるように青い多重シールドを表示
        const bossShielded = gimmick && gimmick.type === "shield";
        if (bossShielded) {
            const pulse = Math.sin(performance.now() / 90) * 6;
            ctx.beginPath();
            ctx.arc(0, 0, boss.size * .69 + pulse, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(30,150,255,.16)";
            ctx.fill();
            ctx.strokeStyle = "#159cff";
            ctx.lineWidth = 10;
            ctx.shadowBlur = 28;
            ctx.shadowColor = "#159cff";
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.beginPath();
            ctx.arc(0, 0, boss.size * .79 + pulse, -Math.PI / 2, Math.PI / 2);
            ctx.strokeStyle = "#72d8ff";
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = "#dff7ff";
            ctx.font = "900 22px sans-serif";
            ctx.textAlign = "center";
            ctx.strokeStyle = "#005dff";
            ctx.lineWidth = 5;
            ctx.strokeText("🛡 SHIELD", 0, -boss.size * .72);
            ctx.fillText("🛡 SHIELD", 0, -boss.size * .72);
        }

        ctx.beginPath();


        ctx.arc(

            0,
            0,

            boss.size *
            .56,

            0,
            Math.PI * 2

        );


        ctx.fillStyle =

            boss.hitFlash > 0

                ? "white"

                : bossShielded
                    ? "#087cff"
                    : boss.enraged
                        ? "#a50000"
                        : "#781111";


        ctx.fill();


        ctx.strokeStyle =
            "#ff3333";


        ctx.lineWidth =
            7;


        ctx.stroke();


        if (
            faceImage.complete &&
            faceImage.naturalWidth > 0
        ) {

            ctx.drawImage(

                faceImage,

                -boss.size *
                .50,

                -boss.size *
                .55,

                boss.size,

                boss.size *
                1.1

            );

        }


        ctx.fillStyle =
            "#ffea00";


        ctx.font =
            "1000 20px sans-serif";


        ctx.textAlign =
            "center";


        ctx.fillText(
            boss.name,
            0,
            boss.size * .73
        );


        ctx.restore();

    }


    /*
        GIMMICK
    */

    if (gimmick) {
        ctx.save();

        const drawCore = (x, y, color, shape = "diamond", label = "") => {
            ctx.save();
            ctx.translate(x, y);
            const pulse = 1 + Math.sin(gimmick.pulse * 8) * .10;
            ctx.scale(pulse, pulse);
            ctx.shadowBlur = 25;
            ctx.shadowColor = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 6;
            ctx.beginPath();
            if (shape === "hex") {
                for (let n = 0; n < 6; n++) {
                    const a = -Math.PI / 2 + n * Math.PI / 3;
                    const xx = Math.cos(a) * gimmick.radius;
                    const yy = Math.sin(a) * gimmick.radius;
                    n ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
                }
                ctx.closePath();
            } else if (shape === "circle") {
                ctx.arc(0, 0, gimmick.radius, 0, Math.PI * 2);
            } else {
                ctx.moveTo(0, -gimmick.radius);
                ctx.lineTo(gimmick.radius, 0);
                ctx.lineTo(0, gimmick.radius);
                ctx.lineTo(-gimmick.radius, 0);
                ctx.closePath();
            }
            ctx.fillStyle = color;
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "white";
            ctx.font = "900 18px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (label) ctx.fillText(label, 0, 0);
            ctx.restore();
        };

        if (gimmick.type === "clone") {
            gimmick.targets.forEach((t, i) => {
                drawCore(t.x, t.y, i === gimmick.actualIndex ? "#c35cff" : "#7333aa", "circle", "?");
                ctx.fillStyle = "#f0d8ff";
                ctx.font = "900 13px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("分身", t.x, t.y + 48);
            });
        } else if (gimmick.type === "bombcore") {
            gimmick.targets.forEach((t, i) => {
                const color = t.real ? "#35e56d" : "#ff334d";
                drawCore(t.x, t.y, color, "circle", t.real ? "✓" : "×");
            });
        } else {
            const color = gimmick.type === "shield" ? "#168cff" : gimmick.type === "overheat" ? "#ff5a18" : gimmick.type === "pulse" ? (gimmick.open ? "#35ff70" : "#ff334d") : "#ffe600";
            const shape = gimmick.type === "shield" ? "hex" : (gimmick.type === "overheat" || gimmick.type === "pulse") ? "circle" : "diamond";
            const label = gimmick.type === "shield" ? "🛡" : gimmick.type === "overheat" ? "🔥" : gimmick.type === "pulse" ? (gimmick.open ? "GO" : "WAIT") : "×";
            drawCore(gimmick.x, gimmick.y, color, shape, label);
        }

        // オーバーヒート専用ゲージ
        if (gimmick.type === "overheat") {
            const barW = 150;
            ctx.fillStyle = "rgba(0,0,0,.7)";
            ctx.fillRect(gimmick.x - barW / 2, gimmick.y + 55, barW, 12);
            ctx.fillStyle = gimmick.heat > 70 ? "#ff3030" : "#ff9d25";
            ctx.fillRect(gimmick.x - barW / 2, gimmick.y + 55, barW * gimmick.heat / 100, 12);
            ctx.strokeStyle = "white";
            ctx.lineWidth = 2;
            ctx.strokeRect(gimmick.x - barW / 2, gimmick.y + 55, barW, 12);
        }

        // 通常ギミックの残りHP
        if (gimmick.type !== "clone" && gimmick.type !== "bombcore") {
            ctx.fillStyle = "white";
            ctx.fillRect(gimmick.x - 40, gimmick.y + 70, 80, 7);
            ctx.fillStyle = gimmick.type === "shield" ? "#168cff" : gimmick.type === "overheat" ? "#ff5a18" : "#ffe600";
            ctx.fillRect(gimmick.x - 40, gimmick.y + 70, 80 * gimmick.hp / gimmick.maxHp, 7);
        }

        ctx.restore();
    }

    /*
        PLAYER
    */

    ctx.save();


    ctx.translate(
        player.x,
        player.y
    );


    if (
        damageCooldown > 0 &&
        Math.floor(
            damageCooldown * 12
        ) % 2
    ) {

        ctx.globalAlpha =
            .35;

    }


    ctx.fillStyle =
        "#242cff";


    ctx.beginPath();


    ctx.moveTo(
        0,
        -48
    );


    ctx.lineTo(
        -52,
        42
    );


    ctx.lineTo(
        0,
        25
    );


    ctx.lineTo(
        52,
        42
    );


    ctx.closePath();


    ctx.fill();


    ctx.strokeStyle =
        "white";


    ctx.lineWidth =
        3;


    ctx.stroke();


    if (
        faceImage.complete &&
        faceImage.naturalWidth > 0
    ) {

        ctx.drawImage(

            faceImage,

            -40,
            -38,

            80,
            86

        );

    }


    ctx.fillStyle =
        "#ffea00";


    ctx.font =
        "900 14px sans-serif";


    ctx.textAlign =
        "center";


    ctx.fillText(
        "オレ",
        0,
        55
    );


    ctx.restore();


    /*
        POWER / EFFECT STATUS
    */
    ctx.fillStyle = "white";
    ctx.font = "900 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
        "POWER " + powerLevel +
        (rapidTimer > 0 ? "  RAP " + rapidTimer.toFixed(1) : "") +
        (pierceTimer > 0 ? "  PEN " + pierceTimer.toFixed(1) : "") +

        (magnetTimer > 0 ? "  MAG " + magnetTimer.toFixed(1) : "") +
        (scoreBoostTimer > 0 ? "  x2 " + scoreBoostTimer.toFixed(1) : ""),
        16,
        H - 48
    );


    /*
        WAVE TEXT
    */

    if (
        waveTextTimer > 0
    ) {

        ctx.globalAlpha =
            Math.min(
                1,
                waveTextTimer
            );


        ctx.fillStyle =
            "white";


        ctx.font =
            "1000 " +
            Math.min(
                58,
                W * .075
            ) +
            "px sans-serif";


        ctx.textAlign =
            "center";


        ctx.strokeStyle =
            "black";


        ctx.lineWidth =
            8;


        const text =
            boss

                ? "☠ BOSS WAVE " +
                  wave

                : "WAVE " +
                  wave;


        ctx.strokeText(
            text,
            W / 2,
            H / 2 - 20
        );


        ctx.fillText(
            text,
            W / 2,
            H / 2 - 20
        );


        ctx.globalAlpha =
            1;

    }


    /*
        PARTICLES
    */

    for (
        const particle
        of particles
    ) {

        ctx.globalAlpha =
            Math.max(
                0,
                particle.life
            );


        if (
            particle.text
        ) {

            ctx.fillStyle =
                "#ffe600";


            ctx.font =
                "900 18px sans-serif";


            ctx.fillText(

                particle.text,

                particle.x,
                particle.y

            );

        }

        else {

            ctx.fillStyle =
                "white";


            ctx.fillRect(

                particle.x,
                particle.y,

                particle.size,
                particle.size

            );

        }

    }


    ctx.globalAlpha =
        1;


    /*
        DAMAGE FLASH
    */

    if (
        flash > 0
    ) {

        ctx.fillStyle =
            "rgba(255,40,40," +
            flash * .65 +
            ")";


        ctx.fillRect(

            -50,
            -50,

            W + 100,
            H + 100

        );

    }


    ctx.restore();

}


/* ==================================================
   LOOP
================================================== */

function gameLoop(time) {

    if (!running) return;

    if (paused) {
        lastTime = time;
        requestAnimationFrame(gameLoop);
        return;
    }

    const dt = Math.min(
        0.033,
        Math.max(0, (time - lastTime) / 1000)
    );
    lastTime = time;

    try {
        update(dt);
        draw();
    } catch (error) {
        console.error("ゲームループエラー:", error);
        running = false;
        paused = false;
        if (pauseOverlay) {
            pauseOverlay.style.display = "none";
            pauseOverlay.setAttribute("aria-hidden", "true");
        }
        if (pauseGameBtn) {
            pauseGameBtn.style.display = "none";
            pauseGameBtn.classList.remove("paused");
            pauseGameBtn.textContent = "⏸ 一時停止";
        }
        const quitBtn = document.getElementById("quitGameBtn");
        if (quitBtn) quitBtn.style.display = "none";
        const start = document.getElementById("start");
        const small = start ? start.querySelector(".small") : null;
        if (small) {
            small.innerHTML = "ゲーム中にエラーが発生しました。もう一度「出撃する」を押してください。";
        }
        if (start) start.style.display = "flex";
        return;
    }

    requestAnimationFrame(gameLoop);
}


window.addEventListener(
    "keydown",
    event => {

        const quitModalIsOpen = !!(quitConfirm && quitConfirm.style.display !== "none");
        if (event.key === "Escape" && quitModalIsOpen) {
            event.preventDefault();
            hideQuitConfirm();
            return;
        }
        if (quitModalIsOpen) return;

        if (running && (event.key === "p" || event.key === "P" || event.key === "Escape")) {
            event.preventDefault();
            if (!event.repeat) togglePause();
            return;
        }

        if (paused) {
            if (event.key === "Enter" && !event.repeat) resumeGame();
            return;
        }

        if (
            event.repeat
        ) {

            keys[event.key] =
                true;

            return;

        }


        keys[event.key] =
            true;


        if (
            [
                " ",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight"
            ].includes(
                event.key
            )
        ) {

            event.preventDefault();

        }


        /*
            SPACE
        */

        if (
            event.key === " "
        ) {

            shoot();

        }


        /*
            BOMB
        */

        if (
            event.key === "b" ||
            event.key === "B"
        ) {

            useBomb();

        }


        /*
            SHIELD

            Qに変更
            Sは下移動用
        */

        if (
            event.key === "q" ||
            event.key === "Q"
        ) {

            useShield();

        }

        if (event.key === "e" || event.key === "E") {
            void activateFaceSkill();
        }


        if (
            event.key === "Enter" &&
            !running
        ) {

            startGame();

        }

    }
);


window.addEventListener(
    "keyup",
    event => {

        keys[event.key] =
            false;

    }
);


/* ==================================================
   BUTTONS
================================================== */

document.getElementById(
    "shootBtn"
).addEventListener(
    "click",
    event => {

        event.preventDefault();

        shoot();

    }
);


document.getElementById(
    "bombBtn"
).addEventListener(
    "click",
    event => {

        event.preventDefault();

        useBomb();

    }
);


document.getElementById(
    "shieldBtn"
).addEventListener(
    "click",
    event => {

        event.preventDefault();

        useShield();

    }
);


/* ==================================================
   POINTER
================================================== */
// タッチ端末では仮想スティックを優先します。

/* ==================================================
   ADMIN MODE
================================================== */
const adminBtn = document.getElementById("adminBtn");
const adminPanel = document.getElementById("adminPanel");
const adminLogin = document.getElementById("adminLogin");
const adminControls = document.getElementById("adminControls");
const adminPassword = document.getElementById("adminPassword");

adminBtn.onclick = () => {
    adminPanel.style.display = adminPanel.style.display === "block" ? "none" : "block";
    if (adminPanel.style.display === "block" && !adminMode) adminPassword.focus();
};

document.getElementById("adminLoginBtn").onclick = () => {
    if (adminPassword.value === "admin") {
        adminMode = true;
        adminLogin.style.display = "none";
        adminControls.style.display = "block";
    } else {
        adminPassword.value = "";
        adminPassword.placeholder = "パスワードが違います";
    }
};

adminPassword.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("adminLoginBtn").click();
});

document.querySelectorAll("[data-wave]").forEach(btn => {
    btn.onclick = () => {
        adminStartWave = Number(btn.dataset.wave);
        document.getElementById("adminWave").value = adminStartWave;
    };
});

document.getElementById("adminStartWave").onclick = () => {
    if (!adminMode) return;
    adminStartWave = Math.max(1, Math.floor(Number(document.getElementById("adminWave").value) || 1));
    adminForceBoss = false;
    startGame();
};

document.getElementById("adminBossNow").onclick = () => {
    if (!adminMode) return;
    const selected = Math.max(1, Math.floor(Number(document.getElementById("adminWave").value) || 1));
    adminStartWave = Math.max(5, Math.ceil(selected / 5) * 5);
    document.getElementById("adminWave").value = adminStartWave;
    adminForceBoss = true;
    startGame();
};

document.getElementById("adminGimmickNow").onclick = () => {
    if (!adminMode) return;
    if (!running) {
        adminStartWave = Math.max(5, Math.ceil(Math.max(1, wave) / 5) * 5);
        adminForceBoss = true;
        startGame();
        setTimeout(() => { if (boss && !gimmick) spawnGimmick(); }, 120);
    } else if (boss && !gimmick) {
        spawnGimmick();
    }
};


/* ==================================================
   FULLSCREEN
================================================== */
const fullscreenBtn = document.getElementById("fullscreenBtn");

function updateFullscreenButton() {
    const active = !!document.fullscreenElement;
    document.body.classList.toggle("fullscreen-mode", active);
    if (fullscreenBtn) {
        fullscreenBtn.textContent = active ? "⛶ 全画面解除" : "⛶ 全画面";
    }
}

if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", async event => {
        event.preventDefault();
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.warn("全画面モードを開始できませんでした:", error);
        }
        updateFullscreenButton();
    });
}

document.addEventListener("fullscreenchange", updateFullscreenButton);
updateFullscreenButton();

/* ==================================================
   FIREBASE AUTH + SHARED LEADERBOARD
================================================== */
let currentUser = null;
let authReady = false;
// URLに ?guest=1 があるときは、Firebaseアカウント・ランキングとは独立して遊ぶ。
let guestMode = new URLSearchParams(window.location.search).get("guest") === "1";
let runRecorded = false;
let runRecordPromise = null;
let authErrorMessage = "";

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function updateAuthUI() {
    const nameEl = document.getElementById("signedInName");
    const statusEl = document.getElementById("onlineStatus");
    const startButton = document.getElementById("startBtn");
    const leaderboardPanel = document.getElementById("leaderboardPanel");
    const profileActions = document.querySelector("#authPanel .profileActions");
    const profileLink = profileActions ? profileActions.querySelector("a") : null;
    const logoutButton = document.getElementById("logoutBtn");
    const gameoverLeaderboardBtn = document.getElementById("gameoverLeaderboardBtn");

    if (profileLink) {
        profileLink.textContent = guestMode ? "ログイン / 登録" : "アカウント設定";
        profileLink.href = "./login.html";
    }
    if (logoutButton) logoutButton.textContent = guestMode ? "ゲスト終了" : "ログアウト";

    if (guestMode) {
        if (nameEl) nameEl.textContent = "ゲスト";
        if (startButton) startButton.disabled = !authReady;
        if (statusEl) statusEl.textContent = "ゲストモード：アカウント不要・ランキング記録なし";
        if (leaderboardPanel) leaderboardPanel.style.display = "none";
        if (profileActions) profileActions.style.display = "";
        if (gameoverLeaderboardBtn) gameoverLeaderboardBtn.style.display = "none";
        return;
    }

    if (leaderboardPanel) leaderboardPanel.style.display = "";
    if (profileActions) profileActions.style.display = "";
    if (gameoverLeaderboardBtn) gameoverLeaderboardBtn.style.display = "";
    if (nameEl) nameEl.textContent = currentUser ? (currentUser.displayName || currentUser.username) : "未ログイン";
    if (startButton) startButton.disabled = !authReady || !currentUser;
    if (statusEl) {
        statusEl.textContent = authErrorMessage || (currentUser
            ? "☁ 全員共通ランキングに接続中"
            : "ログインを確認しています…");
    }
}

function showLeaderboardError(message) {
    const messageEl = document.getElementById("leaderboardMessage");
    if (messageEl) messageEl.textContent = message;
}

async function renderLeaderboard() {
    if (guestMode) return;
    const list = document.getElementById("leaderboardList");
    const message = document.getElementById("leaderboardMessage");
    if (!list) return;
    if (!firebaseReady || !db) {
        list.innerHTML = '<li class="rankEmpty">Firebaseの設定が必要です。</li>';
        if (message) message.textContent = "js/firebase-config.js の設定を完了してください。";
        return;
    }
    try {
        // A single server-side ordering avoids requiring a composite Firestore index.
        const result = await getDocs(query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(100)));
        const ranking = result.docs.map(snapshot => snapshot.data()).sort((a, b) => {
            const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
            if (scoreDiff) return scoreDiff;
            const waveDiff = (Number(b.wave) || 1) - (Number(a.wave) || 1);
            if (waveDiff) return waveDiff;
            return String(a.displayName || a.username || "").localeCompare(String(b.displayName || b.username || ""), "ja");
        });
        if (message) message.textContent = "全ユーザー共通。各プレイヤーの自己ベストを表示しています。";
        if (!ranking.length) {
            list.innerHTML = '<li class="rankEmpty">まだ記録がありません。最初のランクインを目指そう！</li>';
            return;
        }
        list.innerHTML = ranking.slice(0, 10).map((item, index) => {
            const name = escapeHTML(item.displayName || item.username || "Player");
            const scoreValue = Math.max(0, Math.floor(Number(item.score) || 0));
            const waveValue = Math.max(1, Math.floor(Number(item.wave) || 1));
            return `<li class="rankItem"><span class="rankNo">${index + 1}</span><span class="rankUser">${name}</span><span class="rankScore">${scoreValue.toLocaleString("ja-JP")} 点<br><small>WAVE ${waveValue}</small></span></li>`;
        }).join("");
    } catch (error) {
        console.error("Shared leaderboard load failed:", error);
        list.innerHTML = '<li class="rankEmpty">ランキングを読み込めませんでした。</li>';
        if (message) message.textContent = error.code === "permission-denied"
            ? "FirestoreのセキュリティルールをREADMEどおりに設定してください。"
            : "通信またはFirebase設定を確認してください。";
    }
}

async function recordCurrentRun() {
    // ゲストはランキング・ガチャポイントともに保存しない
    if (guestMode) return;

    if (runRecorded) {
        return runRecordPromise || undefined;
    }

    runRecorded = true;

    runRecordPromise = (async () => {
        const firebaseUser = auth?.currentUser;

        if (!firebaseReady || !firebaseUser || !currentUser || !db) {
            return;
        }

        const scoreValue = Math.max(
            0,
            Math.floor(Number(score) || 0)
        );

        const waveValue = Math.max(
            1,
            Math.floor(Number(wave) || 1)
        );

        /*
         * ==========================================
         * ガチャポイント
         *
         * ポイント追加に失敗しても
         * ランキング保存には影響させない
         * ==========================================
         */
        try {
            const pointResult = await addMatchPoints(firebaseUser.uid, scoreValue);
            if (!pointResult.success) {
                throw pointResult.error || new Error("ポイントを保存できませんでした。");
            }
            console.log(
                "ガチャポイント追加:",
                pointResult.points
            );
        } catch (error) {
            console.warn(
                "ガチャポイントの追加に失敗しました。",
                error
            );
        }

        /*
         * ==========================================
         * スコアがない場合
         * ==========================================
         */
        if (
            scoreValue <= 0 &&
            waveValue <= 1
        ) {
            try {
                await renderLeaderboard();
            } catch (error) {
                console.warn(
                    "ランキング表示更新に失敗:",
                    error
                );
            }

            return;
        }

        /*
         * ==========================================
         * ランキング保存
         * ==========================================
         */
        try {
            const scoreRef = doc(
                db,
                "leaderboard",
                firebaseUser.uid
            );

            const oldSnapshot =
                await getDoc(scoreRef);

            const old =
                oldSnapshot.exists()
                    ? oldSnapshot.data()
                    : null;

            const oldScore =
                Number(old?.score) || 0;

            const oldWave =
                Number(old?.wave) || 1;

            const isBetter =
                !old ||
                scoreValue > oldScore ||
                (
                    scoreValue === oldScore &&
                    waveValue > oldWave
                );

            if (isBetter) {
                await setDoc(
                    scoreRef,
                    {
                        uid:
                            firebaseUser.uid,

                        username:
                            currentUser.username ||
                            "player",

                        displayName:
                            currentUser.displayName ||
                            currentUser.username ||
                            "Player",

                        score:
                            scoreValue,

                        wave:
                            waveValue,

                        updatedAt:
                            serverTimestamp()
                    }
                );
            }

        } catch (error) {
            console.error(
                "ランキング保存に失敗:",
                error
            );

            showLeaderboardError(
                error.code === "permission-denied"
                    ? "ランキング保存が拒否されました。Firestoreのルールを確認してください。"
                    : "ランキングを保存できませんでした。"
            );
        }

        /*
         * ランキング表示の更新も独立させる
         */
        try {
            await renderLeaderboard();
        } catch (error) {
            console.warn(
                "ランキング更新に失敗:",
                error
            );
        }

    })();

    return runRecordPromise;
}

async function initializeSharedAuth() {
    const startButton = document.getElementById("startBtn");
    if (startButton) startButton.disabled = true;

    if (guestMode) {
        currentUser = { uid: "guest-local-only", username: "guest", displayName: "ゲスト" };
        authReady = true;
        authErrorMessage = "";
        await setFaceForMode(true);
        updatePvpAccess();
        createGuestImagePicker();
        updateAuthUI();
        return;
    }

    if (!firebaseReady || !auth || !db) {
        const statusEl = document.getElementById("onlineStatus");
        const detail = firebaseConfigError ? ` (${firebaseConfigError.message})` : "";
        if (statusEl) statusEl.textContent = `Firebase設定が必要です。READMEを確認してください。${detail}`;
        const nameEl = document.getElementById("signedInName");
        if (nameEl) nameEl.textContent = "未設定";
        void renderLeaderboard();
        return;
    }

    try {
        // Firebaseが保存済みのログイン状態を復元し終えるまで待つ。
        // 初期化中の一時的な null を見て login.html へ遷移すると、
        // login.html と game.html が何度も行き来するリロードループになることがある。
        await auth.authStateReady();
        const user = auth.currentUser;

        if (!user) {
            authReady = false;
            currentUser = null;
            updateAuthUI();
            window.location.replace("./login.html");
            return;
        }

        const profileSnapshot = await getDoc(doc(db, "profiles", user.uid));
        if (!profileSnapshot.exists()) {
            authErrorMessage = "プロフィールが見つかりません。ログイン画面からもう一度登録・ログインしてください。";
            authReady = false;
            currentUser = null;
            updateAuthUI();
            return;
        }

        const profile = profileSnapshot.data();
        currentUser = {
            uid: user.uid,
            username: String(profile.username || "player"),
            displayName: String(profile.displayName || profile.username || "Player")
        };
        const dailyBonus = await claimDailyLoginBonus(user.uid);
        const dailyBonusMessage = document.getElementById("dailyLoginBonusMessage");
        if (dailyBonusMessage) {
            dailyBonusMessage.textContent = dailyBonus.claimed
                ? `🎁 今日のログインボーナス +${dailyBonus.bonus}P を受け取りました！`
                : "🎁 ログインボーナスは毎日1回（日本時間）受け取れます。";
        }
        await setFaceForMode(false);
        createGuestImagePicker();
        authErrorMessage = "";
        authReady = true;
        updateAuthUI();
        updatePvpAccess();
        await renderLeaderboard();
    } catch (error) {
        console.error("Firebase auth/profile initialization failed:", error);
        authErrorMessage = error.code === "permission-denied"
            ? "Firestoreのセキュリティルールが未設定です。READMEのルールを登録してください。"
            : "Firebaseに接続できません。設定とネットワークを確認してください。";
        authReady = false;
        updateAuthUI();
    }
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", async () => {
    if (guestMode) {
        if (customFaceObjectURL) {
            URL.revokeObjectURL(customFaceObjectURL);
            customFaceObjectURL = null;
        }
        window.location.href = "./login.html";
        return;
    }
    if (!auth) return;
    logoutBtn.disabled = true;
    try {
        await signOut(auth);
        window.location.href = "./login.html";
    } catch (error) {
        console.error("Logout failed:", error);
        logoutBtn.disabled = false;
        authErrorMessage = "ログアウトに失敗しました。再度お試しください。";
        updateAuthUI();
    }
});

const gameoverLeaderboardBtn = document.getElementById("gameoverLeaderboardBtn");
if (gameoverLeaderboardBtn) {
    gameoverLeaderboardBtn.addEventListener(
        "click",
        async () => {

            try {
                await recordCurrentRun();
            } catch (error) {
                console.warn(
                    "ゲーム結果の保存処理でエラー:",
                    error
                );
            }

            /*
             * 保存処理が失敗しても
             * ランキング画面へ進める
             */
            running = false;
            paused = false;

            if (pauseOverlay) {
                pauseOverlay.style.display = "none";
                pauseOverlay.setAttribute(
                    "aria-hidden",
                    "true"
                );
            }

            if (pauseGameBtn) {
                pauseGameBtn.style.display = "none";
                pauseGameBtn.classList.remove("paused");
                pauseGameBtn.textContent =
                    "⏸ 一時停止";
            }

            const quitBtn =
                document.getElementById(
                    "quitGameBtn"
                );

            if (quitBtn) {
                quitBtn.style.display = "none";
            }

            const gameover =
                document.getElementById(
                    "gameover"
                );

            if (gameover) {
                gameover.style.display = "none";
            }

            const start =
                document.getElementById(
                    "start"
                );

            if (start) {
                start.style.display = "flex";
            }

            await renderLeaderboard();
        }
    );
}

/* ==================================================
   START / RETRY
================================================== */

const startButton = document.getElementById("startBtn");
if (startButton) {
    startButton.addEventListener("click", event => {
        event.preventDefault();
        startGame();
    });
}


document.getElementById(
    "retryBtn"
).onclick =
    startGame;


// Static login is loaded before enabling the start button.
const pvpPanel = document.getElementById("pvpPanel");
const pvpCreateButton = document.getElementById("pvpCreateButton");
const pvpJoinButton = document.getElementById("pvpJoinButton");
const pvpCancelButton = document.getElementById("pvpCancelButton");
const pvpRoomCodeInput = document.getElementById("pvpRoomCodeInput");
const pvpRoomCodeDisplay = document.getElementById("pvpRoomCodeDisplay");
const pvpStatus = document.getElementById("pvpStatus");
const pvpHud = document.getElementById("pvpHud");
const pvpOpponentSummary = document.getElementById("pvpOpponentSummary");
const pvpSyncNotice = document.getElementById("pvpSyncNotice");
const pvpGimmickNotice = document.getElementById("pvpGimmickNotice");
const pvpLaserLane = document.getElementById("pvpLaserLane");
const pvpRemoteAvatar = document.getElementById("pvpRemoteAvatar");
const pvpRemoteFace = document.getElementById("pvpRemoteFace");
const pvpRemoteFaceFallback = document.getElementById("pvpRemoteFaceFallback");
const pvpOpponentName = document.getElementById("pvpOpponentName");
const pvpAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
pvpCreateButton.disabled = true;
pvpJoinButton.disabled = true;

function updatePvpAccess() {
    const allowed = !!auth?.currentUser && !!currentUser && !guestMode;
    if (pvpCreateButton) pvpCreateButton.disabled = !allowed || !!pvpRoomCode;
    if (pvpJoinButton) pvpJoinButton.disabled = !allowed || !!pvpRoomCode;
    setPvpStatus(allowed ? "対戦ルームを作るか、フレンドの合言葉を入力してください。" : "対戦にはログインが必要です。");
}

function setPvpStatus(message) {
    if (pvpStatus) pvpStatus.textContent = message;
}

function setPvpMatchNotice(message) {
    setPvpStatus(message);
    if (pvpSyncNotice) {
        if (pvpSyncNotice.textContent !== message || pvpSyncNotice.hidden) {
            pvpSyncNotice.textContent = message;
            pvpSyncNotice.hidden = false;
            pvpSyncNotice.dataset.kind = /失敗|できません|確認してください|再公開/.test(message) ? "error" : "info";
        }
    }
}

function updatePvpGimmick(dt) {
    if (!pvpRoundStartedAt || !player) return;
    const elapsed = Math.max(0, (Date.now() - pvpRoundStartedAt) / 1000);
    const cycle = Math.floor(elapsed / 18);
    const cycleTime = elapsed % 18;
    const typeIndex = cycle % 3;
    const hash = [...pvpRoomCode].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
    const laneIndex = ((hash + cycle * 17) >>> 0) % 3;
    const lane = (laneIndex + 1) / 4;
    const type = ["laser", "wind", "rapid"][typeIndex];
    const warning = cycleTime < 2;
    const active = cycleTime >= 2 && cycleTime < 7;
    pvpCurrentGimmick = { type, lane, active, warning };
    pvpRapidFireActive = active && type === "rapid";

    if (pvpGimmickNotice) {
        let message = "アリーナ安定中";
        if (type === "laser" && warning) message = "⚠ レーザー予告！ 縦の光るラインから離れよう";
        else if (type === "laser" && active) message = "🔥 レーザー照射中！ ラインに触れるとHP減少";
        else if (type === "wind" && warning) message = "⚠ 横風が来る！ 移動の準備をしよう";
        else if (type === "wind" && active) message = `🌪 横風発生！ ${laneIndex === 1 ? "右" : "左"}へ流される。逆方向に移動！`;
        else if (type === "rapid" && warning) message = "✨ オーバードライブ接近！";
        else if (type === "rapid" && active) message = "🚀 オーバードライブ！ 連射速度アップ";
        if (pvpGimmickNotice.textContent !== message) pvpGimmickNotice.textContent = message;
    }

    if (pvpLaserLane) {
        const laserVisible = type === "laser" && (warning || active);
        pvpLaserLane.hidden = !laserVisible;
        pvpLaserLane.style.left = `${lane * 100}%`;
        pvpLaserLane.classList.toggle("warning", laserVisible && warning);
        pvpLaserLane.classList.toggle("active", laserVisible && active);
    }

    if (active && type === "laser" && Math.abs(player.x - lane * W) <= Math.max(32, W * .035)
        && pvpLastGimmickCycleHit !== cycle) {
        pvpLastGimmickCycleHit = cycle;
        takeDamage(1);
        if (pvpOpponentSummary) pvpOpponentSummary.textContent = `⚡ レーザー命中！ HP ${Math.max(0, hp)}`;
    }

    if (active && type === "wind") {
        const direction = laneIndex === 1 ? 1 : -1;
        player.x += direction * 155 * dt;
        player.x = Math.max(45, Math.min(W - 45, player.x));
    }
}

function setPvpSyncSuccess(message) {
    if (!pvpSyncNotice) return;
    if (pvpSyncNotice.textContent !== message || pvpSyncNotice.hidden) {
        pvpSyncNotice.textContent = message;
        pvpSyncNotice.hidden = false;
        pvpSyncNotice.dataset.kind = "success";
    }
}

function getPvpErrorCode(error) {
    return String(error?.code || error?.message || "unknown").slice(0, 80);
}

function makePvpRoomCode() {
    const values = new Uint8Array(8);
    crypto.getRandomValues(values);
    return [...values].map(value => pvpAlphabet[value % pvpAlphabet.length]).join("");
}

function watchPvpRoom() {
    if (pvpRoomUnsubscribe) pvpRoomUnsubscribe();
    pvpRoomUnsubscribe = onSnapshot(
        doc(db, "pvpRooms", pvpRoomCode),
        snapshot => {
            if (!snapshot.exists()) {
                setPvpStatus("ルームが閉じられました。新しく作成してください。");
                return;
            }
            const room = snapshot.data();
            if (room.status === "playing" && room.guestUid) {
                pvpRoundStartedAt = room.updatedAt?.toMillis?.() || Date.now();
                beginPvpMatch();
            } else if (room.status === "waiting") {
                setPvpStatus(`合言葉 ${pvpRoomCode} をフレンドに伝えてください。参加すると対戦開始します。`);
            }
        },
        error => {
            console.error("PvPルームの監視に失敗:", error);
            setPvpStatus("ルームに接続できません。Firestoreルールを確認してください。");
        }
    );
}

async function createPvpRoom() {
    const uid = auth?.currentUser?.uid;
    if (!firebaseReady || !db || !uid || guestMode) {
        setPvpStatus("フレンド対戦にはログインが必要です。");
        return;
    }
    pvpIsHost = true;
    pvpCreateButton.disabled = true;
    pvpJoinButton.disabled = true;
    setPvpStatus("ルームを作成中…");
    try {
        let created = false;
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
            const code = makePvpRoomCode();
            try {
                await runTransaction(db, async transaction => {
                    const roomRef = doc(db, "pvpRooms", code);
                    const existing = await transaction.get(roomRef);
                    if (existing.exists()) throw new Error("ROOM_CODE_COLLISION");
                    transaction.set(roomRef, {
                        hostUid: uid,
                        guestUid: "",
                        status: "waiting",
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                });
                pvpRoomCode = code;
                created = true;
            } catch (error) {
                if (error.message !== "ROOM_CODE_COLLISION") throw error;
            }
        }
        if (!created) throw new Error("ROOM_CODE_UNAVAILABLE");
        if (pvpRoomCodeDisplay) {
            pvpRoomCodeDisplay.textContent = `合言葉：${pvpRoomCode}`;
            pvpRoomCodeDisplay.hidden = false;
        }
        pvpCreateButton.textContent = "フレンドを待っています…";
        const soloStartButton = document.getElementById("startBtn");
        if (soloStartButton) soloStartButton.disabled = true;
        if (pvpCancelButton) pvpCancelButton.hidden = false;
        watchPvpRoom();
    } catch (error) {
        console.error("PvPルーム作成に失敗:", error);
        setPvpStatus("ルームを作成できませんでした。Firestoreルールが更新されているか確認してください。");
        pvpCreateButton.disabled = false;
        pvpJoinButton.disabled = false;
    }
}

async function joinPvpRoom() {
    const uid = auth?.currentUser?.uid;
    const code = String(pvpRoomCodeInput?.value || "").toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "");
    if (!firebaseReady || !db || !uid || guestMode) {
        setPvpStatus("フレンド対戦にはログインが必要です。");
        return;
    }
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
        setPvpStatus("8文字の合言葉を入力してください。");
        return;
    }
    pvpCreateButton.disabled = true;
    pvpJoinButton.disabled = true;
    setPvpStatus("ルームに参加中…");
    try {
        await runTransaction(db, async transaction => {
            const roomRef = doc(db, "pvpRooms", code);
            const snapshot = await transaction.get(roomRef);
            if (!snapshot.exists()) throw new Error("ROOM_NOT_FOUND");
            const room = snapshot.data();
            if (room.hostUid === uid) throw new Error("ROOM_SELF_JOIN");
            if (room.status === "playing") throw new Error("ROOM_ALREADY_STARTED");
            if (room.guestUid) throw new Error("ROOM_FULL");
            if (room.status !== "waiting") throw new Error("ROOM_NOT_WAITING");
            transaction.update(roomRef, {
                guestUid: uid,
                status: "playing",
                updatedAt: serverTimestamp()
            });
        });
        pvpRoomCode = code;
        pvpIsHost = false;
        const soloStartButton = document.getElementById("startBtn");
        if (soloStartButton) soloStartButton.disabled = true;
        pvpRoomCodeInput.value = "";
        watchPvpRoom();
    } catch (error) {
        console.error("PvPルーム参加に失敗:", error);
        setPvpStatus(error.message === "ROOM_NOT_FOUND"
            ? "その合言葉のルームがありません。合言葉を確認してください。"
            : error.message === "ROOM_SELF_JOIN"
                ? "作成した本人は参加できません。フレンドは別のアカウントでログインしてください。"
                : error.message === "ROOM_ALREADY_STARTED"
                    ? "そのルームは開始済みです。ホストに新しい合言葉を作ってもらってください。"
                    : error.message === "ROOM_FULL"
                        ? "そのルームにはすでに参加者がいます。ホストに新しい合言葉を作ってもらってください。"
                        : error.message === "ROOM_NOT_WAITING"
                            ? "そのルームは現在参加を受け付けていません。ホストに新しい合言葉を作ってもらってください。"
                : "参加できません。Firestoreルールが更新されているか確認してください。");
        pvpCreateButton.disabled = false;
        pvpJoinButton.disabled = false;
    }
}

function beginPvpMatch() {
    if (pvpStarted || !pvpRoomCode) return;
    pvpStarted = true;
    pvpFinished = false;
    pvpLocalDead = false;
    pvpOpponentState = null;
    pvpProcessedHitIds.clear();
    pvpLastSentX = pvpLastSentScore = pvpLastSentWave = pvpLastSentHp = -1;
    pvpLastSentFaceId = "";
    pvpLastOpponentUpdate = Date.now();
    pvpHasSeenOpponentState = false;
    pvpLastGimmickCycleHit = -1;
    pvpRapidFireActive = false;
    if (!pvpRoundStartedAt) pvpRoundStartedAt = Date.now();
    pvpSyncFailureCount = 0;
    pvpSyncRetryAfter = 0;
    if (pvpPanel) pvpPanel.hidden = true;
    if (pvpCancelButton) pvpCancelButton.hidden = true;
    if (pvpHud) pvpHud.hidden = false;
    if (pvpSyncNotice) {
        pvpSyncNotice.hidden = true;
        pvpSyncNotice.textContent = "";
        pvpSyncNotice.dataset.kind = "info";
    }
    if (pvpRemoteAvatar) pvpRemoteAvatar.hidden = false;
    if (pvpGimmickNotice) pvpGimmickNotice.hidden = false;
    if (pvpLaserLane) pvpLaserLane.hidden = true;
    if (pvpOpponentSummary) pvpOpponentSummary.textContent = "対戦相手を読み込み中…";
    const leaderboardButton = document.getElementById("gameoverLeaderboardBtn");
    if (leaderboardButton) leaderboardButton.hidden = true;
    if (pauseGameBtn) pauseGameBtn.disabled = true;
    pvpPlayersUnsubscribe = onSnapshot(
        collection(db, "pvpRooms", pvpRoomCode, "players"),
        snapshot => {
            const opponent = snapshot.docs.map(entry => entry.data()).find(entry => entry.uid !== auth.currentUser?.uid);
            if (!opponent) {
                if (pvpOpponentSummary && !pvpHasSeenOpponentState && pvpOpponentSummary.textContent !== "相手の対戦データを待っています…") {
                    pvpOpponentSummary.textContent = "相手の対戦データを待っています…";
                }
                return;
            }
            pvpOpponentState = opponent;
            pvpHasSeenOpponentState = true;
            const timestamp = opponent.updatedAt?.toMillis?.() || 0;
            if (timestamp > 0 && timestamp !== pvpLastOpponentUpdate) pvpLastOpponentUpdate = timestamp;
            if (pvpOpponentSummary) {
                const opponentSummary = `${opponent.displayName || "フレンド"}　HP ${opponent.hp || 0}`;
                if (pvpOpponentSummary.textContent !== opponentSummary) pvpOpponentSummary.textContent = opponentSummary;
            }
            setPvpSyncSuccess("対戦データ同期中");
            if (pvpRemoteAvatar) {
                const opponentX = Number.isFinite(Number(opponent.x)) ? Number(opponent.x) : 0.5;
                pvpRemoteAvatar.style.left = `${Math.max(5, Math.min(95, opponentX * 100))}%`;
                pvpRemoteAvatar.setAttribute("aria-label", `${opponent.displayName || "フレンド"} HP ${opponent.hp || 0}`);
            }
            if (pvpRemoteFace && opponent.faceImageUrl && pvpRemoteFace.dataset.imageUrl !== opponent.faceImageUrl) {
                pvpRemoteFace.dataset.imageUrl = opponent.faceImageUrl;
                pvpRemoteFace.onerror = () => {
                    pvpRemoteFace.hidden = true;
                    if (pvpRemoteFaceFallback) pvpRemoteFaceFallback.hidden = false;
                };
                pvpRemoteFace.onload = () => {
                    pvpRemoteFace.hidden = false;
                    if (pvpRemoteFaceFallback) pvpRemoteFaceFallback.hidden = true;
                };
                pvpRemoteFace.src = opponent.faceImageUrl;
            } else if (!opponent.faceImageUrl && pvpRemoteFaceFallback) {
                pvpRemoteFace.hidden = true;
                pvpRemoteFaceFallback.hidden = false;
            }
            if (pvpOpponentName) pvpOpponentName.textContent = String(opponent.displayName || "フレンド").slice(0, 16);
            if (!opponent.alive && !pvpFinished) finishPvpMatch(pvpLocalDead ? "draw" : "win");
        },
        error => {
            console.error("PvP対戦相手の同期に失敗:", error);
            setPvpMatchNotice(`相手データ受信失敗 (${getPvpErrorCode(error)})。Firestore Rulesと通信状態を確認してください。`);
        }
    );
    pvpHitsUnsubscribe = onSnapshot(
        collection(db, "pvpRooms", pvpRoomCode, "hits"),
        snapshot => {
            for (const change of snapshot.docChanges()) {
                if (change.type !== "added" || pvpProcessedHitIds.has(change.doc.id)) continue;
                const hit = change.doc.data();
                if (hit.targetUid !== auth.currentUser?.uid) continue;
                pvpProcessedHitIds.add(change.doc.id);
                if (pvpStarted && running && !pvpLocalDead && shieldTime <= 0) {
                    // PvPはキャラ同士の接触ではダメージを受けず、相手の弾イベントだけで被弾する。
                    // 連続した弾命中もそれぞれ1ダメージとして処理する。
                    takeDamage(1, true);
                    if (pvpOpponentSummary) pvpOpponentSummary.textContent = `💥 ${hit.attackerName || "フレンド"} の弾が命中！ HP ${Math.max(0, hp)}`;
                }
                void deleteDoc(change.doc.ref).catch(error => console.warn("PvPの被弾記録を消せませんでした:", error));
            }
        },
        error => {
            console.error("PvP攻撃イベントの受信に失敗:", error);
            setPvpMatchNotice(`被弾データ受信失敗 (${getPvpErrorCode(error)})。最新のfirestore.rulesを再公開してください。`);
        }
    );
    startGame();
    void syncPvpPlayerState(true);
    pvpSyncTimer = setInterval(() => {
        void syncPvpPlayerState();
        if (pvpHasSeenOpponentState && Date.now() - pvpLastOpponentUpdate > 15000 && !pvpFinished) finishPvpMatch("win");
        else if (!pvpHasSeenOpponentState && Date.now() - pvpLastOpponentUpdate > 8000 && pvpOpponentSummary?.textContent === "相手の対戦データを待っています…") {
            setPvpMatchNotice("相手データを受信できません。2人とも最新のfirestore.rulesを公開後に作ったルームへ入り直してください。");
        }
    }, 250);
}

async function syncPvpPlayerState(force = false) {
    const uid = auth?.currentUser?.uid;
    if (!pvpStarted || !pvpRoomCode || !uid || !db || pvpSyncBusy) return;
    const now = Date.now();
    if (!force && now < pvpSyncRetryAfter) return;
    const x = Math.max(0, Math.min(1, (Number(player?.x) || W / 2) / Math.max(1, W)));
    const currentScore = Math.max(0, Math.floor(Number(score) || 0));
    const currentWave = Math.max(1, Math.floor(Number(wave) || 1));
    const currentHp = Math.max(0, Math.floor(Number(hp) || 0));
    const changed = Math.abs(x - pvpLastSentX) >= 0.025
        || currentScore !== pvpLastSentScore
        || currentWave !== pvpLastSentWave
        || currentHp !== pvpLastSentHp
        || activeFaceId !== pvpLastSentFaceId;
    if (!force && !changed && now - pvpLastStateSyncAt < 1000) return;
    pvpSyncBusy = true;
    try {
        await setDoc(doc(db, "pvpRooms", pvpRoomCode, "players", uid), {
            uid,
            displayName: String(currentUser?.displayName || currentUser?.username || "Player").slice(0, 48),
            score: currentScore,
            wave: currentWave,
            hp: currentHp,
            x,
            faceId: String(activeFaceId || "face2").slice(0, 64),
            faceImageUrl: String(pvpLocalFaceImageUrl || faceImage?.src || FACE_REGISTERED).slice(0, 1000),
            alive: !pvpLocalDead && (running || paused),
            updatedAt: serverTimestamp()
        }, { merge: true });
        pvpLastStateSyncAt = now;
        pvpLastSentX = x;
        pvpLastSentScore = currentScore;
        pvpLastSentWave = currentWave;
        pvpLastSentHp = currentHp;
        pvpLastSentFaceId = activeFaceId;
        pvpSyncFailureCount = 0;
        pvpSyncRetryAfter = 0;
        if (!pvpHasSeenOpponentState) setPvpSyncSuccess("自分のデータ送信OK。相手のデータ待ちです");
    } catch (error) {
        console.warn("PvP状態の同期に失敗:", error);
        pvpSyncFailureCount += 1;
        pvpSyncRetryAfter = Date.now() + Math.min(30000, 1000 * (2 ** Math.min(5, pvpSyncFailureCount - 1)));
        const message = error?.code === "permission-denied"
            ? "permission-denied：Firebase側のRulesが古く、faceId / faceImageUrl を拒否しています。最新firestore.rulesをPublishしてください。"
            : `自分のデータ送信失敗 (${getPvpErrorCode(error)})。通信とFirestore Rulesを確認してください。`;
        setPvpMatchNotice(message);
    } finally {
        pvpSyncBusy = false;
    }
}

function sendPvpHit() {
    const uid = auth?.currentUser?.uid;
    if (!pvpStarted || pvpFinished || !pvpRoomCode || !uid || !pvpOpponentState?.uid) return;
    if (pvpOpponentSummary) pvpOpponentSummary.textContent = `🎯 相手に命中！ HP ${pvpOpponentState.hp || 0}`;
    void addDoc(collection(db, "pvpRooms", pvpRoomCode, "hits"), {
        attackerUid: uid,
        attackerName: String(currentUser?.displayName || currentUser?.username || "Player").slice(0, 48),
        targetUid: pvpOpponentState.uid,
        damage: 1,
        createdAt: serverTimestamp()
    }).catch(error => {
        console.warn("PvP攻撃を送信できませんでした:", error);
        setPvpMatchNotice(`弾の命中送信失敗 (${getPvpErrorCode(error)})。最新のfirestore.rulesを再公開してください。`);
    });
}

function finishPvpMatch(result) {
    if (pvpFinished) return;
    pvpFinished = true;
    pvpRapidFireActive = false;
    if (pvpGimmickNotice) pvpGimmickNotice.hidden = true;
    if (pvpLaserLane) pvpLaserLane.hidden = true;
    running = false;
    paused = false;
    clearHeldInputs();
    if (pvpSyncTimer) clearInterval(pvpSyncTimer);
    pvpSyncTimer = null;
    pvpRoomUnsubscribe?.();
    pvpPlayersUnsubscribe?.();
    pvpHitsUnsubscribe?.();
    pvpRoomUnsubscribe = pvpPlayersUnsubscribe = pvpHitsUnsubscribe = null;
    if (pauseOverlay) pauseOverlay.style.display = "none";
    if (pauseGameBtn) pauseGameBtn.style.display = "none";
    const quitButton = document.getElementById("quitGameBtn");
    if (quitButton) quitButton.style.display = "none";
    document.getElementById("finalScore").textContent = String(score);
    document.getElementById("finalWave").textContent = String(wave);
    document.getElementById("comment").textContent = result === "win"
        ? "フレンドとの対戦に勝利！"
        : result === "draw"
            ? "引き分け！二人とも同時に撃破されました。"
            : "フレンドが切断したため勝利！";
    const message = document.getElementById("pvpResultMessage");
    if (message) {
        message.hidden = false;
        message.textContent = `相手 SCORE ${pvpOpponentState?.score || 0} / WAVE ${pvpOpponentState?.wave || 1}`;
    }
    document.getElementById("gameover").style.display = "flex";
}

async function leavePvpRoom() {
    if (pvpStarted && !pvpLocalDead && !pvpFinished) {
        pvpLocalDead = true;
        await syncPvpPlayerState();
    }
    if (pvpSyncTimer) clearInterval(pvpSyncTimer);
    pvpSyncTimer = null;
    pvpRoomUnsubscribe?.();
    pvpPlayersUnsubscribe?.();
    pvpHitsUnsubscribe?.();
    pvpRoomUnsubscribe = pvpPlayersUnsubscribe = pvpHitsUnsubscribe = null;
    const oldRoomCode = pvpRoomCode;
    if (oldRoomCode && !pvpStarted && pvpIsHost && auth?.currentUser) {
        try {
            await deleteDoc(doc(db, "pvpRooms", oldRoomCode));
        } catch (error) {
            console.warn("待機ルームの削除に失敗:", error);
        }
    }
    pvpRoomCode = "";
    pvpStarted = false;
    pvpFinished = false;
    pvpLocalDead = false;
    pvpIsHost = false;
    pvpOpponentState = null;
    pvpRoundStartedAt = 0;
    pvpLastGimmickCycleHit = -1;
    pvpRapidFireActive = false;
    pvpProcessedHitIds.clear();
    pvpLastSentX = pvpLastSentScore = pvpLastSentWave = pvpLastSentHp = -1;
    pvpLastStateSyncAt = 0;
    if (pvpPanel) pvpPanel.hidden = false;
    if (pvpHud) pvpHud.hidden = true;
    if (pvpSyncNotice) pvpSyncNotice.hidden = true;
    if (pvpGimmickNotice) pvpGimmickNotice.hidden = true;
    if (pvpLaserLane) pvpLaserLane.hidden = true;
    if (pvpRemoteAvatar) pvpRemoteAvatar.hidden = true;
    if (pvpRoomCodeDisplay) pvpRoomCodeDisplay.hidden = true;
    if (pvpCreateButton) {
        pvpCreateButton.disabled = false;
        pvpCreateButton.textContent = "ルームを作る";
    }
    if (pvpJoinButton) pvpJoinButton.disabled = false;
    if (pauseGameBtn) pauseGameBtn.disabled = false;
    const soloStartButton = document.getElementById("startBtn");
    if (soloStartButton) soloStartButton.disabled = !authReady;
    if (pvpCancelButton) pvpCancelButton.hidden = true;
    const leaderboardButton = document.getElementById("gameoverLeaderboardBtn");
    if (leaderboardButton) leaderboardButton.hidden = false;
    const pvpMessage = document.getElementById("pvpResultMessage");
    if (pvpMessage) pvpMessage.hidden = true;
    document.getElementById("gameover").style.display = "none";
    document.getElementById("start").style.display = "flex";
    updatePvpAccess();
}

pvpCreateButton?.addEventListener("click", () => void createPvpRoom());
pvpJoinButton?.addEventListener("click", () => void joinPvpRoom());
pvpCancelButton?.addEventListener("click", () => void leavePvpRoom());
document.getElementById("retryBtn")?.addEventListener("click", event => {
    if (!pvpRoomCode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void leavePvpRoom();
}, true);

void initializeSharedAuth();
/* =========================================================
   ボスギミック調整パッチ v2

   目的:
   - 既存ギミック成功時のボスHPダメージを約半分にする
   - シールド破壊時は即ダメージを与えず、一定時間ボスを弱体化
   - 弱体化中は通常弾が3倍ダメージ、ボスの弾速も低下
   - 装甲パーツ / 爆弾解除 / エネルギー吸収を追加
   - ボスレベルに応じて、的の数・必要ヒット数・制限時間を少しずつ増加

   使い方:
   game.js の末尾へ追加。旧 boss-gimmicks-patch.js を追加済みなら、
   その旧パッチブロックを削除してから、この版に置き換えてください。
========================================================= */

(() => {
    "use strict";

    function patchFunction(fn, oldText, newText, label) {
        if (typeof fn !== "function") {
            console.warn(`[ボス調整] ${label}: 関数が見つかりません。`);
            return fn;
        }
        const source = fn.toString();
        if (!source.includes(oldText)) {
            console.warn(`[ボス調整] ${label}: 想定した箇所が見つかりません。既存処理を維持します。`);
            return fn;
        }
        return eval(`(${source.replace(oldText, newText)})`);
    }

    // 1. 既存ギミックの直接ダメージを約半分にし、シールドは弱体化型へ変更。
    hitGimmick = patchFunction(
        hitGimmick,
        `const damage = gimmick.type === "overheat"
            ? 650 + wave * 55 + boss.level * 250
            : 350 + wave * 30 + boss.level * 180;
        boss.hp -= damage;`,
        `const shieldBreak = gimmick.type === "shield";
        const damage = shieldBreak ? 0 : gimmick.type === "overheat"
            ? 320 + wave * 28 + boss.level * 125
            : 175 + wave * 15 + boss.level * 90;
        if (shieldBreak) {
            boss.weaknessTimer = 12 + Math.min(8, Math.floor(Math.max(0, boss.level - 1) / 2));
            boss.attackTimer = Math.max(boss.attackTimer, 1.2);
        }
        boss.hp -= damage;`,
        "既存ギミックのダメージ調整"
    );

    // ボスレベルが上がるほど動く弱点を少しずつ速くする。
    updateBoss = patchFunction(
        updateBoss,
        "gimmick.x += gimmick.dir * 150 * dt;",
        "gimmick.x += gimmick.dir * (150 + Math.min(70, Math.max(0, boss.level - 1) * 7)) * dt;",
        "動く弱点の段階的な速度"
    );

    // 間違った爆弾コアや、ギミック失敗時のボス回復も控えめにする。
    hitGimmick = patchFunction(
        hitGimmick,
        "boss.hp = Math.min(boss.maxHp, boss.hp + 220 + boss.level * 50);",
        "boss.hp = Math.min(boss.maxHp, boss.hp + 100 + boss.level * 25);",
        "爆弾コアの失敗ペナルティ"
    );
    updateBoss = patchFunction(
        updateBoss,
        "const heal = gimmick.type === \"clock\" ? 180 + boss.level * 60 : 90 + boss.level * 25;",
        "const heal = gimmick.type === \"clock\" ? 90 + boss.level * 30 : 45 + boss.level * 12;",
        "ギミック失敗時の回復量"
    );

    // シールド弱体化中だけ通常弾を3倍ダメージにする。
    updateBullets = patchFunction(
        updateBullets,
        "boss.hp--;",
        "boss.hp -= (boss.weaknessTimer > 0 ? 3 : 1);",
        "弱体化中の通常弾ダメージ"
    );

    // 「WAIT / 赤・緑」のタイミングギミックを抽選対象から外す。
    spawnGimmick = patchFunction(
        spawnGimmick,
        'const basic = ["weak", "moving", "shield", "pulse"];',
        'const basic = ["weak", "moving", "shield"];',
        "基本ギミックの抽選"
    );
    spawnGimmick = patchFunction(
        spawnGimmick,
        'const advanced = ["weak", "moving", "shield", "pulse", "clock", "ring", "decoy", "clone", "overheat"];',
        'const advanced = ["weak", "moving", "shield", "clock", "ring", "decoy", "clone", "overheat"];',
        "中級ギミックの抽選"
    );
    spawnGimmick = patchFunction(
        spawnGimmick,
        'const extreme = ["weak", "moving", "shield", "pulse", "clock", "ring", "decoy", "rain", "cross", "clone", "overheat", "bombcore"];',
        'const extreme = ["weak", "moving", "shield", "clock", "ring", "decoy", "rain", "cross", "clone", "overheat", "bombcore"];',
        "上級ギミックの抽選"
    );

    const originalSpawnGimmick = spawnGimmick;
    const originalHitGimmick = hitGimmick;
    const originalUpdateBoss = updateBoss;
    const originalDraw = draw;

    const extraGimmickTypes = ["armorParts", "bombFuse", "energyDrain"];
    let extraGimmickCycle = 0;

    function setGimmickText(title, description, color = "#ffffff") {
        const titleEl = document.getElementById("gimmickTitle");
        const textEl = document.getElementById("gimmickText");
        const box = document.getElementById("bossGimmick");
        if (titleEl) {
            titleEl.textContent = title;
            titleEl.style.color = color;
        }
        if (textEl) {
            textEl.textContent = description;
            textEl.style.color = "#fff";
        }
        if (box) box.style.display = "block";
    }

    // 弱体化中の表示を作る（ゲーム画面内だけ）。
    let weaknessNotice = document.getElementById("bossWeaknessNotice");
    if (!weaknessNotice && gameWrap) {
        weaknessNotice = document.createElement("div");
        weaknessNotice.id = "bossWeaknessNotice";
        weaknessNotice.setAttribute("aria-live", "polite");
        weaknessNotice.style.cssText = [
            "position:absolute", "z-index:24", "top:158px", "left:50%",
            "transform:translateX(-50%)", "display:none", "width:max-content",
            "max-width:92%", "padding:8px 12px", "border:2px solid #79eaff",
            "border-radius:10px", "background:rgba(0,22,42,.94)", "color:#fff",
            "font:900 13px system-ui,sans-serif", "text-align:center",
            "pointer-events:none", "box-shadow:0 0 12px rgba(80,220,255,.35)"
        ].join(";");
        gameWrap.appendChild(weaknessNotice);
    }

    function renderWeaknessNotice() {
        if (!weaknessNotice) return;
        if (boss && boss.weaknessTimer > 0) {
            weaknessNotice.style.display = "block";
            weaknessNotice.textContent = `🛡 シールド破壊！弱体化中 ${boss.weaknessTimer.toFixed(1)}秒　通常弾3倍 / ボス弾が遅い`;
        } else {
            weaknessNotice.style.display = "none";
        }
    }

    function createExtraGimmick(type) {
        if (!boss || gimmick) return;

        const level = Math.max(1, Number(boss.level) || 1);
        const steps = Math.floor((level - 1) / 2);
        const centerX = W / 2;
        const y = Math.max(230, Math.min(H - 195, boss.y + boss.size * 0.85 + 38));
        const targetCount = (n) => Math.max(3, Math.min(5, n));
        const base = {
            type,
            x: centerX,
            y,
            radius: type === "armorParts" ? 31 : 34,
            pulse: 0,
            life: 90,
            timer: 0,
            hits: 0,
            open: false,
            targets: [],
            hp: 0,
            maxHp: 0
        };

        if (type === "armorParts") {
            const count = targetCount(3 + Math.floor((level - 1) / 4));
            const spacing = Math.min(100, (W - 100) / Math.max(1, count - 1));
            base.timer = 15 + steps * 0.35;
            base.hp = count * 2;
            base.maxHp = base.hp;
            base.targets = Array.from({ length: count }, (_, index) => ({
                x: Math.max(34, Math.min(W - 34, centerX + (index - (count - 1) / 2) * spacing)),
                y: y + (index % 2 ? -8 : 10),
                hp: 2,
                maxHp: 2,
                destroyed: false,
                label: String(index + 1)
            }));
            base.description = `青い装甲パーツ${count}枚を撃ち壊せ！各パーツは2発で破壊。`;
            base.title = "🔷 ボス装甲を破壊！";
            setGimmickText(base.title, base.description, "#65e7ff");
        } else if (type === "bombFuse") {
            const count = Math.min(5, 3 + Math.floor((level - 1) / 5));
            const spacing = Math.min(100, (W - 100) / Math.max(1, count - 1));
            base.timer = 8 + steps * 0.5;
            base.hp = count;
            base.maxHp = count;
            base.targets = Array.from({ length: count }, (_, index) => ({
                x: Math.max(34, Math.min(W - 34, centerX + (index - (count - 1) / 2) * spacing)),
                y: y + (index % 2 ? -8 : 10),
                hp: 1,
                maxHp: 1,
                destroyed: false,
                label: String(index + 1)
            }));
            base.description = `導火線${count}本を制限時間内に全部撃て！失敗すると爆発！`;
            base.title = "💣 爆弾解除！";
            setGimmickText(base.title, base.description, "#ff9a45");
        } else if (type === "energyDrain") {
            base.timer = 9 + steps * 0.45;
            base.hp = 8 + steps;
            base.maxHp = base.hp;
            base.targets = [{ x: centerX, y, hp: base.hp, maxHp: base.maxHp, destroyed: false, label: "CORE" }];
            base.description = `紫のコアを${base.hp}発撃て！吸収を止めろ！`;
            base.title = "🟣 エネルギー吸収を止めろ！";
            setGimmickText(base.title, base.description, "#dc8cff");
        } else {
            return;
        }

        gimmick = base;
    }

    function completeExtraGimmick(type) {
        if (!boss || !gimmick) return;

        // 装甲は従来計算のちょうど半分。爆弾・吸収も報酬ダメージを控えめに。
        const damage = type === "armorParts"
            ? 210 + wave * 19 + boss.level * 125
            : type === "bombFuse"
                ? 310 + wave * 21 + boss.level * 140
                : 180 + wave * 20 + boss.level * 125;

        boss.hp = Math.max(0, boss.hp - damage);
        boss.attackTimer = Math.max(boss.attackTimer, 1.3);
        boss.gimmickCooldown = boss.level === 1 ? 4.5 : boss.level === 2 ? 1.8 : 1.0;
        score += type === "bombFuse" ? 1800 : 1400;
        combo += type === "bombFuse" ? 5 : 3;

        for (let i = 0; i < 18; i++) {
            boom(
                boss.x + (Math.random() - 0.5) * 150,
                boss.y + (Math.random() - 0.5) * 100,
                true
            );
        }

        const title = type === "armorParts"
            ? "✅ 装甲破壊！ボスにダメージ！"
            : type === "bombFuse"
                ? "✅ 爆弾解除成功！"
                : "✅ エネルギー吸収を阻止！";
        setGimmickText(title, `ボスに ${Math.round(damage).toLocaleString("ja-JP")} ダメージ！`, "#7dffb1");
        gimmick = null;
        if (typeof updateHUD === "function") updateHUD();
        if (boss && boss.hp <= 0) defeatBoss();
    }

    function failExtraGimmick(type) {
        if (!boss || !gimmick) return;
        if (type === "bombFuse") {
            takeDamage(1);
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 * i) / 8;
                enemyBullets.push({
                    x: gimmick.x,
                    y: gimmick.y,
                    vx: Math.cos(angle) * (170 + boss.level * 12),
                    vy: Math.sin(angle) * (170 + boss.level * 12),
                    r: 6,
                    life: 3.8,
                    kind: "boss"
                });
            }
            flash = Math.max(flash, 0.22);
            shake = Math.max(shake, 12);
        }

        const heal = type === "energyDrain"
            ? 100 + boss.level * 30
            : type === "armorParts"
                ? 50 + boss.level * 25
                : 45 + boss.level * 20;
        boss.hp = Math.min(boss.maxHp, boss.hp + heal);
        boss.gimmickCooldown = boss.level === 1 ? 3.4 : 1.1;
        gimmick = null;
        setGimmickText(
            type === "bombFuse" ? "💥 爆弾が爆発！" :
            type === "energyDrain" ? "🟣 吸収完了：ボスが少し回復" :
            "🛡 装甲が修復された！",
            `ボスHP +${heal}`,
            "#ff7777"
        );
        if (typeof updateHUD === "function") updateHUD();
    }

    function extraTargetHit(targetIndex) {
        if (!gimmick || !boss) return false;
        const type = gimmick.type;
        if (!extraGimmickTypes.includes(type)) return false;
        const target = gimmick.targets[targetIndex];
        if (!target || target.destroyed) return true;

        if (type === "armorParts") {
            target.hp--;
            gimmick.hp = Math.max(0, gimmick.hp - 1);
            score += 60;
            boom(target.x, target.y, true);
            if (target.hp <= 0) {
                target.destroyed = true;
                target.x = -999;
                target.y = -999;
            }
            const remaining = gimmick.targets.filter(item => !item.destroyed).length;
            const text = document.getElementById("gimmickText");
            if (text) text.textContent = `装甲破壊 ${gimmick.targets.length - remaining} / ${gimmick.targets.length}　残り ${gimmick.timer.toFixed(1)}秒`;
            if (remaining === 0) completeExtraGimmick(type);
            return true;
        }

        if (type === "bombFuse") {
            const hitX = target.x;
            const hitY = target.y;
            target.destroyed = true;
            target.x = -999;
            target.y = -999;
            gimmick.hp = Math.max(0, gimmick.hp - 1);
            score += 100;
            boom(hitX, hitY, true);
            const remaining = gimmick.targets.filter(item => !item.destroyed).length;
            const text = document.getElementById("gimmickText");
            if (text) text.textContent = `導火線 ${gimmick.targets.length - remaining} / ${gimmick.targets.length} 解除　残り ${gimmick.timer.toFixed(1)}秒`;
            if (remaining === 0) completeExtraGimmick(type);
            return true;
        }

        if (type === "energyDrain") {
            gimmick.hp--;
            gimmick.hits++;
            score += 60;
            boom(target.x, target.y, true);
            const text = document.getElementById("gimmickText");
            if (text) text.textContent = `吸収阻止まで ${gimmick.hp} 発！　残り ${gimmick.timer.toFixed(1)}秒`;
            if (gimmick.hp <= 0) completeExtraGimmick(type);
            return true;
        }
        return false;
    }

    // 最初のシールドは、ボスHPを直接削らず弱体化させる。
    hitGimmick = function (targetIndex = -1) {
        if (!gimmick || !boss) return;
        if (gimmick.type === "shield") {
            gimmick.hp--;
            gimmick.hits++;
            score += 80;
            boom(gimmick.x, gimmick.y, true);
            const text = document.getElementById("gimmickText");
            if (text) text.textContent = `シールド破壊 ${gimmick.maxHp - gimmick.hp} / ${gimmick.maxHp}`;
            if (gimmick.hp <= 0) {
                boss.weaknessTimer = 12 + Math.min(8, Math.floor(Math.max(0, boss.level - 1) / 2));
                boss.attackTimer = Math.max(boss.attackTimer, 1.2);
                score += 900;
                combo += 4;
                for (let i = 0; i < 20; i++) boom(boss.x + (Math.random() - 0.5) * 100, boss.y + (Math.random() - 0.5) * 80, true);
                gimmick = null;
                boss.gimmickCooldown = boss.level === 1 ? 4.5 : boss.level === 2 ? 1.8 : 1;
                setGimmickText("🛡 シールド破壊！", "ボス弱体化！通常弾3倍ダメージ・ボスの弾速ダウン！", "#65e7ff");
                if (typeof updateHUD === "function") updateHUD();
            }
            return;
        }
        if (extraTargetHit(targetIndex)) return;
        return originalHitGimmick(targetIndex);
    };

    // レベルの上昇に応じて、移動的・時間制限を段階的に調整。
    // WAITタイプは移動弱点に置き換える。
    const spawnWithDifficulty = function () {
        originalSpawnGimmick();
        if (!boss || !gimmick) return;

        const level = Math.max(1, Number(boss.level) || 1);
        const steps = Math.floor((level - 1) / 2);

        if (gimmick.type === "pulse") {
            gimmick.type = "moving";
            gimmick.dir = Math.random() < 0.5 ? -1 : 1;
            gimmick.hp = 10 + steps;
            gimmick.maxHp = gimmick.hp;
            gimmick.life = 15 + steps * 0.75;
            gimmick.radius = 34;
            setGimmickText("🎯 動く弱点！", `動くコアを ${gimmick.hp} 回撃て！　制限 ${gimmick.life.toFixed(1)}秒`, "#ffe600");
        } else if (gimmick.type === "moving") {
            gimmick.hp = 10 + steps;
            gimmick.maxHp = gimmick.hp;
            gimmick.life = 15 + steps * 0.75;
            setGimmickText("⚠ 高速弱点", `動く弱点を ${gimmick.hp} 回撃て！　制限 ${gimmick.life.toFixed(1)}秒`, "#ffe600");
        } else if (gimmick.type === "clock") {
            gimmick.hp = 10 + steps;
            gimmick.maxHp = gimmick.hp;
            gimmick.life = 3.2 + steps * 0.4;
            setGimmickText("⚠ 時間制限", `${gimmick.life.toFixed(1)}秒以内に ${gimmick.hp} 回撃て！`, "#ffe600");
        } else if (extraGimmickTypes.includes(gimmick.type)) {
            // 新ギミックは生成時点でレベル調整済み。表示だけ合わせる。
            if (gimmick.type === "armorParts" || gimmick.type === "bombFuse") {
                const text = document.getElementById("gimmickText");
                if (text) text.textContent += `　制限 ${gimmick.timer.toFixed(1)}秒`;
            }
        }
    };

    // 追加3ギミックを含む、既存のランダム出現を維持。
    const spawnReplacement = function () {
        if (!boss || gimmick) return;
        if (boss.gimmickCount === 0) {
            originalSpawnGimmick();
            return;
        }
        if (Math.random() < 0.58) {
            const type = extraGimmickTypes[extraGimmickCycle % extraGimmickTypes.length];
            extraGimmickCycle++;
            createExtraGimmick(type);
            return;
        }
        spawnWithDifficulty();
    };
    spawnGimmick = spawnReplacement;

    // 追加ギミックの命中処理。strict modeでも動くようハンドラーを明示する。
    const shieldHandler = function (targetIndex = -1) {
        if (!gimmick || !boss || gimmick.type !== "shield") return originalHitGimmick(targetIndex);
        gimmick.hp--;
        gimmick.hits++;
        score += 80;
        boom(gimmick.x, gimmick.y, true);
        const text = document.getElementById("gimmickText");
        if (text) text.textContent = `シールド破壊 ${gimmick.maxHp - gimmick.hp} / ${gimmick.maxHp}`;
        if (gimmick.hp <= 0) {
            boss.weaknessTimer = 12 + Math.min(8, Math.floor(Math.max(0, boss.level - 1) / 2));
            boss.attackTimer = Math.max(boss.attackTimer, 1.2);
            score += 900;
            combo += 4;
            for (let i = 0; i < 20; i++) boom(boss.x + (Math.random() - 0.5) * 100, boss.y + (Math.random() - 0.5) * 80, true);
            gimmick = null;
            boss.gimmickCooldown = boss.level === 1 ? 4.5 : boss.level === 2 ? 1.8 : 1;
            setGimmickText("🛡 シールド破壊！", "ボス弱体化！通常弾3倍ダメージ・ボスの弾速ダウン！", "#65e7ff");
            if (typeof updateHUD === "function") updateHUD();
        }
    };
    hitGimmick = function (targetIndex = -1) {
        if (gimmick && gimmick.type === "shield") return shieldHandler(targetIndex);
        if (gimmick && extraTargetHit(targetIndex)) return;
        return originalHitGimmick(targetIndex);
    };

    function updateExtraGimmick(dt) {
        if (!boss || !gimmick || !extraGimmickTypes.includes(gimmick.type)) return;
        const type = gimmick.type;
        gimmick.timer -= dt;
        gimmick.pulse = (gimmick.pulse || 0) + dt;
        if (type === "energyDrain") {
            // 高レベルでも吸収回復が強くなりすぎないよう抑える。
            boss.hp = Math.min(boss.maxHp, boss.hp + (12 + boss.level * 4) * dt);
        }
        if (type === "armorParts") {
            const text = document.getElementById("gimmickText");
            if (text) text.textContent = `装甲を破壊！ ${gimmick.targets.filter(t => t.destroyed).length} / ${gimmick.targets.length}　残り ${gimmick.timer.toFixed(1)}秒`;
        } else if (type === "bombFuse") {
            const remaining = gimmick.targets.filter(t => !t.destroyed).length;
            const text = document.getElementById("gimmickText");
            if (text) text.textContent = `導火線を解除 ${gimmick.targets.length - remaining} / ${gimmick.targets.length}　残り ${Math.max(0, gimmick.timer).toFixed(1)}秒`;
        } else if (type === "energyDrain") {
            const text = document.getElementById("gimmickText");
            if (text) text.textContent = `吸収停止まで ${gimmick.hp} 発！　残り ${gimmick.timer.toFixed(1)}秒`;
        }
        if (gimmick && gimmick.timer <= 0) failExtraGimmick(type);
    }

    updateBoss = function (dt) {
        if (boss && boss.weaknessTimer > 0) boss.weaknessTimer = Math.max(0, boss.weaknessTimer - dt);
        const bossAtStart = boss;
        const firstNewBullet = enemyBullets.length;
        originalUpdateBoss(dt);
        updateExtraGimmick(dt);

        // 弱体化中はボスから新しく出た弾を遅くする。
        if (boss && boss === bossAtStart && boss.weaknessTimer > 0) {
            for (let i = firstNewBullet; i < enemyBullets.length; i++) {
                const bullet = enemyBullets[i];
                if (!bullet || bullet.balanceSlowed) continue;
                bullet.vx *= 0.72;
                bullet.vy *= 0.72;
                bullet.balanceSlowed = true;
            }
        }
        renderWeaknessNotice();
    };

    function drawExtraGimmick() {
        if (!gimmick || !extraGimmickTypes.includes(gimmick.type)) return;
        const g = gimmick;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";

        if (g.type === "energyDrain" && boss) {
            ctx.save();
            ctx.globalAlpha = 0.38 + Math.sin(g.pulse * 7) * 0.12;
            ctx.strokeStyle = "#d77dff";
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 9]);
            ctx.shadowColor = "#d77dff";
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(g.x, g.y);
            ctx.lineTo(boss.x, boss.y + 30);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        if (g.type === "armorParts" || g.type === "bombFuse") {
            g.targets.forEach((t, i) => {
                if (t.destroyed) return;
                ctx.save();
                ctx.translate(t.x, t.y);
                const r = g.type === "armorParts" ? 27 : 24;
                ctx.shadowBlur = 14;
                ctx.shadowColor = g.type === "armorParts" ? "#55eaff" : "#ff522e";
                ctx.fillStyle = g.type === "armorParts" ? (t.hp === 2 ? "#159ac7" : "#f5b942") : "#bd241f";
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.beginPath();
                if (g.type === "armorParts") {
                    for (let n = 0; n < 6; n++) {
                        const angle = -Math.PI / 2 + n * Math.PI / 3;
                        const xx = Math.cos(angle) * r;
                        const yy = Math.sin(angle) * r;
                        if (n === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
                    }
                    ctx.closePath();
                } else {
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                }
                ctx.fill();
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.fillStyle = "#fff";
                ctx.font = "1000 16px system-ui,sans-serif";
                ctx.fillText(g.type === "armorParts" ? (t.hp === 2 ? "Ⅱ" : "Ⅰ") : "!", 0, 0);
                ctx.restore();
                ctx.fillStyle = "#fff";
                ctx.font = "900 11px system-ui,sans-serif";
                ctx.fillText(g.type === "armorParts" ? `装甲 ${t.label}` : `導火線 ${t.label}`, t.x, t.y + 38);
            });
        } else if (g.type === "energyDrain") {
            const r = 31 + Math.sin(g.pulse * 6) * 3;
            ctx.shadowBlur = 18;
            ctx.shadowColor = "#d77dff";
            ctx.fillStyle = "#922bd4";
            ctx.strokeStyle = "#f0c1ff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#fff";
            ctx.font = "1000 17px system-ui,sans-serif";
            ctx.fillText(String(Math.max(0, g.hp)), g.x, g.y);
            ctx.font = "900 12px system-ui,sans-serif";
            ctx.fillText("吸収コア", g.x, g.y + 44);
        }

        const maxTime = g.type === "armorParts" ? 15 + Math.floor((Math.max(1, boss?.level || 1) - 1) / 2) * 0.35
            : g.type === "bombFuse" ? 8 + Math.floor((Math.max(1, boss?.level || 1) - 1) / 2) * 0.5
            : 9 + Math.floor((Math.max(1, boss?.level || 1) - 1) / 2) * 0.45;
        const barW = Math.min(240, W * 0.62);
        const barX = (W - barW) / 2;
        const barY = Math.min(H - 135, g.y + 70);
        const ratio = Math.max(0, Math.min(1, g.timer / maxTime));
        ctx.fillStyle = "rgba(0,0,0,.8)";
        ctx.fillRect(barX, barY, barW, 11);
        ctx.fillStyle = g.type === "armorParts" ? "#45dcff" : g.type === "bombFuse" ? "#ff493c" : "#cb65ff";
        ctx.fillRect(barX, barY, barW * ratio, 11);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, 11);
        ctx.restore();
    }

    draw = function () {
        const extraActive = !!(gimmick && extraGimmickTypes.includes(gimmick.type));
        if (!extraActive) {
            originalDraw();
            return;
        }
        const savedGimmick = gimmick;
        gimmick = null;
        try {
            originalDraw();
        } finally {
            gimmick = savedGimmick;
        }
        drawExtraGimmick();
    };

    // If the browser blocks a cosmetic helper, leave the gameplay mechanics active.
    renderWeaknessNotice();
    console.info("[ボス調整] ダメージ・シールド弱体化・段階的難易度を適用しました。");
})();
/*
 * ボスギミック調整パッチ
 * game.js の一番下（現在のボスギミック調整パッチの後ろ）に追加してください。
 * 既存のコードは削除しません。
 *
 * 変更点:
 * - 時間制限を全体的に1.5倍に延長
 * - シールド破壊後の通常弾ダメージ: ボスLv1=20倍、Lv2=15倍、Lv3以降=10倍
 * - 時間制限表示と補給・追加ギミックのゲージ表示も合わせて調整
 */
(() => {
    "use strict";

    const TIME_LIMIT_MULTIPLIER = 1.5;
    const shieldDamageMultiplier = level =>
        Math.max(10, 20 - Math.max(0, Math.floor(Number(level) || 1) - 1) * 5);

    // 1. シールド弱体化中の通常弾ダメージをボスレベルに合わせる。
    // 現在のバランスパッチが設定した「3倍」処理を20x / 15x / 10xに差し替える。
    if (typeof updateBullets === "function") {
        const source = updateBullets.toString();
        const oldDamagePattern = /boss\.hp\s*-=?\s*\(\s*boss\.weaknessTimer\s*>\s*0\s*\?\s*3\s*:\s*1\s*\)\s*;/;
        const newDamage = "boss.hp -= (boss.weaknessTimer > 0 ? Math.max(10, 20 - Math.max(0, Math.floor(Number(boss.level) || 1) - 1) * 5) : 1);";
        let updatedSource = source.replace(oldDamagePattern, newDamage);

        // 元のコード表記が異なる場合にも対応。
        if (updatedSource === source && source.includes("boss.hp--;")) {
            updatedSource = source.replace(
                "boss.hp--;",
                newDamage
            );
        }

        if (updatedSource !== source) {
            updateBullets = eval(`(${updatedSource})`);
        } else {
            console.warn("[ボス調整] 通常弾ダメージの置換対象が見つかりませんでした。現在のupdateBulletsを確認してください。");
        }
    }

    // 2. シールド破壊時の説明を、実際の倍率に合わせる。
    const previousHitGimmick = hitGimmick;
    hitGimmick = function (targetIndex = -1) {
        const breakingShield = !!(gimmick && gimmick.type === "shield" && gimmick.hp <= 1);
        const result = previousHitGimmick.call(this, targetIndex);

        if (breakingShield && boss && boss.weaknessTimer > 0) {
            const multiplier = shieldDamageMultiplier(boss.level);
            const title = document.getElementById("gimmickTitle");
            const text = document.getElementById("gimmickText");
            if (title) {
                title.textContent = "🛡 シールド破壊！";
                title.style.color = "#65e7ff";
            }
            if (text) {
                text.textContent = `ボス弱体化！通常弾×${multiplier}ダメージ！ボスの弾速も低下！`;
            }
        }

        return result;
    };

    // 3. すべてのギミックの制限時間を1.5倍にする。
    // extra gimmickはlife=90がダミー値なので、timerだけを延長する。
    const previousSpawnGimmick = spawnGimmick;
    spawnGimmick = function (...args) {
        const oldGimmick = gimmick;
        const result = previousSpawnGimmick.apply(this, args);
        if (!gimmick || gimmick === oldGimmick || gimmick.__extendedTimeLimit) {
            return result;
        }

        if (typeof gimmick.timer === "number" && gimmick.timer > 0) {
            gimmick.timer *= TIME_LIMIT_MULTIPLIER;
            gimmick.__timerDisplayScale = TIME_LIMIT_MULTIPLIER;
        } else if (typeof gimmick.life === "number" && gimmick.life > 0) {
            gimmick.life *= TIME_LIMIT_MULTIPLIER;
        }
        gimmick.__extendedTimeLimit = true;
        return result;
    };

    // 4. 通常ギミックにも残り時間を表示し、現在の進捗文を壊さないように更新する。
    const previousUpdateBoss = updateBoss;
    updateBoss = function (dt, ...args) {
        const result = previousUpdateBoss.call(this, dt, ...args);

        if (boss && boss.weaknessTimer > 0) {
            const notice = document.getElementById("bossWeaknessNotice");
            if (notice) {
                const multiplier = shieldDamageMultiplier(boss.level);
                notice.style.display = "block";
                notice.textContent = `🛡 シールド破壊！弱体化 ${boss.weaknessTimer.toFixed(1)}秒　通常弾×${multiplier} / ボス弾が遅い`;
            }
        }

        if (gimmick && typeof gimmick.life === "number" && !("timer" in gimmick) && gimmick.life > 0) {
            const text = document.getElementById("gimmickText");
            if (text) {
                let label = text.textContent || "ギミックを突破しろ！";
                label = label
                    .replace(/\s*⏱\s*残り\s*[\d.]+秒\s*$/, "")
                    .replace(/^\s*[\d.]+秒以内に\s*/, "")
                    .replace(/\s*(?:制限時間|制限|残り)\s*[\d.]+秒(?:以内に)?/g, "")
                    .trim();
                text.textContent = `${label || "ギミックを突破しろ！"}　⏱ 残り ${Math.max(0, gimmick.life).toFixed(1)}秒`;
            }
        }
        return result;
    };

    // 5. 追加ギミックの時間ゲージを1.5倍後の残り時間に合わせて表示。
    // 描画時だけ元の比率に戻すため、実際のタイマーやルールは変わらない。
    const previousDraw = draw;
    draw = function (...args) {
        const activeGimmick = gimmick;
        if (activeGimmick && activeGimmick.__timerDisplayScale > 1 && typeof activeGimmick.timer === "number") {
            const actualTimer = activeGimmick.timer;
            activeGimmick.timer = actualTimer / activeGimmick.__timerDisplayScale;
            try {
                return previousDraw.apply(this, args);
            } finally {
                activeGimmick.timer = actualTimer;
            }
        }
        return previousDraw.apply(this, args);
    };

    console.info("[ボス調整] ギミック時間1.5倍、シールド弱体化ダメージ20x/15x/10xを適用しました。");
})();

/* =============================================================
   FACE SHOOTER FREE-PLAN ADMIN GAMEPLAY CONFIG PATCH
   Copy the entire contents of this file to the very END of js/game.js.
   This is an append-only patch for the currently published game.js version.
   ============================================================= */
(() => {
    const faceShooterAdminRuntime = {
        loaded: false,
        config: {
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
        }
    };
    window.faceShooterAdminRuntime = faceShooterAdminRuntime;

    const normalizeConfig = value => {
        const defaults = faceShooterAdminRuntime.config;
        const input = value && typeof value === "object" ? value : {};
        const number = (key, min, max, integer = false) => {
            let n = Number(input[key] ?? defaults[key]);
            if (!Number.isFinite(n)) n = defaults[key];
            n = Math.max(min, Math.min(max, n));
            return integer ? Math.round(n) : n;
        };
        const knownGimmicks = ["weak", "moving", "shield", "clock", "ring", "decoy", "rain", "cross", "clone", "overheat", "bombcore", "armorParts", "bombFuse", "energyDrain"];
        return {
            bossHpMultiplier: number("bossHpMultiplier", 0.1, 10),
            bossSpeedMultiplier: number("bossSpeedMultiplier", 0.1, 4),
            bossAttackFrequencyMultiplier: number("bossAttackFrequencyMultiplier", 0.1, 5),
            bossBulletSpeedMultiplier: number("bossBulletSpeedMultiplier", 0.1, 4),
            playerDamageMultiplier: number("playerDamageMultiplier", 0.1, 50),
            incomingDamageMultiplier: number("incomingDamageMultiplier", 0, 10),
            gimmickTimeMultiplier: number("gimmickTimeMultiplier", 0.25, 10),
            itemEffectDurationMultiplier: number("itemEffectDurationMultiplier", 0.1, 10),
            itemLifetimeMultiplier: number("itemLifetimeMultiplier", 0.1, 10),
            itemDropRateMultiplier: number("itemDropRateMultiplier", 0, 5),
            playerMaxHp: number("playerMaxHp", 1, 20, true),
            bossAttacksEnabled: input.bossAttacksEnabled !== false,
            itemDropsEnabled: input.itemDropsEnabled !== false,
            playerInvincible: input.playerInvincible === true,
            disabledGimmicks: Array.isArray(input.disabledGimmicks) ? [...new Set(input.disabledGimmicks.filter(id => knownGimmicks.includes(id)))] : []
        };
    };

    function replaceFunctionBody(fn, replacements, label) {
        if (typeof fn !== "function") {
            console.warn(`[管理設定] ${label}: 対象関数が見つかりません。`);
            return fn;
        }
        let source = fn.toString();
        const original = source;
        for (const [from, to] of replacements) {
            source = source.replace(from, to);
        }
        if (source === original) {
            console.warn(`[管理設定] ${label}: ソース置換が一致しませんでした。ゲーム本体の更新を確認してください。`);
            return fn;
        }
        try {
            return eval(`(${source})`);
        } catch (error) {
            console.error(`[管理設定] ${label}: 関数パッチに失敗しました。`, error);
            return fn;
        }
    }

    // Wait for gameplay settings, so a very fast click cannot start the game with stale defaults.
    const adminStartButton = document.getElementById("startBtn");
    if (adminStartButton) adminStartButton.disabled = true;
    if (typeof updateAuthUI === "function") {
        const faceShooterOriginalUpdateAuthUI = updateAuthUI;
        updateAuthUI = function (...args) {
            faceShooterOriginalUpdateAuthUI.apply(this, args);
            if (!faceShooterAdminRuntime.loaded && adminStartButton) adminStartButton.disabled = true;
        };
    }

    // Health-cap edits in the original functions. These replacements preserve the existing game logic.
    collectItem = replaceFunctionBody(collectItem, [
        ["Math.min(5, hp + 1)", "Math.min(faceShooterAdminRuntime.config.playerMaxHp, hp + 1)"],
        ["Math.min(5, hp + 2)", "Math.min(faceShooterAdminRuntime.config.playerMaxHp, hp + 2)"]
    ], "collectItem HP上限");

    dropItem = replaceFunctionBody(dropItem, [
        ["const chance = elite ? 0.32 : 0.08;", "const chance = Math.max(0, Math.min(1, (elite ? 0.32 : 0.08) * faceShooterAdminRuntime.config.itemDropRateMultiplier));"],
        ["if (hp >= 5 && (type.id === \"heal\" || type.id === \"heal2\"))", "if (hp >= faceShooterAdminRuntime.config.playerMaxHp && (type.id === \"heal\" || type.id === \"heal2\"))"]
    ], "dropItem ドロップ率・回復判定");

    // Admin-adjustable player health and HUD display.
    const faceShooterOriginalResetGame = resetGame;
    resetGame = function (...args) {
        faceShooterOriginalResetGame.apply(this, args);
        hp = faceShooterAdminRuntime.config.playerMaxHp;
        if (typeof updateHUD === "function") updateHUD();
    };

    const faceShooterOriginalUpdateHUD = updateHUD;
    updateHUD = function (...args) {
        const result = faceShooterOriginalUpdateHUD.apply(this, args);
        const maxHp = faceShooterAdminRuntime.config.playerMaxHp;
        const hpEl = document.getElementById("hp");
        if (hpEl) hpEl.textContent = `${hp} / ${maxHp}`;
        const hpFill = document.getElementById("hpFill");
        if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, hp / Math.max(1, maxHp) * 100))}%`;
        const hpHearts = document.getElementById("hpHearts");
        if (hpHearts) hpHearts.textContent = "❤️".repeat(Math.max(0, Math.floor(hp))) + "🖤".repeat(Math.max(0, maxHp - Math.floor(hp)));
        return result;
    };

    // Item effect timers and collectible lifetime.
    const faceShooterOriginalCollectItem = collectItem;
    collectItem = function (item, ...args) {
        const before = { rapidTimer, pierceTimer, magnetTimer, scoreBoostTimer };
        const result = faceShooterOriginalCollectItem.call(this, item, ...args);
        const multiplier = faceShooterAdminRuntime.config.itemEffectDurationMultiplier;
        if (item?.type === "rapid") rapidTimer = Math.max(before.rapidTimer, 8 * multiplier);
        if (item?.type === "pierce") pierceTimer = Math.max(before.pierceTimer, 8 * multiplier);
        if (item?.type === "magnet") magnetTimer = Math.max(before.magnetTimer, 8 * multiplier);
        if (item?.type === "double") scoreBoostTimer = Math.max(before.scoreBoostTimer, 8 * multiplier);
        return result;
    };

    const faceShooterOriginalDropItem = dropItem;
    dropItem = function (...args) {
        if (!faceShooterAdminRuntime.config.itemDropsEnabled) return;
        const beforeLength = items.length;
        faceShooterOriginalDropItem.apply(this, args);
        const multiplier = faceShooterAdminRuntime.config.itemLifetimeMultiplier;
        for (let i = beforeLength; i < items.length; i++) items[i].life *= multiplier;
    };

    const faceShooterOriginalSpawnBossSupply = spawnBossSupply;
    spawnBossSupply = function (...args) {
        if (!faceShooterAdminRuntime.config.itemDropsEnabled) return;
        const beforeLength = items.length;
        faceShooterOriginalSpawnBossSupply.apply(this, args);
        const multiplier = faceShooterAdminRuntime.config.itemLifetimeMultiplier;
        for (let i = beforeLength; i < items.length; i++) items[i].life *= multiplier;
    };

    // Boss HP multiplier is applied to each newly spawned boss.
    const faceShooterOriginalStartBoss = startBoss;
    startBoss = function (...args) {
        const result = faceShooterOriginalStartBoss.apply(this, args);
        if (boss) {
            const multiplier = faceShooterAdminRuntime.config.bossHpMultiplier;
            boss.maxHp = Math.max(1, Math.round(boss.maxHp * multiplier));
            boss.hp = Math.max(1, Math.min(boss.maxHp, Math.round(boss.hp * multiplier)));
            if (typeof updateHUD === "function") updateHUD();
        }
        return result;
    };

    // Damage settings must be applied inside updateBullets, before the game can call defeatBoss().
    updateBullets = replaceFunctionBody(updateBullets, [
        [/boss\.hp\s*-=?\s*\(([^;\n]*boss\.weaknessTimer[^;\n]*)\)\s*;/, "boss.hp -= ($1) * faceShooterAdminRuntime.config.playerDamageMultiplier;"],
        ["boss.hp--;", "boss.hp -= faceShooterAdminRuntime.config.playerDamageMultiplier;"]
    ], "updateBullets 与えるダメージ");

    if (typeof useBomb === "function") {
        useBomb = replaceFunctionBody(useBomb, [
            ["boss.hp -= 150;", "boss.hp -= 150 * faceShooterAdminRuntime.config.playerDamageMultiplier;"]
        ], "useBomb 爆弾ダメージ");
    }

    // Player damage received / invincibility test toggle.
    const faceShooterOriginalTakeDamage = takeDamage;
    takeDamage = function (amount = 1, ...args) {
        if (faceShooterAdminRuntime.config.playerInvincible) return;
        return faceShooterOriginalTakeDamage.call(this, Math.max(0, amount * faceShooterAdminRuntime.config.incomingDamageMultiplier), ...args);
    };

    // Gimmick duration/disable toggle and boss movement, attack cadence, and projectile speed.
    const faceShooterOriginalSpawnGimmick = spawnGimmick;
    spawnGimmick = function (...args) {
        if (!boss) return;
        const disabled = faceShooterAdminRuntime.config.disabledGimmicks;
        if (disabled.length >= 14) {
            boss.gimmickCooldown = 999999;
            return;
        }
        const before = gimmick;
        faceShooterOriginalSpawnGimmick.apply(this, args);
        if (!gimmick || gimmick === before) return;
        if (disabled.includes(gimmick.type)) {
            gimmick = null;
            boss.gimmickCooldown = 0.25;
            return;
        }
        const durationMultiplier = faceShooterAdminRuntime.config.gimmickTimeMultiplier;
        if (Number.isFinite(gimmick.life) && gimmick.life > 0) gimmick.life *= durationMultiplier;
        if (Number.isFinite(gimmick.timer) && gimmick.timer > 0) gimmick.timer *= durationMultiplier;
    };

    const faceShooterOriginalBossAttack = bossAttack;
    bossAttack = function (...args) {
        if (!faceShooterAdminRuntime.config.bossAttacksEnabled) return;
        const beforeLength = enemyBullets.length;
        const result = faceShooterOriginalBossAttack.apply(this, args);
        const multiplier = faceShooterAdminRuntime.config.bossBulletSpeedMultiplier;
        for (let i = beforeLength; i < enemyBullets.length; i++) {
            const bullet = enemyBullets[i];
            if (!bullet || bullet._adminSpeedApplied) continue;
            bullet.vx *= multiplier;
            bullet.vy *= multiplier;
            bullet._adminSpeedApplied = true;
        }
        return result;
    };

    const faceShooterOriginalUpdateBoss = updateBoss;
    updateBoss = function (dt, ...args) {
        const currentBoss = boss;
        const beforeX = currentBoss?.x;
        const beforeY = currentBoss?.y;
        const beforeAttackCount = currentBoss?.attackCount || 0;
        const beforeBulletCount = enemyBullets.length;
        const result = faceShooterOriginalUpdateBoss.call(this, dt, ...args);
        if (boss && boss === currentBoss) {
            const speedMultiplier = faceShooterAdminRuntime.config.bossSpeedMultiplier;
            const minX = boss.size * 0.62;
            const maxX = Math.max(minX, W - boss.size * 0.62);
            boss.x = Math.max(minX, Math.min(maxX, beforeX + (boss.x - beforeX) * speedMultiplier));
            boss.y = Math.max(boss.size * 0.62, Math.min(H * 0.38, beforeY + (boss.y - beforeY) * speedMultiplier));
            const countDelta = Math.max(0, (boss.attackCount || 0) - beforeAttackCount);
            if (countDelta > 0) {
                const frequency = faceShooterAdminRuntime.config.bossAttackFrequencyMultiplier;
                boss.attackTimer = Math.max(0.05, boss.attackTimer / Math.pow(frequency, countDelta));
            }
        }
        const bulletMultiplier = faceShooterAdminRuntime.config.bossBulletSpeedMultiplier;
        for (let i = beforeBulletCount; i < enemyBullets.length; i++) {
            const bullet = enemyBullets[i];
            if (!bullet || bullet._adminSpeedApplied) continue;
            bullet.vx *= bulletMultiplier;
            bullet.vy *= bulletMultiplier;
            bullet._adminSpeedApplied = true;
        }
        const notice = document.getElementById("bossWeaknessNotice");
        if (notice && boss && boss.weaknessTimer > 0) {
            const base = Math.max(10, 20 - Math.max(0, Math.floor(Number(boss.level) || 1) - 1) * 5);
            const actual = Math.max(1, base * faceShooterAdminRuntime.config.playerDamageMultiplier);
            notice.textContent = `🛡 シールド破壊！弱体化中 ${boss.weaknessTimer.toFixed(1)}秒　通常弾×${actual} / ボス弾が遅い`;
        }
        return result;
    };

    async function loadAdminGameplayConfig() {
        try {
            // Sparkプランで使えるFirestoreクライアントSDKのみを使用する。
            if (!firebaseReady || !db) throw new Error("Firebase/Firestoreの設定を確認してください。");

            // 利用停止フラグがあるユーザーは、ゲームを開始させずログイン画面へ戻す。
            if (!guestMode && auth) {
                await auth.authStateReady();
                const user = auth.currentUser;
                if (user) {
                    const accessSnapshot = await getDoc(doc(db, "accessControl", user.uid));
                    if (accessSnapshot.exists() && accessSnapshot.data().disabled === true) {
                        faceShooterAdminRuntime.loaded = true;
                        const status = document.getElementById("onlineStatus");
                        if (status) status.textContent = "このアカウントは管理者によって利用停止されています。";
                        if (adminStartButton) adminStartButton.disabled = true;
                        window.location.replace("./login.html?disabled=1");
                        return;
                    }
                }
            }

            const snapshot = await getDoc(doc(db, "adminSettings", "gameplay"));
            faceShooterAdminRuntime.config = normalizeConfig(snapshot.exists() ? snapshot.data() : {});
        } catch (error) {
            console.error("管理設定を読み込めません。標準設定で続行します。", error);
        } finally {
            faceShooterAdminRuntime.loaded = true;
            if (typeof updateHUD === "function") updateHUD();
            if (typeof updateAuthUI === "function") updateAuthUI();
        }
    }

    void loadAdminGameplayConfig();
})();
/* =============================================================
   FACE SHOOTER FREE-PLAN ADMIN SITE LINK
   使い方: このファイルの全文を、既存の js/game.js の一番最後へ追加。
   管理者としてログインしている場合だけ、出撃画面に管理サイトへのリンクを表示。
   Firebase Cloud Functions / 有料プランは不要。
   ============================================================= */
(() => {
    "use strict";

    const START_BUTTON_ID = "startBtn";
    const ADMIN_LINK_ID = "adminSiteLink";

    function ensureAdminLink() {
        const startButton = document.getElementById(START_BUTTON_ID);
        if (!startButton) {
            console.warn("管理サイトリンク: 出撃ボタン #startBtn が見つかりません。");
            return null;
        }

        let link = document.getElementById(ADMIN_LINK_ID);
        if (!link) {
            link = document.createElement("a");
            link.id = ADMIN_LINK_ID;
            link.href = "./admin.html";
            link.textContent = "🛠 管理サイトを開く";
            link.setAttribute("aria-label", "管理者専用サイトを開く");
            link.style.cssText = [
                "display:none",
                "width:100%",
                "box-sizing:border-box",
                "margin:10px 0 0",
                "padding:12px 16px",
                "border:1px solid #65e7ff",
                "border-radius:10px",
                "background:linear-gradient(135deg,#12314a,#174d66)",
                "color:#ffffff",
                "font:700 15px system-ui,sans-serif",
                "text-align:center",
                "text-decoration:none",
                "cursor:pointer",
                "box-shadow:0 0 14px rgba(101,231,255,.16)"
            ].join(";");
            startButton.insertAdjacentElement("afterend", link);
        }
        return link;
    }

    async function refreshAdminLink() {
        const link = ensureAdminLink();
        if (!link) return;

        // 認証情報が利用できない場合は、誤って表示しない。
        link.style.display = "none";
        if (typeof firebaseReady === "undefined" || !firebaseReady ||
            typeof auth === "undefined" || !auth ||
            typeof db === "undefined" || !db ||
            typeof doc !== "function" || typeof getDoc !== "function") {
            return;
        }

        try {
            await auth.authStateReady();
            const user = auth.currentUser;
            if (!user) return;

            // Firestore の admins/{UID} を確認。role は owner または admin のみ許可。
            const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
            const role = adminSnapshot.exists() ? adminSnapshot.data()?.role : "";
            link.style.display = (role === "owner" || role === "admin") ? "block" : "none";
        } catch (error) {
            // 権限を確認できない場合は非表示にし、管理リンクだけで権限を与えない。
            link.style.display = "none";
            console.warn("管理サイトリンクの権限確認に失敗しました。Firestore Rules と admins/{UID} を確認してください。", error);
        }
    }

    // 出撃画面が描画されたら確認し、認証状態が変わった際も再チェックする。
    ensureAdminLink();
    if (typeof auth !== "undefined" && auth && typeof auth.onAuthStateChanged === "function") {
        auth.onAuthStateChanged(() => { void refreshAdminLink(); });
    }
    void refreshAdminLink();
})();
/* ==================================================
   顔ガチャボタン
================================================== */

(function addFaceGachaButton() {
    const authPanel = document.getElementById("authPanel");
    if (!authPanel) return;

    // 二重追加防止
    if (document.getElementById("faceGachaButton")) return;

    const button = document.createElement("button");
    button.id = "faceGachaButton";
    button.type = "button";
    button.textContent = "🎭 顔ガチャ";
    button.style.cssText = `
        display:block;
        width:100%;
        margin:10px 0;
        min-height:46px;
        padding:10px 14px;
        border:2px solid #ffe600;
        border-radius:12px;
        background:linear-gradient(135deg,#312400,#7a5b00);
        color:#fff;
        font-size:16px;
        font-weight:900;
        cursor:pointer;
        box-shadow:0 4px 0 #000;
    `;

    button.addEventListener("click", () => {
        if (!auth?.currentUser || guestMode) {
            alert("顔ガチャを利用するにはログインしてください。");
            return;
        }

        window.location.href = "./gacha.html";
    });

    authPanel.appendChild(button);

    // ゲスト時はボタンを薄くする
    function updateGachaButton() {
        const loggedIn = !!auth?.currentUser && !guestMode;

        button.disabled = !loggedIn;
        button.style.opacity = loggedIn ? "1" : "0.45";
        button.textContent = loggedIn
            ? "🎭 顔ガチャ"
            : "🔒 顔ガチャ（ログイン必要）";
    }

    updateGachaButton();

    if (auth) {
        auth.onAuthStateChanged?.(() => {
            updateGachaButton();
        });
    }
})();
/* =============================================================
   FACE SHOOTER ADMIN WEB DEBUG BRIDGE
   admin.html -> game.html
   ============================================================= */

(() => {
    "use strict";

    const params =
        new URLSearchParams(
            window.location.search
        );

    if (
        params.get("adminDebug") !== "1"
    ) {
        return;
    }

    const selectedWave =
        Math.max(
            1,
            Math.floor(
                Number(
                    params.get("adminWave")
                ) || 1
            )
        );

    const bossTest =
        params.get("adminBoss") === "1";

    /*
     * 既存のゲーム内管理変数を利用
     */
    if (
        typeof adminStartWave !== "undefined"
    ) {
        adminStartWave =
            selectedWave;
    }

    if (
        typeof adminForceBoss !== "undefined"
    ) {
        adminForceBoss =
            bossTest;
    }

    /*
     * 既存のゲーム内管理UIにも反映
     */
    const waveInput =
        document.getElementById(
            "adminWave"
        );

    if (waveInput) {
        waveInput.value =
            String(selectedWave);
    }

    /*
     * Firebase認証やゲーム初期化が終わるまで待つ。
     */
    let tries = 0;

    const timer =
        setInterval(() => {
            tries++;

            /*
             * ゲームが開始可能になったら起動
             */
            if (
                typeof startGame === "function"
            ) {
                clearInterval(timer);

                /*
                 * 既存のadminStartWaveを使う
                 */
                if (
                    typeof adminStartWave !==
                    "undefined"
                ) {
                    adminStartWave =
                        selectedWave;
                }

                if (
                    typeof adminForceBoss !==
                    "undefined"
                ) {
                    adminForceBoss =
                        bossTest;
                }

                startGame();

                console.info(
                    "[ADMIN DEBUG]",
                    "WAVE:",
                    selectedWave,
                    "BOSS:",
                    bossTest
                );

                return;
            }

            /*
             * 10秒待っても無理なら終了
             */
            if (tries > 100) {
                clearInterval(timer);

                console.warn(
                    "[ADMIN DEBUG] startGame() が見つかりません。"
                );
            }

        }, 100);

})();
