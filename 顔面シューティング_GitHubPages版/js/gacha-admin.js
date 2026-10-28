import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";


// ==================================================
// 初期設定
// ==================================================

const RARITIES = [
    "N",
    "R",
    "SR",
    "SSR",
    "UR"
];

const DEFAULT_FACES = [
    {
        id: "face2",
        name: "初期顔",
        description: "",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png",
        rarity: "N",
        probability: 93
    },
    {
        id: "face_1",
        name: "顔1",
        description: "",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_1.jpg",
        rarity: "UR",
        probability: 1
    },
    {
        id: "face_2",
        name: "顔2",
        description: "",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_2.jpg",
        rarity: "UR",
        probability: 1
    },
    {
        id: "face_3",
        name: "顔3",
        description: "",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_3.jpg",
        rarity: "UR",
        probability: 1
    },
    {
        id: "face_4",
        name: "顔4",
        description: "",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_4.jpg",
        rarity: "SSR",
        probability: 4
    }
];

const DEFAULT_GACHA_SETTINGS = {
    guaranteeRarity: "SSR",
    boostMultiplier: 2,
    duplicateCoinReward: 1,
    mudDangoCoinsRequired: 30,
    mudDangoRewardFaceId: "",
    mudDangoRewardFaceIds: []
};


// ==================================================
// 状態
// ==================================================

let currentUser = null;
let isAdmin = false;
let faces = [];
let gachaSettings = { ...DEFAULT_GACHA_SETTINGS };


// ==================================================
// 管理画面取得
// ==================================================

function getAdminPanel() {

    return document.getElementById(
        "adminPanel"
    );

}


// ==================================================
// ガチャ管理パネル作成
// ==================================================

function createPanel() {

    const adminPanel =
        getAdminPanel();

    if (
        !adminPanel
    ) {

        console.warn(
            "[GACHA ADMIN] adminPanel が見つかりません。"
        );

        return;

    }


    // 二重生成防止

    if (
        document.getElementById(
            "gachaFacesPanel"
        )
    ) {

        return;

    }


    const panel =
        document.createElement(
            "section"
        );


    panel.className =
        "panel";


    panel.id =
        "gachaFacesPanel";


    panel.innerHTML = `

        <div class="panel-heading">

            <div>

                <p class="eyebrow">
                    FACE GACHA
                </p>

                <h2>
                    🎭 ガチャ顔管理
                </h2>

            </div>

            <button
                id="gachaAddFaceBtn"
                class="secondary"
                type="button"
            >
                ＋ 顔を追加
            </button>

        </div>


        <p class="muted">
            顔ごとに名前・画像URL・レア度・排出確率を設定できます。
            排出確率は基本値です。チェックした顔は設定倍率で抽選重みが上がります。
        </p>


        <div
            id="gachaFacesList"
            class="gacha-faces-list"
        ></div>


        <div
            class="gacha-probability-summary"
            style="
                margin-top:16px;
                padding:14px;
                border-radius:12px;
                background:rgba(255,255,255,.04);
                border:1px solid rgba(255,255,255,.08);
            "
        >

            <strong>
                確率合計：
            </strong>

            <span id="gachaProbabilityTotal">
                0%
            </span>

            <span
                id="gachaProbabilityStatus"
                style="margin-left:10px;"
            ></span>

        </div>

        <div class="gacha-bonus-settings" style="margin-top:18px;padding:16px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.035);display:grid;gap:12px;">
            <h3 style="margin:0;">保証・泥団子コイン設定</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
                <label>10回ごとに保証するレア度
                    <select id="gachaGuaranteeRarity"></select>
                    <small class="muted">10連と単発10回の両方で、指定レア以上を1つ保証します。</small>
                </label>
                <label>チェック顔の排出重み倍率
                    <input id="gachaBoostMultiplier" type="number" min="1" max="100" step="0.1">
                </label>
                <label>重複1回でもらえる泥団子コイン
                    <input id="duplicateCoinReward" type="number" min="0" max="100000" step="1">
                </label>
                <label>超レア顔の交換に必要なコイン
                    <input id="mudDangoCoinsRequired" type="number" min="1" max="1000000" step="1">
                </label>
                <label>交換でもらえる超レア顔（UR）
                    <select id="mudDangoRewardFaceId" multiple size="5" aria-describedby="mudDangoRewardHelp"></select>
                    <small id="mudDangoRewardHelp" class="muted">複数選択できます（WindowsはCtrlを押しながら選択）。選択した顔は通常ガチャに出ず、交換時にこの中からランダムで選ばれます。</small>
                </label>
            </div>
        </div>


        <div
            class="form-actions"
            style="margin-top:18px;"
        >

            <button
                id="gachaSaveFacesBtn"
                class="primary"
                type="button"
            >
                設定を保存
            </button>

            <button
                id="gachaResetFacesBtn"
                class="secondary"
                type="button"
            >
                初期設定に戻す
            </button>

        </div>

    `;


    adminPanel.appendChild(
        panel
    );


    document
        .getElementById(
            "gachaAddFaceBtn"
        )
        ?.addEventListener(
            "click",
            addFace
        );


    document
        .getElementById(
            "gachaSaveFacesBtn"
        )
        ?.addEventListener(
            "click",
            saveFaces
        );


    document
        .getElementById(
            "gachaResetFacesBtn"
        )
        ?.addEventListener(
            "click",
            resetFaces
        );


    renderFaces();

}


