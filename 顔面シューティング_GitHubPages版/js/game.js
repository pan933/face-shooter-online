import { firebaseReady, firebaseConfigError, auth, db } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";




/* ==================================================
   TOUCH CONTROLS
================================================== */

let touchMode = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const touchJoystick = document.getElementById("touchJoystick");
const joystickKnob = document.getElementById("joystickKnob");
const touchShoot = document.getElementById("touchShoot");
const touchBomb = document.getElementById("touchBomb");
const touchShield = document.getElementById("touchShield");
const touchBombCount = document.getElementById("touchBombCount");
const touchShieldCount = document.getElementById("touchShieldCount");
const controlModeBtn = document.getElementById("controlModeBtn");
const cursorSensitivity = document.getElementById("cursorSensitivity");
const cursorSensitivityValue = document.getElementById("cursorSensitivityValue");
let cursorSensitivityLevel = 1.0;
if (cursorSensitivity) {
    cursorSensitivity.addEventListener("input", () => {
        cursorSensitivityLevel = Number(cursorSensitivity.value);
        if (cursorSensitivityValue) cursorSensitivityValue.textContent = cursorSensitivityLevel.toFixed(1);
    });
}

let joystickPointerId = null;
let shootPointerId = null;
let bombPointerId = null;
let shieldPointerId = null;

// タッチ入力状態は、applyControlMode() より前に初期化する
let touchDirX = 0;
let touchDirY = 0;
let touchFireHeld = false;

