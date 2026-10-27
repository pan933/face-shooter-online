import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    doc,
    getDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
    loadFaceData,
    saveFaceData,
    formatBuffs,
    INITIAL_FACE
} from "./face-system.js";


// ==================================================
// ガチャ設定
// ==================================================

let settings = {
    singleCost: 1000,
    tenCost: 9000
};


// 管理画面で設定された顔
let gachaFaces = [];


// 設定読み込み完了
let gachaReady = false;


// ==================================================
// DOM
// ==================================================

const singleButton =
    document.getElementById(
        "singleButton"
    );

const tenButton =
    document.getElementById(
        "tenButton"
    );


// 読み込み中は押せない
if (singleButton) {
    singleButton.disabled = true;
}

if (tenButton) {
    tenButton.disabled = true;
}


// ==================================================
// ガチャ設定読み込み
// ==================================================

async function loadSettings() {

    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "adminSettings",
                    "gameplay"
                )
            );


        if (
            snapshot.exists()
        ) {

            const data =
                snapshot.data();


            // ガチャ料金
            settings.singleCost =
                Number(
                    data.gachaSingleCost
                ) || 1000;


            settings.tenCost =
                Number(
                    data.gachaTenCost
                ) || 9000;


            // ガチャ有効 / 無効
            if (
                data.gachaEnabled === false
            ) {

                showMessage(
                    "現在、顔ガチャは無効になっています。"
                );

                disableButtons();

                return;

            }


            // ========================================
            // 顔データ
            // ========================================

            if (
                Array.isArray(
                    data.gachaFaces
                )
            ) {

                gachaFaces =
                    data.gachaFaces
                        .map(
                            face => ({

                                id:
                                    String(
                                        face.id || ""
                                    ),

                                name:
                                    String(
                                        face.name ||
                                        face.id ||
                                        "無名"
                                    ),

                                imageUrl:
                                    String(
                                        face.imageUrl ||
                                        ""
                                    ),

                                rarity:
                                    String(
                                        face.rarity ||
                                        "N"
                                    ),

                                probability:
                                    Number(
                                        face.probability
                                    ) || 0

                            })
                        )
                        .filter(
                            face =>
                                face.id &&
                                face.imageUrl &&
                                face.probability > 0
                        );

            }


            // Firestoreにまだ設定がない場合
            // 既存のface-system.jsの顔を使用
            if (
                gachaFaces.length === 0
            ) {

                console.warn(
                    "[GACHA] gachaFacesがありません。"
                );

                showMessage(
                    "ガチャに使用できる顔が設定されていません。"
                );

                disableButtons();

                return;

            }


            // 確率合計を確認
            const total =
                getProbabilityTotal();


            if (
                total <= 0
            ) {

                showMessage(
                    "ガチャ確率が設定されていません。"
                );

                disableButtons();

                return;

            }


            gachaReady = true;


            updateCostDisplay();


            if (singleButton) {
                singleButton.disabled = false;
            }

            if (tenButton) {
                tenButton.disabled = false;
            }


            console.log(
                "[GACHA] 顔一覧:",
                gachaFaces
            );

            console.log(
                "[GACHA] 確率合計:",
                total
            );

        }


    } catch (error) {

        console.error(
            "[GACHA] 設定読み込み失敗:",
            error
        );


        showMessage(
            "ガチャ設定の読み込みに失敗しました。"
        );


        disableButtons();

    }

}


// ==================================================
// 確率合計
// ==================================================

function getProbabilityTotal() {

    return gachaFaces.reduce(
        (sum, face) =>
            sum +
            (
                Number(
                    face.probability
                ) || 0
            ),
        0
    );

}


// ==================================================
// 個別確率抽選
// ==================================================

function randomFace() {

    if (
        gachaFaces.length === 0
    ) {
        return null;
    }


    const total =
        getProbabilityTotal();


    if (
        total <= 0
    ) {
        return null;
    }


    let random =
        Math.random() *
        total;


    for (
        const face of gachaFaces
    ) {

        random -=
            Number(
                face.probability
            ) || 0;


        if (
            random <= 0
        ) {

            return face;

        }

    }


    // 浮動小数点誤差対策
    return gachaFaces[
        gachaFaces.length - 1
    ];

}