// ==================================================
// Firestore読み込み
// ==================================================

async function loadFaces() {

    try {

        const ref =
            doc(
                db,
                "adminSettings",
                "gameplay"
            );


        const snapshot =
            await getDoc(
                ref
            );


        if (
            snapshot.exists()
        ) {

            const data =
                snapshot.data();

            gachaSettings = {
                guaranteeRarity: RARITIES.includes(data.gachaGuaranteeRarity)
                    ? data.gachaGuaranteeRarity
                    : DEFAULT_GACHA_SETTINGS.guaranteeRarity,
                boostMultiplier: Math.max(1, Number(data.gachaBoostMultiplier) || DEFAULT_GACHA_SETTINGS.boostMultiplier),
                duplicateCoinReward: data.duplicateCoinReward == null
                    ? DEFAULT_GACHA_SETTINGS.duplicateCoinReward
                    : Math.max(0, Math.floor(Number(data.duplicateCoinReward) || 0)),
                mudDangoCoinsRequired: Math.max(1, Math.floor(Number(data.mudDangoCoinsRequired) || DEFAULT_GACHA_SETTINGS.mudDangoCoinsRequired)),
                mudDangoRewardFaceId: String(data.mudDangoRewardFaceId || ""),
                mudDangoRewardFaceIds: Array.isArray(data.mudDangoRewardFaceIds)
                    ? data.mudDangoRewardFaceIds.map(String)
                    : [String(data.mudDangoRewardFaceId || "")].filter(Boolean)
            };


            if (
                Array.isArray(
                    data.gachaFaces
                )
            ) {

                faces =
                    data.gachaFaces
                        .map(
                            normalizeFace
                        );

            }

        }


        // 未設定なら初期値

        if (
            faces.length === 0
        ) {

            faces =
                DEFAULT_FACES.map(
                    face => ({
                        ...face
                    })
                );

        }


        renderFaces();
        renderGachaSettings();


    } catch (error) {

        console.error(
            "[GACHA ADMIN] 読み込み失敗:",
            error
        );

        showToast(
            "ガチャ顔設定の読み込みに失敗しました。"
        );

    }

}


// ==================================================
// 顔データ正規化
// ==================================================

function normalizeFace(
    face
) {

    return {

        id:
            String(
                face?.id ||
                `face_${Date.now()}`
            ),

        name:
            String(
                face?.name ||
                "無名の顔"
            ),

        imageUrl:
            String(
                face?.imageUrl ||
                ""
            ),

        description:
            String(
                face?.description ||
                face?.additionalInfo ||
                ""
            ),

        rarity:
            RARITIES.includes(
                face?.rarity
            )
                ? face.rarity
                : "N",

        probability:
            Math.max(
                0,
                Number(
                    face?.probability
                ) || 0
            ),

        boosted:
            Boolean(face?.boosted)

    };

}


