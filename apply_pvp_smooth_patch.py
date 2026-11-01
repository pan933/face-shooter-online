from pathlib import Path
import shutil
import sys

GAME_JS = Path("顔面シューティング_GitHubPages版/js/game.js")
BACKUP_JS = GAME_JS.with_suffix(".js.pvp-backup")

if not GAME_JS.exists():
    print(f"[ERROR] game.js が見つかりません: {GAME_JS}")
    print("このパッチをリポジトリのルートフォルダで実行してください。")
    sys.exit(1)

text = GAME_JS.read_text(encoding="utf-8")

if "pvpSmoothOpponentX" in text and "now - pvpLastStateSyncAt < 200" in text:
    print("[INFO] PvP滑らか表示パッチはすでに適用されています。")
    sys.exit(0)

old1 = """let pvpLastSentFaceId = "";
let pvpLocalFaceImageUrl = "";
const pvpProcessedHitIds = new Set();"""

new1 = """let pvpLastSentFaceId = "";
let pvpLocalFaceImageUrl = "";

// PvPの相手表示専用位置。
// Firestoreから受信した位置を直接描画せず、毎フレーム補間して滑らかに表示する。
let pvpSmoothOpponentX = null;
let pvpSmoothOpponentY = null;
let pvpSmoothLastFrameAt = 0;
let pvpSmoothLoopRunning = false;

const pvpProcessedHitIds = new Set();

function startPvpSmoothRender() {
    if (pvpSmoothLoopRunning) return;
    pvpSmoothLoopRunning = true;
    pvpSmoothLastFrameAt = performance.now();

    const tick = (now) => {
        if (!pvpSmoothLoopRunning) return;

        const dt = Math.min(50, Math.max(1, now - pvpSmoothLastFrameAt));
        pvpSmoothLastFrameAt = now;

        if (pvpStarted && pvpOpponentState && pvpRemoteAvatar) {
            const targetX = Number.isFinite(Number(pvpOpponentState.x))
                ? Number(pvpOpponentState.x)
                : 0.5;
            const targetY = Number.isFinite(Number(pvpOpponentState.y))
                ? Number(pvpOpponentState.y)
                : 0.8;

            if (!Number.isFinite(pvpSmoothOpponentX) ||
                !Number.isFinite(pvpSmoothOpponentY)) {
                pvpSmoothOpponentX = targetX;
                pvpSmoothOpponentY = targetY;
            } else {
                // 約90msの追従。200ms周期の通信でもワープ感を抑える。
                const alpha = 1 - Math.exp(-dt / 90);
                pvpSmoothOpponentX += (targetX - pvpSmoothOpponentX) * alpha;
                pvpSmoothOpponentY += (targetY - pvpSmoothOpponentY) * alpha;
            }

            const displayX = Math.max(5, Math.min(95, pvpSmoothOpponentX * 100));
            const displayY = Math.max(5, Math.min(45, (1 - pvpSmoothOpponentY) * 100));

            pvpRemoteAvatar.style.left = `${displayX}%`;
            pvpRemoteAvatar.style.top = `${displayY}%`;
        }

        requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
}

function resetPvpSmoothRender() {
    pvpSmoothOpponentX = null;
    pvpSmoothOpponentY = null;
    pvpSmoothLastFrameAt = performance.now();
}"""

if old1 not in text:
    print("[ERROR] 補間用コードを挿入する場所が見つかりません。")
    sys.exit(2)
text = text.replace(old1, new1, 1)

old2 = """    pvpLocalDead = false;
    pvpOpponentState = null;
    pvpProcessedHitIds.clear();"""

new2 = """    pvpLocalDead = false;
    pvpOpponentState = null;
    resetPvpSmoothRender();
    startPvpSmoothRender();
    pvpProcessedHitIds.clear();"""

if old2 not in text:
    print("[ERROR] beginPvpMatch() の挿入位置が見つかりません。")
    sys.exit(3)
text = text.replace(old2, new2, 1)

old3 = """            if (pvpRemoteAvatar) {
                const opponentX = Number.isFinite(Number(opponent.x)) ? Number(opponent.x) : 0.5;
                const opponentY = Number.isFinite(Number(opponent.y)) ? Number(opponent.y) : 0.8;
                pvpRemoteAvatar.style.left = `${Math.max(5, Math.min(95, opponentX * 100))}%`;
                pvpRemoteAvatar.style.top = `${Math.max(5, Math.min(45, (1 - opponentY) * 100))}%`;
                pvpRemoteAvatar.setAttribute("aria-label", `${opponent.displayName || "フレンド"} HP ${opponent.hp || 0}`);
            }"""

new3 = """            if (pvpRemoteAvatar) {
                // 位置はpvpOpponentStateへ保存し、表示位置はrequestAnimationFrame側で補間する。
                pvpRemoteAvatar.setAttribute("aria-label", `${opponent.displayName || "フレンド"} HP ${opponent.hp || 0}`);
            }"""

if old3 not in text:
    print("[ERROR] 相手位置の描画コードが見つかりません。")
    sys.exit(4)
text = text.replace(old3, new3, 1)

old4 = "if (!force && !changed && now - pvpLastStateSyncAt < 1000) return;"
new4 = """// 位置同期を1秒間隔から200ms間隔へ。
    // 描画側では補間するため、通信が多少揺れても表示は滑らかに追従する。
    if (!force && !changed && now - pvpLastStateSyncAt < 200) return;"""

if old4 not in text:
    print("[ERROR] PvP同期間隔のコードが見つかりません。")
    sys.exit(5)
text = text.replace(old4, new4, 1)

shutil.copy2(GAME_JS, BACKUP_JS)
GAME_JS.write_text(text, encoding="utf-8")

print("[OK] PvP滑らか表示パッチを適用しました。")
print(f"[OK] 更新: {GAME_JS}")
print(f"[OK] バックアップ: {BACKUP_JS}")
print()
print("変更内容:")
print("  - PvP位置同期: 最大1秒間隔 -> 200ms")
print("  - 相手キャラ: Firestore位置を直接表示 -> requestAnimationFrame補間")
print("  - 補間追従時間: 約90ms")
