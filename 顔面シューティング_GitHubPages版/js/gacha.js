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
    saveFaceData
} from "./face-system.js";


// ==================================================
// ガチャ設定
// ==================================================

let settings = {
    singleCost: 1000,
    tenCost: 9000
};


// ==================================================
// ガチャ顔一覧
// ==================================================

let gachaFaces = [];

let gachaReady = false;

let gachaEnabled = true;


// ==================================================
// スキル重複必要数
//
// Tsum Tsumのように、同じ顔を入手すると
// スキル成長ポイントが貯まる。
// ==================================================

const SKILL_DUPLICATE_REQUIREMENTS = [
    2,   // Lv1 → Lv2
    3,   // Lv2 → Lv3
    4,   // Lv3 → Lv4
    6,   // Lv4 → Lv5
    12   // Lv5 → Lv6
];


// ==================================================
// DOM
// ==================================================

const singleButton =
    document.getElementById("singleButton");

const tenButton =
    document.getElementById("tenButton");

const resultGrid =
    document.getElementById("resultGrid");

const pointValue =
    document.getElementById("pointValue");


// ==================================================
// 初期状態
// ==================================================

disableButtons();


// ==================================================
// 設定読み込み
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

        const data =
            snapshot.exists()
                ? snapshot.data()
                : {};


        // ------------------------------
        // ガチャ料金
        // ------------------------------

        settings.singleCost =
            Number(
                data.gachaSingleCost
            ) || 1000;

        settings.tenCost =
            Number(
                data.gachaTenCost
            ) || 9000;


        // ------------------------------
        // ガチャON/OFF
        // ------------------------------

        gachaEnabled =
            data.gachaEnabled !== false;


        if (!gachaEnabled) {

            showMessage(
                "現在、顔ガチャは無効になっています。"
            );

            disableButtons();

            gachaReady = false;

            updateCostDisplay();

            return;
        }


        // ------------------------------
        // 顔一覧
        // ------------------------------

        if (
            Array.isArray(
                data.gachaFaces
            )
        ) {

            gachaFaces =
                data.gachaFaces
                    .map(face => ({

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

                    }))
                    .filter(face =>
                        face.id &&
                        face.imageUrl &&
                        Number.isFinite(
                            face.probability
                        ) &&
                        face.probability > 0
                    );

        } else {

            gachaFaces = [];

        }


        // ------------------------------
        // 確率確認
        // ------------------------------

        const total =
            getProbabilityTotal();


        if (
            gachaFaces.length === 0
        ) {

            showMessage(
                "ガチャに使用できる顔がありません。管理画面で顔を追加してください。"
            );

            disableButtons();

            gachaReady = false;

            return;
        }


        if (total <= 0) {

            showMessage(
                "ガチャ確率が設定されていません。"
            );

            disableButtons();

            gachaReady = false;

            return;
        }


        // ------------------------------
        // 準備完了
        // ------------------------------

        gachaReady = true;

        updateCostDisplay();

        enableButtons();

        console.log(
            "[GACHA] 顔一覧:",
            gachaFaces
        );

        console.log(
            "[GACHA] 確率合計:",
            total
        );

        showMessage(
            ""
        );


    } catch (error) {

        console.error(
            "[GACHA] 設定読み込み失敗:",
            error
        );

        gachaReady = false;

        disableButtons();

        showMessage(
            "ガチャ設定の読み込みに失敗しました。"
        );

    }

}


// ==================================================
// 確率合計
// ==================================================

function getProbabilityTotal() {

    return gachaFaces.reduce(
        (
            sum,
            face
        ) => {

            const probability =
                Number(
                    face.probability
                );

            return (
                sum +
                (
                    Number.isFinite(
                        probability
                    ) &&
                    probability > 0
                        ? probability
                        : 0
                )
            );

        },
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
        const face
        of gachaFaces
    ) {

        const probability =
            Number(
                face.probability
            ) || 0;


        random -= probability;


        if (
            random < 0
        ) {

            return face;

        }

    }


    // 浮動小数点誤差対策

    return (
        gachaFaces[
            gachaFaces.length - 1
        ]
    );

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

            results.push(
                face
            );

        }

    }


    return results;

}


// ==================================================
// ボタン
// ==================================================