function applyControlMode() {
    document.body.classList.toggle("touch-mode", touchMode);
    if (controlModeBtn) {
        controlModeBtn.textContent = touchMode ? "🎮 タッチ操作：ON" : "📱 タッチ操作：OFF";
        controlModeBtn.classList.toggle("touchOn", touchMode);
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
    if (joystickKnob) { joystickKnob.style.left = "50%"; joystickKnob.style.top = "50%"; }
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
const FACE_REGISTERED = "face2.png";


const canvas =
    document.getElementById("game");


const ctx =
    canvas.getContext("2d");


const gameWrap =
    document.getElementById("gameWrap");


const faceImage =
    new Image();


faceImage.src = FACE_GUEST;

// ゲストは face.png、登録ユーザーは face2.png を使用する。
// face2.png が未配置・読み込み失敗の場合は face.png に戻す。
function setFaceForMode(isGuest) {
    faceImage.onerror = null;
    if (isGuest) {
        faceImage.src = FACE_GUEST;
        return;
    }
    faceImage.onerror = () => {
        faceImage.onerror = null;
        faceImage.src = FACE_GUEST;
    };
    faceImage.src = FACE_REGISTERED;
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
    resize
);

resize();


/* ==================================================
   RESET
================================================== */

function resetGame() {

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
    pierceTimer = 0;
    magnetTimer = 0;
    scoreBoostTimer = 0;

    boss = null;

    gimmick = null;


    shootCooldown = 0;

    damageCooldown = 0;

    shieldTime = 0;

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

    // ゲストはログインユーザーがいなくてもゲームを開始できる。
    if (!guestMode && (!currentUser || !authReady)) {
        window.location.replace("./login.html");
        return;
    }

    runRecorded = false;
    runRecordPromise = null;
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
    if (!running || paused) return;
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

function quitGame() {
    recordCurrentRun();
    hideQuitConfirm();
    paused = false;
    clearHeldInputs();
    if (pauseOverlay) {
        pauseOverlay.style.display = "none";
        pauseOverlay.setAttribute("aria-hidden", "true");
    }
    if (pauseGameBtn) pauseGameBtn.style.display = "none";
    running = false;
    const quitBtn = document.getElementById("quitGameBtn");
    if (quitBtn) quitBtn.style.display = "none";
    document.getElementById("bossBar").style.display = "none";
    document.getElementById("bossGimmick").style.display = "none";
    document.getElementById("gameover").style.display = "none";
    document.getElementById("start").style.display = "flex";
}

function gameOver() {

    recordCurrentRun();
    running = false;
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
        rapidTimer > 0 ? .11 : .28;


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
            powerLevel,

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
    else type = ITEM_TYPES[10];

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
    rapidTimer = Math.max(0, rapidTimer - dt);
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

        if (Math.hypot(player.x - item.x, player.y - item.y) < 42) {
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
        gimmickCount: 0
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
    const basic = ["weak", "moving", "shield"];
    const advanced = ["weak", "moving", "shield", "clock", "ring", "decoy", "clone", "overheat"];
    const extreme = ["weak", "moving", "shield", "clock", "ring", "decoy", "rain", "cross", "clone", "overheat", "bombcore"];
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
        bombcore: { title: "💣 爆弾コア", text: "緑コア3個だけを撃て！赤を撃つと失敗！", hp: 3, life: 9 }
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
        maxHeat: 100
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

    boss.moveTimer += dt;
    boss.attackTimer -= dt;
    boss.gimmickCooldown -= dt;
    boss.phase += dt;

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

    if (!boss)
        return;


    /*
        通常3方向弾
    */

    const base =
        Math.atan2(

            player.y -
            boss.y,

            player.x -
            boss.x

        );


    for (
        let i = -1;
        i <= 1;
        i++
    ) {

        const angle =
            base +
            i * .17;


        enemyBullets.push({

            x:
                boss.x,

            y:
                boss.y,

            vx:
                Math.cos(
                    angle
                ) *
                300,

            vy:
                Math.sin(
                    angle
                ) *
                300,

            r:
                8,

            life:
                5,

            kind:
                "boss"

        });

    }


    /*
        たまに追加弾幕
    */

    if (
        Math.random() < .3
    ) {

        for (
            let i = 0;
            i < 8;
            i++
        ) {

            const angle =
                i *
                Math.PI *
                2 /
                8;


            enemyBullets.push({

                x:
                    boss.x,

                y:
                    boss.y,

                vx:
                    Math.cos(
                        angle
                    ) *
                    150,

                vy:
                    Math.sin(
                        angle
                    ) *
                    150,

                r:
                    7,

                life:
                    5,

                kind:
                    "boss"

            });

        }

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
    amount = 1
) {

    if (
        damageCooldown > 0
    )
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


    /*
        ボス
    */

    if (boss) {

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

    updateEnemyBullets(dt);
    updateItems(dt);


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
        ctx.shadowBlur = 16;
        ctx.shadowColor = item.color;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = "white";
        ctx.font = "900 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.icon || "?", 0, 0);
        ctx.font = "900 10px sans-serif";
        ctx.fillText(item.label, 0, 36);
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
            const color = gimmick.type === "shield" ? "#168cff" : gimmick.type === "overheat" ? "#ff5a18" : "#ffe600";
            const shape = gimmick.type === "shield" ? "hex" : gimmick.type === "overheat" ? "circle" : "diamond";
            const label = gimmick.type === "shield" ? "🛡" : gimmick.type === "overheat" ? "🔥" : "×";
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
    const gameoverLeaderboardBtn = document.getElementById("gameoverLeaderboardBtn");

    if (guestMode) {
        if (nameEl) nameEl.textContent = "ゲスト";
        if (startButton) startButton.disabled = !authReady;
        if (statusEl) statusEl.textContent = "ゲストモード：アカウント不要・ランキング記録なし";
        if (leaderboardPanel) leaderboardPanel.style.display = "none";
        if (profileActions) profileActions.style.display = "none";
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
    // ゲストのスコアは保存・送信しない。共通ランキングから完全に独立。
    if (guestMode) return;
    if (runRecorded) return runRecordPromise || undefined;
    runRecorded = true;
    runRecordPromise = (async () => {
        const firebaseUser = auth?.currentUser;
        if (!firebaseReady || !firebaseUser || !currentUser || !db) return;
        const scoreValue = Math.max(0, Math.floor(Number(score) || 0));
        const waveValue = Math.max(1, Math.floor(Number(wave) || 1));
        if (scoreValue <= 0 && waveValue <= 1) {
            await renderLeaderboard();
            return;
        }
        try {
            const scoreRef = doc(db, "leaderboard", firebaseUser.uid);
            const oldSnapshot = await getDoc(scoreRef);
            const old = oldSnapshot.exists() ? oldSnapshot.data() : null;
            const isBetter = !old || scoreValue > (Number(old.score) || 0) ||
                (scoreValue === (Number(old.score) || 0) && waveValue > (Number(old.wave) || 1));
            if (isBetter) {
                await setDoc(scoreRef, {
                    uid: firebaseUser.uid,
                    username: currentUser.username || "player",
                    displayName: currentUser.displayName || currentUser.username || "Player",
                    score: scoreValue,
                    wave: waveValue,
                    updatedAt: serverTimestamp()
                });
            }
            await renderLeaderboard();
        } catch (error) {
            console.error("Shared score save failed:", error);
            showLeaderboardError(error.code === "permission-denied"
                ? "記録保存が拒否されました。Firestoreのルールを確認してください。"
                : "記録をクラウドに保存できませんでした。接続を確認してください。");
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
        setFaceForMode(true);
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
        setFaceForMode(false);
        authErrorMessage = "";
        authReady = true;
        updateAuthUI();
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
if (gameoverLeaderboardBtn) gameoverLeaderboardBtn.addEventListener("click", async () => {
    await recordCurrentRun();
    running = false;
    paused = false;
    document.getElementById("gameover").style.display = "none";
    document.getElementById("start").style.display = "flex";
    if (pauseGameBtn) pauseGameBtn.style.display = "none";
    const quitBtn = document.getElementById("quitGameBtn");
    if (quitBtn) quitBtn.style.display = "none";
    updateAuthUI();
    await renderLeaderboard();
});

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
void initializeSharedAuth();