function renderGachaSettings() {
    const raritySelect = document.getElementById("gachaGuaranteeRarity");
    const boostInput = document.getElementById("gachaBoostMultiplier");
    const duplicateInput = document.getElementById("duplicateCoinReward");
    const coinThresholdInput = document.getElementById("mudDangoCoinsRequired");
    const rewardFaceSelect = document.getElementById("mudDangoRewardFaceId");

    if (!raritySelect || !boostInput || !duplicateInput || !coinThresholdInput || !rewardFaceSelect) return;

    raritySelect.innerHTML = RARITIES.map(rarity =>
        `<option value="${rarity}">${rarity}以上</option>`
    ).join("");
    raritySelect.value = gachaSettings.guaranteeRarity;
    boostInput.value = gachaSettings.boostMultiplier;
    duplicateInput.value = gachaSettings.duplicateCoinReward;
    coinThresholdInput.value = gachaSettings.mudDangoCoinsRequired;

    updateRewardFaceOptions();
    rewardFaceSelect.addEventListener("change", () => {
        gachaSettings.mudDangoRewardFaceIds = [...rewardFaceSelect.selectedOptions].map(option => option.value);
        gachaSettings.mudDangoRewardFaceId = gachaSettings.mudDangoRewardFaceIds[0] || "";
    });
}


function updateRewardFaceOptions() {
    const select = document.getElementById("mudDangoRewardFaceId");
    if (!select) return;

    const selected = new Set(gachaSettings.mudDangoRewardFaceIds?.length
        ? gachaSettings.mudDangoRewardFaceIds
        : [select.value || gachaSettings.mudDangoRewardFaceId].filter(Boolean));
    const ultraRareFaces = faces.filter(face => face.rarity === "UR");
    const rewardOptions = ultraRareFaces.length > 0 ? ultraRareFaces : faces;
    select.innerHTML = rewardOptions.map(face =>
        `<option value="${escapeHtml(face.id)}">${escapeHtml(face.name)}（${escapeHtml(face.rarity)}）</option>`
    ).join("");

    for (const option of select.options) option.selected = selected.has(option.value);
    if (![...select.selectedOptions].length) {
        const first = rewardOptions.find(face => face.rarity === "UR") || rewardOptions[0];
        if (first) select.value = first.id;
    }
    gachaSettings.mudDangoRewardFaceIds = [...select.selectedOptions].map(option => option.value);
    gachaSettings.mudDangoRewardFaceId = gachaSettings.mudDangoRewardFaceIds[0] || "";
}


// ==================================================
// 顔一覧表示
// ==================================================

function renderFaces() {

    const list =
        document.getElementById(
            "gachaFacesList"
        );


    if (
        !list
    ) {

        return;

    }


    if (
        faces.length === 0
    ) {

        list.innerHTML = `

            <p class="muted">
                ガチャに登録されている顔がありません。
            </p>

        `;

        updateProbabilitySummary();

        return;

    }


    list.innerHTML =
        faces
            .map(
                (face, index) =>
                    createFaceCard(
                        face,
                        index
                    )
            )
            .join("");


    // イベント登録

    list
        .querySelectorAll(
            "[data-face-index]"
        )
        .forEach(
            card => {

                const index =
                    Number(
                        card.dataset.faceIndex
                    );


                const face =
                    faces[index];


                const nameInput =
                    card.querySelector(
                        ".gacha-face-name"
                    );


                const urlInput =
                    card.querySelector(
                        ".gacha-face-url"
                    );

                const descriptionInput =
                    card.querySelector(
                        ".gacha-face-description"
                    );


                const rarityInput =
                    card.querySelector(
                        ".gacha-face-rarity"
                    );


                const probabilityInput =
                    card.querySelector(
                        ".gacha-face-probability"
                    );

                const boostedInput =
                    card.querySelector(
                        ".gacha-face-boosted"
                    );


                nameInput?.addEventListener(
                    "input",
                    event => {

                        face.name =
                            event.target.value;

                    }
                );


                urlInput?.addEventListener(
                    "input",
                    event => {

                        face.imageUrl =
                            event.target.value;

                        updatePreview(
                            card,
                            face.imageUrl
                        );

                    }
                );

                descriptionInput?.addEventListener(
                    "input",
                    event => {
                        face.description = event.target.value;
                    }
                );


                rarityInput?.addEventListener(
                    "change",
                    event => {

                        face.rarity =
                            event.target.value;
                        updateRewardFaceOptions();

                    }
                );


                probabilityInput?.addEventListener(
                    "input",
                    event => {

                        face.probability =
                            Math.max(
                                0,
                                Number(
                                    event.target.value
                                ) || 0
                            );

                        updateProbabilitySummary();

                    }
                );

                boostedInput?.addEventListener(
                    "change",
                    event => {
                        face.boosted = event.target.checked;
                    }
                );


                card
                    .querySelector(
                        ".gacha-delete-face"
                    )
                    ?.addEventListener(
                        "click",
                        () => {

                            deleteFace(
                                index
                            );

                        }
                    );

            }
        );


    updateProbabilitySummary();
    updateRewardFaceOptions();

}


