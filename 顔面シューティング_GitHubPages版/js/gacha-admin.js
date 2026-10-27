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


const DEFAULT_FACES = [
    {
        id: "face2",
        name: "初期顔",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png",
        rarity: "N",
        probability: 60
    },
    {
        id: "face_1",
        name: "顔1",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_1.jpg",
        rarity: "UR",
        probability: 1
    },
    {
        id: "face_2",
        name: "顔2",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_2.jpg",
        rarity: "UR",
        probability: 1
    },
    {
        id: "face_3",
        name: "顔3",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_3.jpg",
        rarity: "UR",
        probability: 1
    },
    {
        id: "face_4",
        name: "顔4",
        imageUrl:
            "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_4.jpg",
        rarity: "SSR",
        probability: 4
    }
];


const RARITIES = [
    "N",
    "R",
    "SR",
    "SSR",
    "UR"
];


let currentUser = null;
let faces = [];


// ==================================================
// 管理画面にパネル追加
// ==================================================

function createPanel() {

    if (
        document.getElementById(
            "gachaFaceManager"
        )
    ) {
        return;
    }


    const adminPanel =
        document.getElementById(
            "adminPanel"
        );


    if (!adminPanel) {
        return;
    }


    const panel =
        document.createElement(
            "section"
        );


    panel.id =
        "gachaFaceManager";

    panel.className =
        "panel";


    panel.innerHTML = `

        <div class="panel-heading">

            <div>

                <p class="eyebrow">
                    GACHA FACES
                </p>

                <h2>
                    🎭 ガチャ顔管理
                </h2>

            </div>

            <button
                id="addGachaFaceBtn"
                class="primary"
                type="button"
            >
                ＋ 顔を追加
            </button>

        </div>


        <p class="muted">
            画像ごとにレア度と排出確率を設定できます。
            確率は画像ごとの設定がそのまま抽選に使用されます。
        </p>


        <div
            id="gachaFaceList"
            style="
                display:flex;
                flex-direction:column;
                gap:12px;
            "
        ></div>


        <div
            id="gachaProbabilityTotal"
            class="muted"
            style="
                margin-top:16px;
                padding:12px;
            "
        >
            合計確率: 0%
        </div>


        <div class="form-actions">

            <button
                id="saveGachaFacesBtn"
                class="primary"
                type="button"
            >
                💾 ガチャ設定を保存
            </button>

            <button
                id="resetGachaFacesBtn"
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
            "addGachaFaceBtn"
        )
        .addEventListener(
            "click",
            addFace
        );


    document
        .getElementById(
            "saveGachaFacesBtn"
        )
        .addEventListener(
            "click",
            saveFaces
        );


    document
        .getElementById(
            "resetGachaFacesBtn"
        )
        .addEventListener(
            "click",
            resetFaces
        );


    loadFaces();

}


// ==================================================
// Firestoreから読み込み
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
            await getDoc(ref);


        if (
            snapshot.exists() &&
            Array.isArray(
                snapshot.data().gachaFaces
            )
        ) {

            faces =
                snapshot.data().gachaFaces.map(
                    face => ({
                        id:
                            String(
                                face.id || ""
                            ),

                        name:
                            String(
                                face.name || "無名"
                            ),

                        imageUrl:
                            String(
                                face.imageUrl || ""
                            ),

                        rarity:
                            RARITIES.includes(
                                face.rarity
                            )
                                ? face.rarity
                                : "N",

                        probability:
                            Number(
                                face.probability
                            ) || 0
                    })
                );

        } else {

            faces =
                structuredClone(
                    DEFAULT_FACES
                );

        }


        renderFaces();


    } catch (error) {

        console.error(
            "ガチャ顔設定の読み込み失敗:",
            error
        );


        faces =
            structuredClone(
                DEFAULT_FACES
            );


        renderFaces();

    }

}


// ==================================================
// 顔一覧表示
// ==================================================

function renderFaces() {

    const list =
        document.getElementById(
            "gachaFaceList"
        );


    if (!list) {
        return;
    }


    list.innerHTML = "";


    if (faces.length === 0) {

        list.innerHTML = `
            <p class="muted">
                登録されている顔がありません。
            </p>
        `;

        updateTotal();

        return;
    }


    faces.forEach(
        (face, index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.style.cssText = `
                display:grid;
                grid-template-columns:
                    90px
                    minmax(150px,1fr)
                    100px
                    120px
                    80px;
                gap:12px;
                align-items:center;
                padding:12px;
                border:1px solid rgba(255,255,255,.1);
                border-radius:12px;
                background:rgba(255,255,255,.03);
            `;


            card.innerHTML = `

                <div
                    style="
                        width:80px;
                        height:80px;
                        border-radius:10px;
                        overflow:hidden;
                        background:#111;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                    "
                >

                    <img
                        src="${escapeHtml(face.imageUrl)}"
                        alt=""
                        style="
                            width:100%;
                            height:100%;
                            object-fit:cover;
                        "
                        onerror="
                            this.style.display='none';
                        "
                    >

                </div>


                <div>

                    <input
                        class="gacha-face-name"
                        data-index="${index}"
                        value="${escapeHtml(face.name)}"
                        placeholder="画像名"
                        style="width:100%;"
                    >


                    <input
                        class="gacha-face-url"
                        data-index="${index}"
                        value="${escapeHtml(face.imageUrl)}"
                        placeholder="画像URL"
                        style="
                            width:100%;
                            margin-top:6px;
                        "
                    >

                </div>


                <div>

                    <label>
                        レア度

                        <select
                            class="gacha-face-rarity"
                            data-index="${index}"
                            style="width:100%;"
                        >

                            ${RARITIES.map(
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
                            ).join("")}

                        </select>

                    </label>

                </div>


                <div>

                    <label>
                        排出確率 %

                        <input
                            class="gacha-face-probability"
                            data-index="${index}"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value="${face.probability}"
                            style="width:100%;"
                        >

                    </label>

                </div>


                <button
                    class="secondary delete-gacha-face"
                    data-index="${index}"
                    type="button"
                >
                    🗑 削除
                </button>

            `;


            list.appendChild(
                card
            );

        }
    );


    // 名前
    document
        .querySelectorAll(
            ".gacha-face-name"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "input",
                    event => {

                        const index =
                            Number(
                                event.target.dataset.index
                            );


                        faces[index].name =
                            event.target.value;

                    }
                );

            }
        );


    // URL
    document
        .querySelectorAll(
            ".gacha-face-url"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "input",
                    event => {

                        const index =
                            Number(
                                event.target.dataset.index
                            );


                        faces[index].imageUrl =
                            event.target.value;

                    }
                );

            }
        );


    // レア度
    document
        .querySelectorAll(
            ".gacha-face-rarity"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "change",
                    event => {

                        const index =
                            Number(
                                event.target.dataset.index
                            );


                        faces[index].rarity =
                            event.target.value;

                    }
                );

            }
        );


    // 確率
    document
        .querySelectorAll(
            ".gacha-face-probability"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "input",
                    event => {

                        const index =
                            Number(
                                event.target.dataset.index
                            );


                        faces[index].probability =
                            Number(
                                event.target.value
                            ) || 0;


                        updateTotal();

                    }
                );

            }
        );


    // 削除
    document
        .querySelectorAll(
            ".delete-gacha-face"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const index =
                            Number(
                                button.dataset.index
                            );


                        if (
                            !confirm(
                                `${faces[index].name} を削除しますか？`
                            )
                        ) {
                            return;
                        }


                        faces.splice(
                            index,
                            1
                        );


                        renderFaces();

                    }
                );

            }
        );


    updateTotal();

}


// ==================================================
// 合計確率
// ==================================================

function updateTotal() {

    const total =
        faces.reduce(
            (sum, face) =>
                sum +
                (
                    Number(
                        face.probability
                    ) || 0
                ),
            0
        );


    const element =
        document.getElementById(
            "gachaProbabilityTotal"
        );


    if (!element) {
        return;
    }


    element.textContent =
        `合計確率: ${total.toFixed(2)}%`;


    element.style.color =
        Math.abs(
            total - 100
        ) < 0.001
            ? ""
            : "#ff7777";

}


// ==================================================
// 顔を追加
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

        rarity:
            "N",

        probability:
            0

    });


    renderFaces();


    // 追加したところまでスクロール
    const list =
        document.getElementById(
            "gachaFaceList"
        );


    if (list) {

        list.lastElementChild?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    }

}


// ==================================================
// 保存
// ==================================================

async function saveFaces() {

    const total =
        faces.reduce(
            (sum, face) =>
                sum +
                (
                    Number(
                        face.probability
                    ) || 0
                ),
            0
        );


    if (
        Math.abs(
            total - 100
        ) > 0.001
    ) {

        alert(
            `排出確率の合計を100%にしてください。\n現在: ${total.toFixed(2)}%`
        );

        return;
    }


    for (
        const face of faces
    ) {

        if (!face.id) {

            alert(
                "IDが空の顔があります。"
            );

            return;

        }


        if (!face.imageUrl) {

            alert(
                `「${face.name}」の画像URLが空です。`
            );

            return;

        }


        if (
            !RARITIES.includes(
                face.rarity
            )
        ) {

            alert(
                `「${face.name}」のレア度が不正です。`
            );

            return;

        }


        if (
            Number(face.probability) < 0
        ) {

            alert(
                `「${face.name}」の確率が不正です。`
            );

            return;

        }

    }


    const button =
        document.getElementById(
            "saveGachaFacesBtn"
        );


    button.disabled = true;


    try {

        const ref =
            doc(
                db,
                "adminSettings",
                "gameplay"
            );


        const current =
            await getDoc(ref);


        const base =
            current.exists()
                ? current.data()
                : {};


        await setDoc(
            ref,
            {

                ...base,

                gachaFaces:
                    faces,

                updatedBy:
                    currentUser.uid,

                updatedAt:
                    serverTimestamp()

            }
        );


        // ゲーム側へ即時通知
        window.dispatchEvent(
            new CustomEvent(
                "gachaFacesUpdated",
                {
                    detail: {
                        faces
                    }
                }
            )
        );


        alert(
            "ガチャ設定を保存しました。"
        );


    } catch (error) {

        console.error(
            "ガチャ設定保存失敗:",
            error
        );


        alert(
            `保存に失敗しました。\n${
                error.message || error
            }`
        );


    } finally {

        button.disabled = false;

    }

}


// ==================================================
// 初期設定へ戻す
// ==================================================

async function resetFaces() {

    if (
        !confirm(
            "ガチャ設定を初期状態に戻しますか？"
        )
    ) {

        return;

    }


    faces =
        structuredClone(
            DEFAULT_FACES
        );


    renderFaces();


    await saveFaces();

}


// ==================================================
// HTMLエスケープ
// ==================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// ==================================================
// 管理者確認
// ==================================================

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {
            return;
        }


        currentUser =
            user;


        try {

            const adminDoc =
                await getDoc(
                    doc(
                        db,
                        "admins",
                        user.uid
                    )
                );


            if (
                !adminDoc.exists()
            ) {
                return;
            }


            const role =
                adminDoc.data().role;


            if (
                role !== "admin" &&
                role !== "owner"
            ) {
                return;
            }


            /*
             * admin.jsがadminPanelを
             * 表示するまで待つ
             */
            const wait =
                setInterval(
                    () => {

                        const panel =
                            document.getElementById(
                                "adminPanel"
                            );


                        if (
                            panel &&
                            !panel.hidden
                        ) {

                            clearInterval(
                                wait
                            );


                            createPanel();

                        }

                    },
                    100
                );


            setTimeout(
                () => {
                    clearInterval(wait);
                },
                10000
            );


        } catch (error) {

            console.error(
                "管理者確認失敗:",
                error
            );

        }

    }
);