// ==================================================
// 10連
// ==================================================

function randomTenFaces() {

    const results = [];


    for (
        let i = 0;
        i < 10;
        i++
    ) {

        const face =
            randomFace();


        if (face) {
            results.push(face);
        }

    }


    return results;

}


// ==================================================
// コスト表示
// ==================================================

function updateCostDisplay() {

    const singleCostElement =
        document.getElementById(
            "singleCost"
        );

    const tenCostElement =
        document.getElementById(
            "tenCost"
        );


    if (
        singleCostElement
    ) {

        singleCostElement.textContent =
            settings.singleCost.toLocaleString();

    }


    if (
        tenCostElement
    ) {

        tenCostElement.textContent =
            settings.tenCost.toLocaleString();

    }

}


// ==================================================
// ボタン無効化
// ==================================================

function disableButtons() {

    if (singleButton) {
        singleButton.disabled = true;
    }

    if (tenButton) {
        tenButton.disabled = true;
    }

}


// ==================================================
// メッセージ
// ==================================================

function showMessage(
    message
) {

    const element =
        document.getElementById(
            "gachaMessage"
        );


    if (element) {

        element.textContent =
            message;

    }

}


// ==================================================
// 結果表示
// ==================================================

function renderResult(
    face
) {

    if (!face) {
        return;
    }


    const result =
        document.getElementById(
            "gachaResult"
        );


    if (!result) {
        return;
    }


    result.innerHTML = `

        <div
            class="gacha-result-card"
        >

            <img
                src="${escapeHtml(face.imageUrl)}"
                alt="${escapeHtml(face.name)}"
                style="
                    max-width:220px;
                    max-height:220px;
                    object-fit:contain;
                    border-radius:12px;
                "
            >

            <h3>
                ${escapeHtml(face.name)}
            </h3>

            <p>
                レア度:
                <strong>
                    ${escapeHtml(face.rarity)}
                </strong>
            </p>

            <p>
                排出率:
                ${Number(face.probability).toFixed(2)}%
            </p>

        </div>

    `;

}


// ==================================================
// 10連結果表示
// ==================================================

function renderTenResults(
    results
) {

    const result =
        document.getElementById(
            "gachaResult"
        );


    if (!result) {
        return;
    }


    result.innerHTML = `

        <div
            class="gacha-ten-results"
            style="
                display:grid;
                grid-template-columns:
                    repeat(
                        auto-fit,
                        minmax(120px,1fr)
                    );
                gap:12px;
            "
        >

            ${results.map(
                face => `

                    <div
                        class="gacha-result-card"
                    >

                        <img
                            src="${escapeHtml(face.imageUrl)}"
                            alt="${escapeHtml(face.name)}"
                            style="
                                width:100%;
                                aspect-ratio:1;
                                object-fit:contain;
                                border-radius:10px;
                            "
                        >

                        <strong>
                            ${escapeHtml(face.rarity)}
                        </strong>

                        <div>
                            ${escapeHtml(face.name)}
                        </div>

                    </div>

                `
            ).join("")}

        </div>

    `;

}


// ==================================================
// 1回引く
// ==================================================