// ==================================================
// 顔カード
// ==================================================

function createFaceCard(
    face,
    index
) {

    const rarityOptions =
        RARITIES
            .map(
                rarity => `

                    <option
                        value="${rarity}"
                        ${
                            face.rarity === rarity
                                ? "selected"
                                : ""
                        }
                    >
                        ${rarity}
                    </option>

                `
            )
            .join("");


    return `

        <div
            class="gacha-face-card"
            data-face-index="${index}"
            style="
                display:grid;
                grid-template-columns:140px 1fr auto;
                gap:18px;
                align-items:start;
                padding:18px;
                margin-top:14px;
                border-radius:14px;
                background:rgba(255,255,255,.035);
                border:1px solid rgba(255,255,255,.08);
            "
        >


            <!-- プレビュー -->

            <div>

                <div
                    class="gacha-face-preview"
                    style="
                        width:140px;
                        height:140px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        border-radius:12px;
                        overflow:hidden;
                        background:#111;
                        border:1px solid rgba(255,255,255,.1);
                    "
                >

                    ${
                        face.imageUrl
                            ? `
                                <img
                                    src="${escapeHtml(
                                        face.imageUrl
                                    )}"
                                    alt=""
                                    style="
                                        width:100%;
                                        height:100%;
                                        object-fit:contain;
                                    "
                                    onerror="
                                        this.style.display='none';
                                        this.nextElementSibling.style.display='block';
                                    "
                                >

                                <span
                                    style="
                                        display:none;
                                        color:#888;
                                        text-align:center;
                                        padding:10px;
                                    "
                                >
                                    画像を読み込めません
                                </span>
                            `
                            : `
                                <span
                                    style="
                                        color:#888;
                                        text-align:center;
                                    "
                                >
                                    画像なし
                                </span>
                            `
                    }

                </div>


                <small
                    class="muted"
                    style="
                        display:block;
                        margin-top:8px;
                        word-break:break-all;
                    "
                >
                    ID: ${escapeHtml(face.id)}
                </small>

            </div>


            <!-- 設定 -->

            <div
                style="
                    display:grid;
                    gap:12px;
                "
            >

                <label>

                    顔の名前

                    <input
                        class="gacha-face-name"
                        type="text"
                        value="${escapeHtml(
                            face.name
                        )}"
                        placeholder="例：めっちゃ強そうな顔"
                    >

                </label>


                <label>

                    画像URL

                    <input
                        class="gacha-face-url"
                        type="url"
                        value="${escapeHtml(
                            face.imageUrl
                        )}"
                        placeholder="https://..."
                    >

                </label>


                <label>

                    追加情報（ガチャ画面に表示）

                    <textarea
                        class="gacha-face-description"
                        rows="3"
                        maxlength="300"
                        placeholder="顔の説明や特徴など"
                    >${escapeHtml(face.description || "")}</textarea>

                </label>


                <div
                    style="
                        display:grid;
                        grid-template-columns:
                            minmax(100px,1fr)
                            minmax(100px,1fr);
                        gap:12px;
                    "
                >

                    <label>

                        レア度

                        <select
                            class="gacha-face-rarity"
                        >
                            ${rarityOptions}
                        </select>

                    </label>


                    <label>

                        排出確率（%）

                        <input
                            class="gacha-face-probability"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value="${face.probability}"
                        >

                    </label>

                </div>

                <label style="display:flex;align-items:center;gap:8px;">
                    <input
                        class="gacha-face-boosted"
                        type="checkbox"
                        ${face.boosted ? "checked" : ""}
                    >
                    この顔を出やすくする
                </label>

            </div>


            <!-- 削除 -->

            <button
                class="secondary gacha-delete-face"
                type="button"
                title="この顔を削除"
            >
                🗑
            </button>

        </div>

    `;

}


