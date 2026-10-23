from pathlib import Path
from datetime import datetime
import shutil
import sys


def replace_once(text, old, new, description):
    """想定した部分が1か所だけ存在するときに置換する。"""
    count = text.count(old)

    if count != 1:
        raise RuntimeError(
            f"修正を中止しました: {description}\n"
            f"想定した一致数: 1 / 実際: {count}\n"
            "ファイルが別バージョンかもしれません。"
        )

    return text.replace(old, new, 1)


def find_project_folder():
    candidates = [
        Path("顔面シューティング_GitHubPages版"),
        Path("."),
    ]

    for folder in candidates:
        if (
            (folder / "game.html").is_file()
            and (folder / "js" / "game.js").is_file()
            and (folder / "css" / "game.css").is_file()
        ):
            return folder

    raise FileNotFoundError(
        "ゲームのフォルダが見つかりません。\n"
        "このスクリプトをリポジトリのルートか、"
        "顔面シューティング_GitHubPages版の中で実行してください。"
    )


def main():
    base = find_project_folder()

    html_path = base / "game.html"
    js_path = base / "js" / "game.js"
    css_path = base / "css" / "game.css"

    # 先に全ファイルを読み込む。
    html = html_path.read_text(encoding="utf-8")
    js = js_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")

    # --------------------------------------------------
    # 1. ゲーム内カーソルの大きさ調整
    # --------------------------------------------------

    html = replace_once(
        html,
        '<canvas id="game"></canvas>',
        '<canvas id="game"></canvas>\n'
        '<div id="gameCursor" aria-hidden="true"></div>',
        "ゲーム内カーソルのHTML",
    )

    old_settings = '''        <div id="sensitivityPanel">
            <label for="cursorSensitivity">🎯 カーソル感度：<span id="cursorSensitivityValue">1.0</span></label>
            <input id="cursorSensitivity" type="range" min="0.5" max="3" step="0.1" value="1.0">
        </div>'''

    new_settings = '''        <div id="sensitivityPanel">
            <label for="cursorSensitivity">
                🎮 タッチ移動感度：
                <span id="cursorSensitivityValue">1.0</span>
            </label>
            <input
                id="cursorSensitivity"
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value="1.0"
            >

            <label for="cursorSize" style="margin-top:12px">
                🖱️ ゲーム内カーソルの大きさ：
                <span id="cursorSizeValue">32px</span>
            </label>
            <input
                id="cursorSize"
                type="range"
                min="12"
                max="80"
                step="2"
                value="32"
            >
            <p class="cursorHint">
                ゲーム画面に表示される照準の大きさを変更できます。
            </p>
        </div>'''

    html = replace_once(
        html,
        old_settings,
        new_settings,
        "カーソルサイズ設定の追加",
    )

    # --------------------------------------------------
    # 2. 顔画像変更をゲスト以外にも対応
    # --------------------------------------------------

    js = js.replace(
        "guestCustomFaceObjectURL",
        "customFaceObjectURL",
    )

    old_picker_start = '''function createGuestImagePicker() {
    if (!guestMode) return;

    const authPanel = document.getElementById("authPanel");
    if (!authPanel || document.getElementById("guestImageControls")) return;

    const panel = document.createElement("section");
    panel.id = "guestImageControls";'''

    new_picker_start = '''function createGuestImagePicker() {
    const authPanel = document.getElementById("authPanel");
    if (!authPanel || document.getElementById("faceImageControls")) return;

    const panel = document.createElement("section");
    panel.id = "faceImageControls";'''

    js = replace_once(
        js,
        old_picker_start,
        new_picker_start,
        "顔画像変更機能の共通化",
    )

    js = replace_once(
        js,
        'title.textContent = "🖼️ ゲストの顔画像";',
        'title.textContent = "🖼️ 顔画像の変更";',
        "顔画像変更のタイトル",
    )

    js = replace_once(
        js,
        'input.setAttribute("aria-label", "ゲスト用の顔画像を選択");',
        'input.setAttribute("aria-label", "ゲームで使う顔画像を選択");',
        "顔画像選択の説明",
    )

    # 顔画像用のコメントも共通ユーザー向けに変更。
    js = js.replace(
        "// ゲストが選んだ画像はこのページのメモリ内だけで使う。",
        "// 選択した画像はこのページのメモリ内だけで使う。",
    )

    # --------------------------------------------------
    # 3. ゲスト用の退出ボタン
    # --------------------------------------------------

    old_auth_ui = '''    const profileActions = document.querySelector("#authPanel .profileActions");
    const gameoverLeaderboardBtn = document.getElementById("gameoverLeaderboardBtn");'''

    new_auth_ui = '''    const profileActions = document.querySelector("#authPanel .profileActions");
    const profileLink = profileActions ? profileActions.querySelector("a") : null;
    const logoutButton = document.getElementById("logoutBtn");
    const gameoverLeaderboardBtn = document.getElementById("gameoverLeaderboardBtn");

    if (profileLink) {
        profileLink.textContent = guestMode ? "ログイン / 登録" : "アカウント設定";
        profileLink.href = "./login.html";
    }

    if (logoutButton) {
        logoutButton.textContent = guestMode ? "ゲスト終了" : "ログアウト";
    }'''

    js = replace_once(
        js,
        old_auth_ui,
        new_auth_ui,
        "ゲスト用ログインUI",
    )

    js = replace_once(
        js,
        'if (profileActions) profileActions.style.display = "none";',
        'if (profileActions) profileActions.style.display = "";',
        "ゲストの退出ボタンを表示",
    )

    # 登録ユーザーにも顔画像選択欄を追加。
    js = replace_once(
        js,
        '''        setFaceForMode(false);
        authErrorMessage = "";''',
        '''        setFaceForMode(false);
        createGuestImagePicker();
        authErrorMessage = "";''',
        "登録ユーザーの顔画像変更",
    )

    # ゲスト終了時はFirebaseアカウントをログアウトさせない。
    # 顔画像の一時URLを解放し、ログイン画面に戻す。
    old_logout = '''const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", async () => {
    if (!auth) return;
    logoutBtn.disabled = true;'''

    new_logout = '''const logoutBtn = document.getElementById("logoutBtn");
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
    logoutBtn.disabled = true;'''

    js = replace_once(
        js,
        old_logout,
        new_logout,
        "ゲスト終了ボタンの動作",
    )

    # --------------------------------------------------
    # 4. カーソルサイズの設定・表示
    # --------------------------------------------------

    old_cursor_settings = '''const cursorSensitivity = document.getElementById("cursorSensitivity");
const cursorSensitivityValue = document.getElementById("cursorSensitivityValue");
let cursorSensitivityLevel = 1.0;
if (cursorSensitivity) {
    cursorSensitivity.addEventListener("input", () => {
        cursorSensitivityLevel = Number(cursorSensitivity.value);
        if (cursorSensitivityValue) cursorSensitivityValue.textContent = cursorSensitivityLevel.toFixed(1);
    });
}'''

    new_cursor_settings = '''const cursorSensitivity = document.getElementById("cursorSensitivity");
const cursorSensitivityValue = document.getElementById("cursorSensitivityValue");
const cursorSize = document.getElementById("cursorSize");
const cursorSizeValue = document.getElementById("cursorSizeValue");
const gameCursor = document.getElementById("gameCursor");

let cursorSensitivityLevel = 1.0;
let cursorSizeLevel = Number(cursorSize?.value) || 32;

function applyCursorSize() {
    cursorSizeLevel = Math.max(12, Math.min(80, cursorSizeLevel));

    if (gameCursor) {
        gameCursor.style.width = `${cursorSizeLevel}px`;
        gameCursor.style.height = `${cursorSizeLevel}px`;
    }

    if (cursorSizeValue) {
        cursorSizeValue.textContent = `${Math.round(cursorSizeLevel)}px`;
    }
}

if (cursorSensitivity) {
    cursorSensitivity.addEventListener("input", () => {
        cursorSensitivityLevel = Number(cursorSensitivity.value);

        if (cursorSensitivityValue) {
            cursorSensitivityValue.textContent =
                cursorSensitivityLevel.toFixed(1);
        }
    });
}

if (cursorSize) {
    cursorSize.addEventListener("input", () => {
        cursorSizeLevel = Number(cursorSize.value);
        applyCursorSize();
    });
}

applyCursorSize();'''

    js = replace_once(
        js,
        old_cursor_settings,
        new_cursor_settings,
        "カーソルサイズ設定のJavaScript",
    )

    # 照準をマウスに追従させる。
    old_game_wrap = '''const gameWrap =
    document.getElementById("gameWrap");


const faceImage ='''

    new_game_wrap = '''const gameWrap =
    document.getElementById("gameWrap");

// ゲーム画面内の照準カーソル。
// ブラウザやWindows全体のマウスカーソルは変更しない。
function moveGameCursor(event) {
    if (!gameCursor || !gameWrap) return;

    // タッチやペンの入力では照準を表示しない。
    if (event.pointerType !== "mouse") {
        gameCursor.style.display = "none";
        return;
    }

    const rect = gameWrap.getBoundingClientRect();

    const x = event.clientX - rect.left - gameWrap.clientLeft;
    const y = event.clientY - rect.top - gameWrap.clientTop;

    if (
        x < 0 ||
        y < 0 ||
        x > gameWrap.clientWidth ||
        y > gameWrap.clientHeight
    ) {
        gameCursor.style.display = "none";
        return;
    }

    gameCursor.style.left = `${x}px`;
    gameCursor.style.top = `${y}px`;
    gameCursor.style.display = "block";
}

if (canvas && gameCursor) {
    canvas.addEventListener("pointermove", moveGameCursor);

    canvas.addEventListener("pointerleave", () => {
        gameCursor.style.display = "none";
    });
}

const faceImage ='''

    js = replace_once(
        js,
        old_game_wrap,
        new_game_wrap,
        "マウス追従カーソル",
    )

    # --------------------------------------------------
    # 5. カーソルの見た目
    # --------------------------------------------------

    cursor_css = '''

/* ===== Adjustable in-game aiming cursor ===== */
#game {
    cursor: none;
}

#gameCursor {
    position: absolute;
    z-index: 5;
    display: none;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    border: 2px solid #ffe600;
    border-radius: 50%;
    background: rgba(255, 230, 0, .06);
    box-shadow:
        0 0 0 2px rgba(0, 0, 0, .8),
        0 0 12px rgba(255, 230, 0, .65);
    pointer-events: none;
}

#gameCursor::before,
#gameCursor::after {
    content: "";
    position: absolute;
    background: #ffe600;
    box-shadow: 0 0 3px #000;
}

#gameCursor::before {
    left: 50%;
    top: -25%;
    width: 2px;
    height: 150%;
    transform: translateX(-50%);
}

#gameCursor::after {
    top: 50%;
    left: -25%;
    height: 2px;
    width: 150%;
    transform: translateY(-50%);
}

#sensitivityPanel {
    text-align: left;
    margin: 12px auto;
    width: min(100%, 520px);
}

#sensitivityPanel input[type="range"] {
    width: 100%;
    accent-color: #ffe600;
    cursor: pointer;
}

#sensitivityPanel .cursorHint {
    margin: 5px 0 0;
    color: #cbd5ff;
    font-size: 11px;
    line-height: 1.5;
}
'''

    if "#gameCursor {" not in css:
        css += cursor_css

    # すべての置換が成功してから、バックアップを作って保存する。
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    files = [
        (html_path, html),
        (js_path, js),
        (css_path, css),
    ]

    for path, _content in files:
        backup = path.with_name(
            path.name + f".before_update_{timestamp}.bak"
        )
        shutil.copy2(path, backup)
        print(f"バックアップ: {backup}")

    for path, content in files:
        path.write_text(content, encoding="utf-8")
        print(f"修正完了: {path}")

    print()
    print("すべての修正が完了しました。")
    print("次にブラウザで動作を確認し、問題なければGitHubへ反映してください。")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print()
        print(f"エラー: {error}")
        print("ファイルの修正を中止しました。")
        sys.exit(1)