function enableButtons() {

    if (
        singleButton
    ) {

        singleButton.disabled =
            false;

    }


    if (
        tenButton
    ) {

        tenButton.disabled =
            false;

    }

}


function disableButtons() {

    if (
        singleButton
    ) {

        singleButton.disabled =
            true;

    }


    if (
        tenButton
    ) {

        tenButton.disabled =
            true;

    }

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
            `${settings.singleCost.toLocaleString()} P`;

    }


    if (
        tenCostElement
    ) {

        tenCostElement.textContent =
            `${settings.tenCost.toLocaleString()} P`;

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


    if (
        element
    ) {

        element.textContent =
            message;

    }

}


// ==================================================
// ポイント表示
// ==================================================

async function updatePointDisplay(
    uid
) {

    if (
        !uid ||
        !pointValue
    ) {

        return;

    }


    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    uid
                )
            );


        if (
            !snapshot.exists()
        ) {

            pointValue.textContent =
                "0";

            return;

        }


        const data =
            snapshot.data();


        const points =
            Number(
                data.points
            ) || 0;


        pointValue.textContent =
            points.toLocaleString();

    } catch (error) {

        console.warn(
            "[GACHA] ポイント表示更新失敗:",
            error
        );

    }

}


// ==================================================
// 結果表示
// ==================================================

function renderSingleResult(
    face,
    duplicateInfo = null
) {

    if (
        !resultGrid ||
        !face
    ) {

        return;

    }


    let extraText = "";


    if (duplicateInfo) {

        if (
            duplicateInfo.leveledUp
        ) {

            extraText = `
                <p class="skill-result-levelup">
                    🎉 スキルLv${duplicateInfo.newLevel}！
                </p>
            `;

        } else {

            extraText = `
                <p class="skill-result-progress">
                    スキル成長
                    ${duplicateInfo.progress}
                    /
                    ${duplicateInfo.required}
                </p>
            `;

        }

    } else {

        extraText = `
            <p class="skill-result-new">
                ✨ 新しい顔を獲得！
            </p>
        `;

    }


    resultGrid.innerHTML = `

        <div class="gacha-result-card">

            <img
                src="${escapeHtml(face.imageUrl)}"
                alt="${escapeHtml(face.name)}"
            >

            <div class="result-rarity">
                ${escapeHtml(face.rarity)}
            </div>

            <h3>
                ${escapeHtml(face.name)}
            </h3>

            <p>
                排出率
                ${Number(face.probability).toFixed(2)}%
            </p>

            ${extraText}

        </div>

    `;

}


// ==================================================
// 10連結果表示
// ==================================================

function renderTenResults(
    results,
    duplicateInfos = []
) {

    if (
        !resultGrid
    ) {

        return;

    }


    resultGrid.innerHTML =
        results
            .map(
                (face, index) => {

                    const duplicateInfo =
                        duplicateInfos[index];


                    let extraText = "";


                    if (
                        duplicateInfo
                    ) {

                        if (
                            duplicateInfo.leveledUp
                        ) {

                            extraText = `
                                <p class="skill-result-levelup">
                                    🎉 スキルLv${duplicateInfo.newLevel}！
                                </p>
                            `;

                        } else {

                            extraText = `
                                <p class="skill-result-progress">
                                    スキル
                                    ${duplicateInfo.progress}
                                    /
                                    ${duplicateInfo.required}
                                </p>
                            `;

                        }

                    } else {

                        extraText = `
                            <p class="skill-result-new">
                                ✨ NEW
                            </p>
                        `;

                    }


                    return `

                        <div class="gacha-result-card">

                            <img
                                src="${escapeHtml(
                                    face.imageUrl
                                )}"
                                alt="${escapeHtml(
                                    face.name
                                )}"
                            >

                            <div class="result-rarity">
                                ${escapeHtml(
                                    face.rarity
                                )}
                            </div>

                            <h3>
                                ${escapeHtml(
                                    face.name
                                )}
                            </h3>

                            <p>
                                排出率
                                ${Number(
                                    face.probability
                                ).toFixed(2)}%
                            </p>

                            ${extraText}

                        </div>

                    `;

                }
            )
            .join("");

}


// ==================================================
// 必要な重複数
// ==================================================