async function drawSingle() {

    if (
        !gachaReady
    ) {
        return;
    }


    const user =
        auth.currentUser;


    if (!user) {

        showMessage(
            "ログインしてください。"
        );

        return;

    }


    if (
        singleButton
    ) {

        singleButton.disabled =
            true;

    }


    try {

        const face =
            randomFace();


        if (!face) {

            throw new Error(
                "抽選対象がありません。"
            );

        }


        /*
         * ポイント消費
         *
         * 既存のFirestore構造に合わせて
         * pointsフィールドを使用
         */
        await runTransaction(
            db,
            async transaction => {

                const userRef =
                    doc(
                        db,
                        "users",
                        user.uid
                    );


                const snapshot =
                    await transaction.get(
                        userRef
                    );


                if (
                    !snapshot.exists()
                ) {

                    throw new Error(
                        "ユーザーデータがありません。"
                    );

                }


                const data =
                    snapshot.data();


                const points =
                    Number(
                        data.points
                    ) || 0;


                if (
                    points <
                    settings.singleCost
                ) {

                    throw new Error(
                        "ポイントが足りません。"
                    );

                }


                transaction.update(
                    userRef,
                    {

                        points:
                            points -
                            settings.singleCost,

                        updatedAt:
                            serverTimestamp()

                    }
                );

            }
        );


        // ========================================
        // 顔データ保存
        // ========================================

        const faceData =
            await loadFaceData(
                user.uid
            );


        if (
            faceData &&
            Array.isArray(
                faceData.faces
            )
        ) {

            const exists =
                faceData.faces.some(
                    item =>
                        item.id === face.id
                );


            if (!exists) {

                faceData.faces.push({

                    id:
                        face.id,

                    name:
                        face.name,

                    imageUrl:
                        face.imageUrl,

                    rarity:
                        face.rarity,

                    probability:
                        face.probability,

                    obtainedAt:
                        Date.now()

                });


                await saveFaceData(
                    user.uid,
                    faceData
                );

            }

        }


        renderResult(
            face
        );


        showMessage(
            `${face.rarity}「${face.name}」を獲得！`
        );


    } catch (error) {

        console.error(
            "[GACHA] 1回抽選エラー:",
            error
        );


        showMessage(
            error.message ||
            "ガチャに失敗しました。"
        );


    } finally {

        if (
            singleButton &&
            gachaReady
        ) {

            singleButton.disabled =
                false;

        }

    }

}


// ==================================================
// 10連
// ==================================================

async function drawTen() {

    if (
        !gachaReady
    ) {
        return;
    }


    const user =
        auth.currentUser;


    if (!user) {

        showMessage(
            "ログインしてください。"
        );

        return;

    }


    if (tenButton) {
        tenButton.disabled = true;
    }


    try {

        const results =
            randomTenFaces();


        if (
            results.length !== 10
        ) {

            throw new Error(
                "抽選対象がありません。"
            );

        }


        await runTransaction(
            db,
            async transaction => {

                const userRef =
                    doc(
                        db,
                        "users",
                        user.uid
                    );


                const snapshot =
                    await transaction.get(
                        userRef
                    );


                if (
                    !snapshot.exists()
                ) {

                    throw new Error(
                        "ユーザーデータがありません。"
                    );

                }


                const data =
                    snapshot.data();


                const points =
                    Number(
                        data.points
                    ) || 0;


                if (
                    points <
                    settings.tenCost
                ) {

                    throw new Error(
                        "ポイントが足りません。"
                    );

                }


                transaction.update(
                    userRef,
                    {

                        points:
                            points -
                            settings.tenCost,

                        updatedAt:
                            serverTimestamp()

                    }
                );

            }
        );


        // ========================================
        // 全結果を保存
        // ========================================

        const faceData =
            await loadFaceData(
                user.uid
            );


        if (
            faceData &&
            Array.isArray(
                faceData.faces
            )
        ) {

            for (
                const face
                of results
            ) {

                const exists =
                    faceData.faces.some(
                        item =>
                            item.id ===
                            face.id
                    );


                if (!exists) {

                    faceData.faces.push({

                        id:
                            face.id,

                        name:
                            face.name,

                        imageUrl:
                            face.imageUrl,

                        rarity:
                            face.rarity,

                        probability:
                            face.probability,

                        obtainedAt:
                            Date.now()

                    });

                }

            }


            await saveFaceData(
                user.uid,
                faceData
            );

        }


        renderTenResults(
            results
        );


        showMessage(
            "10連ガチャ完了！"
        );


    } catch (error) {

        console.error(
            "[GACHA] 10連抽選エラー:",
            error
        );


        showMessage(
            error.message ||
            "ガチャに失敗しました。"
        );


    } finally {

        if (
            tenButton &&
            gachaReady
        ) {

            tenButton.disabled =
                false;

        }

    }

}


// ==================================================
// ボタンイベント
// ==================================================

if (singleButton) {

    singleButton.addEventListener(
        "click",
        drawSingle
    );

}


if (tenButton) {

    tenButton.addEventListener(
        "click",
        drawTen
    );

}


// ==================================================
// HTMLエスケープ
// ==================================================

function escapeHtml(value) {

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
// ログイン後に設定読み込み
// ==================================================

onAuthStateChanged(
    auth,
    user => {

        if (!user) {

            gachaReady = false;

            disableButtons();

            return;

        }


        void loadSettings();

    }
);