// ==================================================
// 顔追加
// ==================================================

function addFace() {

    const id =
        `face_${Date.now()}`;


    faces.push({

        id,

        name:
            "新しい顔",

        imageUrl:
            "",

        description:
            "",

        rarity:
            "N",

        probability:
            0,

        boosted:
            false

    });


    renderFaces();


    // 追加したカードへスクロール

    requestAnimationFrame(
        () => {

            const cards =
                document.querySelectorAll(
                    ".gacha-face-card"
                );


            const last =
                cards[
                    cards.length - 1
                ];


            last?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });


            last
                ?.querySelector(
                    ".gacha-face-name"
                )
                ?.focus();

        }
    );

}


// ==================================================
// 顔削除
// ==================================================

function deleteFace(
    index
) {

    const face =
        faces[index];


    if (
        !face
    ) {

        return;

    }


    const confirmed =
        window.confirm(
            `「${face.name}」を削除しますか？\n\n保存するとガチャからも削除されます。`
        );


    if (
        !confirmed
    ) {

        return;

    }


    faces.splice(
        index,
        1
    );


    renderFaces();

}


// ==================================================
// プレビュー更新
// ==================================================

function updatePreview(
    card,
    url
) {

    const preview =
        card.querySelector(
            ".gacha-face-preview"
        );


    if (
        !preview
    ) {

        return;

    }


    if (
        !url
    ) {

        preview.innerHTML = `

            <span
                style="
                    color:#888;
                    text-align:center;
                "
            >
                画像なし
            </span>

        `;

        return;

    }


    preview.innerHTML = `

        <img
            src="${escapeHtml(url)}"
            alt=""
            style="
                width:100%;
                height:100%;
                object-fit:contain;
            "
            onerror="
                this.style.display='none';
                this.nextElementSibling.style.display='block';
            "
        >

        <span
            style="
                display:none;
                color:#888;
                text-align:center;
                padding:10px;
            "
        >
            画像を読み込めません
        </span>

    `;

}


// ==================================================
// 確率合計表示
// ==================================================

function updateProbabilitySummary() {

    const total =
        faces.reduce(
            (
                sum,
                face
            ) =>
                sum +
                (
                    Number(
                        face.probability
                    ) || 0
                ),
            0
        );


    const totalElement =
        document.getElementById(
            "gachaProbabilityTotal"
        );


    const statusElement =
        document.getElementById(
            "gachaProbabilityStatus"
        );


    if (
        totalElement
    ) {

        totalElement.textContent =
            `${total.toFixed(2)}%`;

    }


    if (
        statusElement
    ) {

        if (
            Math.abs(
                total - 100
            ) < 0.001
        ) {

            statusElement.textContent =
                "✓ OK";

            statusElement.style.color =
                "#6ee7b7";

        } else {

            statusElement.textContent =
                `（あと ${(100 - total).toFixed(2)}%）`;

            statusElement.style.color =
                "#fbbf24";

        }

    }

}


// ==================================================
// 保存
// ==================================================