function getRequiredDuplicates(level) {

    if (
        level >= 6
    ) {

        return Infinity;

    }


    return (
        SKILL_DUPLICATE_REQUIREMENTS[
            level - 1
        ] || 12
    );

}


// ==================================================
// スキルデータ補正
// ==================================================

function normalizeFaceSkill(skill) {

    const data = skill || {};


    return {

        level:
            Math.max(
                1,
                Math.min(
                    6,
                    Number(data.level) || 1
                )
            ),

        progress:
            Math.max(
                0,
                Number(data.progress) || 0
            ),

        totalKills:
            Math.max(
                0,
                Number(data.totalKills) || 0
            ),

        tickets:
            Math.max(
                0,
                Number(data.tickets) || 0
            ),

        duplicateProgress:
            Math.max(
                0,
                Number(data.duplicateProgress) || 0
            )

    };

}


// ==================================================
// 重複顔 → スキル成長
// ==================================================

function applyDuplicateSkill(
    face
) {

    const skill =
        normalizeFaceSkill(
            face.skill
        );


    // --------------------------------------------------
    // 最大Lv
    // --------------------------------------------------

    if (
        skill.level >= 6
    ) {

        return {

            changed: false,

            maxLevel: true,

            level:
                skill.level,

            progress:
                skill.duplicateProgress,

            required:
                Infinity,

            newLevel:
                skill.level,

            skill

        };

    }


    // --------------------------------------------------
    // 重複分を追加
    // --------------------------------------------------

    skill.duplicateProgress += 1;


    let leveledUp = false;


    // --------------------------------------------------
    // Lvアップ判定
    // --------------------------------------------------

    while (
        skill.level < 6
    ) {

        const required =
            getRequiredDuplicates(
                skill.level
            );


        if (
            skill.duplicateProgress <
            required
        ) {

            break;

        }


        skill.duplicateProgress -=
            required;

        skill.level += 1;

        leveledUp = true;

    }


    return {

        changed: true,

        maxLevel:
            skill.level >= 6,

        leveledUp,

        level:
            skill.level,

        newLevel:
            skill.level,

        progress:
            skill.duplicateProgress,

        required:
            skill.level >= 6
                ? Infinity
                : getRequiredDuplicates(
                    skill.level
                ),

        skill

    };

}


// ==================================================
// 顔を所持一覧へ追加
//
// NEW:
//   新規顔 → 所持
//
// DUPLICATE:
//   重複顔 → スキル成長
// ==================================================

async function addFacesToCollection(
    uid,
    results
) {

    if (
        !uid ||
        !Array.isArray(results) ||
        results.length === 0
    ) {

        return [];

    }


    const faceData =
        await loadFaceData(
            uid
        );


    if (
        !faceData ||
        !Array.isArray(
            faceData.faces
        )
    ) {

        return [];

    }


    const duplicateInfos = [];


    for (
        const face
        of results
    ) {

        const existing =
            faceData.faces.find(
                item =>
                    item.id === face.id
            );


        // ==================================================
        // 新規顔
        // ==================================================

        if (
            !existing
        ) {

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
                    Date.now(),

                skill: {

                    level: 1,

                    progress: 0,

                    totalKills: 0,

                    tickets: 0,

                    duplicateProgress: 0

                }

            });


            duplicateInfos.push(null);

            continue;

        }


        // ==================================================
        // 重複
        // ==================================================

        existing.skill =
            normalizeFaceSkill(
                existing.skill
            );


        const result =
            applyDuplicateSkill(
                existing
            );


        existing.skill =
            result.skill;


        duplicateInfos.push({

            leveledUp:
                result.leveledUp,

            newLevel:
                result.newLevel,

            progress:
                result.progress,

            required:
                result.required,

            maxLevel:
                result.maxLevel

        });


        console.log(
            "[GACHA] 重複顔 → スキル成長:",
            face.id,
            result
        );

    }


    await saveFaceData(
        uid,
        faceData
    );


    return duplicateInfos;

}


// ==================================================
// 1回引く
// ==================================================

async function drawSingle() {

    if (
        !gachaReady ||
        !gachaEnabled
    ) {

        return;

    }


    const user =
        auth.currentUser;


    if (
        !user
    ) {

        showMessage(
            "ログインしてください。"
        );

        return;

    }


    disableButtons();


    try {

        const face =
            randomFace();


        if (
            !face
        ) {

            throw new Error(
                "抽選対象がありません。"
            );

        }


        // ------------------------------
        // ポイント消費
        // ------------------------------

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


        // ------------------------------
        // 所持顔保存
        // ------------------------------

        const duplicateInfos =
            await addFacesToCollection(
                user.uid,
                [face]
            );


        const duplicateInfo =
            duplicateInfos[0];


        // ------------------------------
        // 表示
        // ------------------------------

        renderSingleResult(
            face,
            duplicateInfo
        );


        if (
            duplicateInfo?.leveledUp
        ) {

            showMessage(
                `${face.rarity}「${face.name}」のスキルがLv${duplicateInfo.newLevel}になった！`
            );

        } else if (
            duplicateInfo
        ) {

            if (
                duplicateInfo.maxLevel
            ) {

                showMessage(
                    `${face.rarity}「${face.name}」はスキルLv6です！`
                );

            } else {

                showMessage(
                    `${face.rarity}「${face.name}」が重複！ スキル成長！`
                );

            }

        } else {

            showMessage(
                `${face.rarity}「${face.name}」を獲得！`
            );

        }


        await updatePointDisplay(
            user.uid
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


        await updatePointDisplay(
            user.uid
        );

    } finally {

        if (
            gachaReady &&
            gachaEnabled
        ) {

            enableButtons();

        }

    }

}


// ==================================================
// 10連
// ==================================================

async function drawTen() {

    if (
        !gachaReady ||
        !gachaEnabled
    ) {

        return;

    }


    const user =
        auth.currentUser;


    if (
        !user
    ) {

        showMessage(
            "ログインしてください。"
        );

        return;

    }


    disableButtons();


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


        // ------------------------------
        // ポイント消費
        // ------------------------------

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


        // ------------------------------
        // 所持顔保存
        // ------------------------------

        const duplicateInfos =
            await addFacesToCollection(
                user.uid,
                results
            );


        // ------------------------------
        // 結果表示
        // ------------------------------

        renderTenResults(
            results,
            duplicateInfos
        );


        const levelUpCount =
            duplicateInfos.filter(
                info =>
                    info &&
                    info.leveledUp
            ).length;


        const duplicateCount =
            duplicateInfos.filter(
                info =>
                    info
            ).length;


        if (
            levelUpCount > 0
        ) {

            showMessage(
                `10連完了！ スキルLvアップ ${levelUpCount}件！`
            );

        } else if (
            duplicateCount > 0
        ) {

            showMessage(
                `10連完了！ 重複 ${duplicateCount}件がスキル成長！`
            );

        } else {

            showMessage(
                "10連ガチャ完了！"
            );

        }


        await updatePointDisplay(
            user.uid
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


        await updatePointDisplay(
            user.uid
        );


    } finally {

        if (
            gachaReady &&
            gachaEnabled
        ) {

            enableButtons();

        }

    }

}


// ==================================================
// ボタンイベント
// ==================================================

if (
    singleButton
) {

    singleButton.addEventListener(
        "click",
        drawSingle
    );

}


if (
    tenButton
) {

    tenButton.addEventListener(
        "click",
        drawTen
    );

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
// ログイン状態
// ==================================================

// ==================================================
// ログイン状態
// ==================================================

const loginRequired =
    document.getElementById("loginRequired");

const app =
    document.getElementById("app");

function updateLoginScreen(user) {

    if (!loginRequired || !app) {
        return;
    }

    if (user) {

        // ログイン済み
        loginRequired.style.display = "none";
        app.style.display = "block";

        console.log(
            "[GACHA] ログイン済み:",
            user.uid
        );

    } else {

        // 未ログイン
        loginRequired.style.display = "flex";
        app.style.display = "none";

        gachaReady = false;

        disableButtons();

        if (pointValue) {
            pointValue.textContent = "0";
        }

        console.log(
            "[GACHA] 未ログイン"
        );
    }
}


onAuthStateChanged(
    auth,
    user => {

        updateLoginScreen(user);

        if (!user) {
            return;
        }

        void Promise.all([
            loadSettings(),
            updatePointDisplay(user.uid)
        ]);

    }
);