async function saveFaces() {

    if (
        !currentUser ||
        !isAdmin
    ) {

        showToast(
            "管理者権限がありません。"
        );

        return;

    }


    // ----------------------------------------------
    // 入力値を取得
    // ----------------------------------------------

    const cards =
        document.querySelectorAll(
            ".gacha-face-card"
        );


    cards.forEach(
        card => {

            const index =
                Number(
                    card.dataset.faceIndex
                );


            const face =
                faces[index];


            if (
                !face
            ) {

                return;

            }


            face.name =
                card
                    .querySelector(
                        ".gacha-face-name"
                    )
                    ?.value
                    ?.trim() ||
                "無名の顔";


            face.imageUrl =
                card
                    .querySelector(
                        ".gacha-face-url"
                    )
                    ?.value
                    ?.trim() ||
                "";

            face.description =
                card
                    .querySelector(
                        ".gacha-face-description"
                    )
                    ?.value
                    ?.trim() ||
                "";


            face.rarity =
                card
                    .querySelector(
                        ".gacha-face-rarity"
                    )
                    ?.value ||
                "N";


            face.probability =
                Math.max(
                    0,
                    Number(
                        card
                            .querySelector(
                                ".gacha-face-probability"
                            )
                            ?.value
                    ) || 0
                );

            face.boosted = Boolean(
                card.querySelector(".gacha-face-boosted")?.checked
            );

        }
    );


    // ----------------------------------------------
    // バリデーション
    // ----------------------------------------------

    if (
        faces.length === 0
    ) {

        showToast(
            "顔を1つ以上登録してください。"
        );

        return;

    }


    const invalidUrl =
        faces.find(
            face =>
                !face.imageUrl
        );


    if (
        invalidUrl
    ) {

        showToast(
            `「${invalidUrl.name}」の画像URLを入力してください。`
        );

        return;

    }


    const duplicate =
        faces.find(
            (
                face,
                index
            ) =>
                faces.findIndex(
                    other =>
                        other.id ===
                        face.id
                ) !== index
        );


    if (
        duplicate
    ) {

        showToast(
            `ID「${duplicate.id}」が重複しています。`
        );

        return;

    }


    const total =
        faces.reduce(
            (
                sum,
                face
            ) =>
                sum +
                face.probability,
            0
        );


    if (
        Math.abs(
            total - 100
        ) > 0.001
    ) {

        showToast(
            `排出確率の合計を100%にしてください。（現在 ${total.toFixed(2)}%）`
        );

        return;

    }

    gachaSettings.guaranteeRarity =
        document.getElementById("gachaGuaranteeRarity")?.value || "SSR";
    gachaSettings.boostMultiplier = Math.max(
        1,
        Math.min(100, Number(document.getElementById("gachaBoostMultiplier")?.value) || 2)
    );
    gachaSettings.duplicateCoinReward = Math.max(
        0,
        Math.floor(Number(document.getElementById("duplicateCoinReward")?.value) || 0)
    );
    gachaSettings.mudDangoCoinsRequired = Math.max(
        1,
        Math.floor(Number(document.getElementById("mudDangoCoinsRequired")?.value) || 30)
    );
    const rewardSelect = document.getElementById("mudDangoRewardFaceId");
    gachaSettings.mudDangoRewardFaceIds = [...(rewardSelect?.selectedOptions || [])].map(option => option.value);
    gachaSettings.mudDangoRewardFaceId = gachaSettings.mudDangoRewardFaceIds[0] || "";

    const guaranteeRank = RARITIES.indexOf(gachaSettings.guaranteeRarity);
    if (!faces.some(face => RARITIES.indexOf(face.rarity) >= guaranteeRank && !gachaSettings.mudDangoRewardFaceIds.includes(face.id))) {
        showToast(`保証レア度 ${gachaSettings.guaranteeRarity} 以上の顔を1つ以上設定してください。`);
        return;
    }

    const rewardFaces = faces.filter(face => gachaSettings.mudDangoRewardFaceIds.includes(face.id));
    if (!rewardFaces.length || rewardFaces.some(face => face.rarity !== "UR")) {
        showToast("泥団子交換用にレア度URの顔を1つ以上選んでください。");
        return;
    }


    // ----------------------------------------------
    // 保存
    // ----------------------------------------------

    const saveButton =
        document.getElementById(
            "gachaSaveFacesBtn"
        );


    if (
        saveButton
    ) {

        saveButton.disabled =
            true;

        saveButton.textContent =
            "保存中…";

    }


    try {

        const gameplayRef =
            doc(
                db,
                "adminSettings",
                "gameplay"
            );


        const currentSnapshot =
            await getDoc(
                gameplayRef
            );


        const currentData =
            currentSnapshot.exists()
                ? currentSnapshot.data()
                : {};


        await setDoc(
            gameplayRef,
            {

                ...currentData,

                gachaGuaranteeRarity: gachaSettings.guaranteeRarity,
                gachaBoostMultiplier: gachaSettings.boostMultiplier,
                duplicateCoinReward: gachaSettings.duplicateCoinReward,
                mudDangoCoinsRequired: gachaSettings.mudDangoCoinsRequired,
                mudDangoRewardFaceId: gachaSettings.mudDangoRewardFaceId,
                mudDangoRewardFaceIds: gachaSettings.mudDangoRewardFaceIds,

                gachaFaces:
                    faces.map(
                        face => ({
                            id:
                                face.id,

                            name:
                                face.name,

                            imageUrl:
                                face.imageUrl,

                            description:
                                face.description || "",

                            rarity:
                                face.rarity,

                            probability:
                                face.probability,

                            boosted:
                                Boolean(face.boosted)
                        })
                    ),

                updatedBy:
                    currentUser.uid,

                updatedAt:
                    serverTimestamp()

            }
        );


        showToast(
            "ガチャ顔設定を保存しました。"
        );


        renderFaces();


    } catch (error) {

        console.error(
            "[GACHA ADMIN] 保存失敗:",
            error
        );


        showToast(
            `保存に失敗しました: ${
                error.message || error
            }`
        );

    } finally {

        if (
            saveButton
        ) {

            saveButton.disabled =
                false;

            saveButton.textContent =
                "設定を保存";

        }

    }

}


// ==================================================
// 初期設定へ戻す
// ==================================================

async function resetFaces() {

    const confirmed =
        window.confirm(
            "ガチャ顔設定を初期設定に戻しますか？\n\n現在の追加・削除・確率変更は失われます。"
        );


    if (
        !confirmed
    ) {

        return;

    }


    faces =
        DEFAULT_FACES.map(
            face => ({
                ...face
            })
        );


    renderFaces();


    await saveFaces();

}


// ==================================================
// Toast
// ==================================================

function showToast(
    message
) {

    const toast =
        document.getElementById(
            "toast"
        );


    if (
        toast
    ) {

        toast.textContent =
            message;

        toast.classList.add(
            "show"
        );


        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3500
        );

    } else {

        window.alert(
            message
        );

    }

}


// ==================================================
// HTMLエスケープ
// ==================================================

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


// ==================================================
// 管理者確認
// ==================================================

async function checkAdmin(
    user
) {

    if (
        !user
    ) {

        currentUser = null;
        isAdmin = false;

        return false;

    }


    currentUser =
        user;


    try {

        const adminRef =
            doc(
                db,
                "admins",
                user.uid
            );


        const snapshot =
            await getDoc(
                adminRef
            );


        if (
            !snapshot.exists()
        ) {

            isAdmin = false;

            return false;

        }


        const data =
            snapshot.data();


        const role =
            String(
                data.role || ""
            ).toLowerCase();


        isAdmin =
            role === "admin" ||
            role === "owner";


        return isAdmin;


    } catch (error) {

        console.error(
            "[GACHA ADMIN] 権限確認失敗:",
            error
        );


        isAdmin = false;

        return false;

    }

}


// ==================================================
// 管理画面表示待ち
// ==================================================

function waitForAdminPanel() {

    return new Promise(
        resolve => {

            const existing =
                getAdminPanel();


            if (
                existing &&
                !existing.hidden
            ) {

                resolve(
                    existing
                );

                return;

            }


            const observer =
                new MutationObserver(
                    () => {

                        const panel =
                            getAdminPanel();


                        if (
                            panel &&
                            !panel.hidden
                        ) {

                            observer.disconnect();

                            resolve(
                                panel
                            );

                        }

                    }
                );


            observer.observe(
                document.body,
                {
                    childList: true,
                    subtree: true,
                    attributes: true
                }
            );


            setTimeout(
                () => {

                    observer.disconnect();

                    resolve(
                        getAdminPanel()
                    );

                },
                10000
            );

        }
    );

}


// ==================================================
// Firebase Auth
// ==================================================

onAuthStateChanged(
    auth,
    async user => {

        if (
            !user
        ) {

            currentUser = null;
            isAdmin = false;

            return;

        }


        const allowed =
            await checkAdmin(
                user
            );


        if (
            !allowed
        ) {

            return;

        }


        await waitForAdminPanel();


        createPanel();


        await loadFaces();

    }
);
