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
let guaranteeRarity = "SSR";
let boostMultiplier = 2;
let duplicateCoinReward = 1;
let mudDangoCoinsRequired = 30;
let mudDangoRewardFaceId = "";


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
const collectionGrid =
    document.getElementById("collectionGrid");
const gachaFacesGrid =
    document.getElementById("gachaFacesGrid");
const gachaFaceDisplay =
    document.getElementById("gachaFace");
const gachaRarityDisplay =
    document.getElementById("gachaRarity");
const mudDangoCoinValue =
    document.getElementById("mudDangoCoinValue");
const mudDangoCoinRequirement =
    document.getElementById("mudDangoCoinRequirement");


// ========================================
// 所持顔一覧の読み込み
// ========================================

async function loadCollection(uid) {
    if (!uid || !collectionGrid) return;

    collectionGrid.textContent = "所持顔を読み込み中...";

    try {
        const faceData = await loadFaceData(uid);

        const faces = Array.isArray(faceData?.faces)
            ? faceData.faces
            : [];

        renderCollection(faces);

    } catch (error) {
        console.error("[GACHA] 所持顔読み込み失敗:", error);

        collectionGrid.textContent =
            "所持顔を読み込めませんでした。ページを再読み込みしてください。";
    }
}


// ========================================
// 所持顔一覧の描画
// ========================================

function renderCollection(faces) {
    if (!collectionGrid) return;

    if (!Array.isArray(faces) || faces.length === 0) {
        collectionGrid.textContent =
            "所持している顔はまだありません。ガチャを引いて顔を獲得しよう！";
        return;
    }

    collectionGrid.replaceChildren();

    for (const face of faces) {
        const currentSettings = gachaFaces.find(item => item.id === face.id);
        const displayFace = currentSettings
            ? { ...face, ...currentSettings }
            : face;
        const card = document.createElement("article");
        card.className = "collection-card";

        const image = document.createElement("img");
        image.src = displayFace.imageUrl || "";
        image.alt = displayFace.name || displayFace.id || "顔";
        image.loading = "lazy";

        const name = document.createElement("h3");
        name.textContent = displayFace.name || displayFace.id || "無名";

        const rarity = document.createElement("p");
        rarity.textContent = displayFace.rarity || "N";

        const skill = normalizeFaceSkill(face.skill);

        const skillLevel = document.createElement("p");
        skillLevel.textContent = `スキル Lv.${skill.level}`;

        const progress = document.createElement("p");

        if (skill.level >= 6) {
            progress.textContent = "スキル最大レベル";
        } else {
            progress.textContent =
                `次のLvまで：${skill.duplicateProgress}/${getRequiredDuplicates(skill.level)}`;
        }

        card.append(
            image,
            name,
            rarity,
            skillLevel,
            progress
        );

        appendFaceDetails(card, displayFace);

        collectionGrid.appendChild(card);
    }
}


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

        guaranteeRarity = ["N", "R", "SR", "SSR", "UR"].includes(data.gachaGuaranteeRarity)
            ? data.gachaGuaranteeRarity
            : "SSR";
        boostMultiplier = Math.max(1, Number(data.gachaBoostMultiplier) || 2);
        duplicateCoinReward = data.duplicateCoinReward == null
            ? 1
            : Math.max(0, Math.floor(Number(data.duplicateCoinReward) || 0));
        mudDangoCoinsRequired = Math.max(1, Math.floor(Number(data.mudDangoCoinsRequired) || 30));
        mudDangoRewardFaceId = String(data.mudDangoRewardFaceId || "");
        if (mudDangoCoinRequirement) {
            mudDangoCoinRequirement.textContent = mudDangoCoinsRequired.toLocaleString();
        }


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

                        boosted:
                            Boolean(face.boosted),

                        description:
                            String(
                                face.description ||
                                face.additionalInfo ||
                                face.details ||
                                ""
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
                        face.probability >= 0
                    );

        } else {

            gachaFaces = [];

        }


        // ------------------------------
        // 確率確認
        // ------------------------------

        // ガチャ顔が未登録の場合は初期顔セットを使用
if (gachaFaces.length === 0) {
    gachaFaces = [
        {
            id: "face2",
            name: "初期顔",
            imageUrl: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png",
            rarity: "N",
            probability: 93
        },
        {
            id: "face_4",
            name: "顔 4",
            imageUrl: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_4.jpg",
            rarity: "SR",
            probability: 4
        },
        {
            id: "face_1",
            name: "顔 1",
            imageUrl: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_1.jpg",
            rarity: "UR",
            probability: 1
        },
        {
            id: "face_2",
            name: "顔 2",
            imageUrl: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_2.jpg",
            rarity: "UR",
            probability: 1
        },
        {
            id: "face_3",
            name: "顔 3",
            imageUrl: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_3.jpg",
            rarity: "UR",
            probability: 1
        }
    ];

    console.warn(
        "[GACHA] 管理画面に顔が未登録のため、初期顔セットを使用します。"
    );
}


        const total = getProbabilityTotal();
        renderGachaLineup();


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
// 管理画面で設定した排出ラインナップ
// ==================================================

function renderGachaLineup() {
    if (!gachaFacesGrid) return;

    gachaFacesGrid.replaceChildren();

    for (const face of gachaFaces) {
        const card = document.createElement("article");
        card.className = "gacha-lineup-card";

        const image = document.createElement("img");
        image.src = face.imageUrl || "";
        image.alt = face.name || face.id || "顔";
        image.loading = "lazy";
        image.addEventListener("error", () => {
            image.classList.add("image-load-failed");
            image.alt = `${face.name || face.id || "顔"}（画像を読み込めません）`;
        }, { once: true });

        const name = document.createElement("h3");
        name.textContent = face.name || face.id || "無名の顔";

        const rarity = document.createElement("p");
        rarity.className = "lineup-rarity";
        rarity.textContent = face.rarity || "N";

        const probability = document.createElement("p");
        probability.className = "lineup-probability";
        probability.textContent = `実際の排出率 ${getEffectiveProbability(face).toFixed(2)}%`;
        if (face.boosted) {
            probability.textContent += `（設定 ${Number(face.probability).toFixed(2)}%・重み×${boostMultiplier}）`;
        }

        card.append(image, name, rarity, probability);
        appendFaceDetails(card, face);
        gachaFacesGrid.appendChild(card);
    }
}


function appendFaceDetails(container, face) {
    const description = String(
        face.description || face.additionalInfo || face.details || ""
    ).trim();

    if (description) {
        const details = document.createElement("p");
        details.className = "face-description";
        details.textContent = description;
        container.appendChild(details);
    }
}


function revealGachaFace(face) {
    if (!face) return;

    if (gachaFaceDisplay) {
        const image = document.createElement("img");
        image.src = face.imageUrl || "";
        image.alt = face.name || face.id || "顔";
        image.addEventListener("error", () => {
            gachaFaceDisplay.textContent = face.name || face.id || "顔";
        }, { once: true });
        gachaFaceDisplay.replaceChildren(image);
        gachaFaceDisplay.classList.remove("gachaReveal");
        requestAnimationFrame(() => gachaFaceDisplay.classList.add("gachaReveal"));
    }

    if (gachaRarityDisplay) {
        gachaRarityDisplay.textContent = face.rarity || "N";
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
                getFaceWeight(face);

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


function getFaceWeight(face) {
    const probability = Math.max(0, Number(face?.probability) || 0);
    return probability * (face?.boosted ? boostMultiplier : 1);
}


function getRarityRank(rarity) {
    return ["N", "R", "SR", "SSR", "UR"].indexOf(String(rarity || "N").toUpperCase());
}


function getGuaranteedFaces() {
    const rank = getRarityRank(guaranteeRarity);
    return gachaFaces.filter(face => getRarityRank(face.rarity) >= rank);
}


function isGuaranteedRarity(face) {
    return getRarityRank(face?.rarity) >= getRarityRank(guaranteeRarity);
}


function getEffectiveProbability(face) {
    const total = getProbabilityTotal();
    return total > 0 ? getFaceWeight(face) / total * 100 : 0;
}


// ==================================================
// 個別確率抽選
// ==================================================

function randomFace(candidates = gachaFaces) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;

    const total = candidates.reduce((sum, face) => sum + getFaceWeight(face), 0);
    if (total <= 0) {
        return candidates[Math.floor(Math.random() * candidates.length)] || null;
    }

    let random = Math.random() * total;
    for (const face of candidates) {
        random -= getFaceWeight(face);
        if (random < 0) return face;
    }

    return candidates[candidates.length - 1] || null;
}


// ==================================================
// 10連
// ==================================================

function randomTenFaces() {
    const results = Array.from({ length: 10 }, () => randomFace()).filter(Boolean);
    const qualifyingFaces = getGuaranteedFaces();

    if (
        results.length === 10 &&
        qualifyingFaces.length > 0 &&
        !results.some(isGuaranteedRarity)
    ) {
        const replaceIndex = Math.floor(Math.random() * results.length);
        results[replaceIndex] = randomFace(qualifyingFaces);
        results.guaranteed = true;
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


function getCoinRewardMessage(collectionUpdate) {
    if (!collectionUpdate) return "";

    const parts = [];
    if (collectionUpdate.coinsEarned > 0) {
        parts.push(
            `泥団子コイン +${collectionUpdate.coinsEarned}（${collectionUpdate.coinBalance}/${mudDangoCoinsRequired}）`
        );
    }

    if (collectionUpdate.coinRewards.length > 0) {
        const names = collectionUpdate.coinRewards.map(face => face.name || face.id);
        parts.push(`コイン交換でUR顔を獲得：${names.join("、")}`);
    }

    return parts.join(" / ");
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

            if (mudDangoCoinValue) mudDangoCoinValue.textContent = "0";

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

        if (mudDangoCoinValue) {
            mudDangoCoinValue.textContent =
                Math.max(0, Number(data.mudDangoCoins) || 0).toLocaleString();
        }

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

            ${getFaceDescriptionMarkup(face)}

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

                            ${getFaceDescriptionMarkup(face)}

                            ${extraText}

                        </div>

                    `;

                }
            )
            .join("");

}


function getFaceDescriptionMarkup(face) {
    const description = String(
        face?.description || face?.additionalInfo || face?.details || ""
    ).trim();

    return description
        ? `<p class="face-description">${escapeHtml(description)}</p>`
        : "";
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

        return { duplicateInfos: [], coinRewards: [], coinsEarned: 0, coinBalance: 0 };

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

        return { duplicateInfos: [], coinRewards: [], coinsEarned: 0, coinBalance: 0 };

    }


    const duplicateInfos = [];
    const coinRewards = [];
    let coinBalance = Math.max(0, Number(faceData.mudDangoCoins) || 0);
    let coinsEarned = 0;


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

                description:
                    face.description || "",

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

        const coinsFromDuplicate = duplicateCoinReward;
        coinBalance += coinsFromDuplicate;
        coinsEarned += coinsFromDuplicate;
        duplicateInfos[duplicateInfos.length - 1].coinsEarned = coinsFromDuplicate;

        const rewardFace = gachaFaces.find(item => item.id === mudDangoRewardFaceId);
        let rewardsGranted = 0;
        while (
            rewardFace &&
            mudDangoCoinsRequired > 0 &&
            coinBalance >= mudDangoCoinsRequired &&
            rewardsGranted < 20
        ) {
            coinBalance -= mudDangoCoinsRequired;
            rewardsGranted += 1;

            const ownedReward = faceData.faces.find(item => item.id === rewardFace.id);
            if (ownedReward) {
                const rewardSkill = applyDuplicateSkill(ownedReward);
                ownedReward.skill = rewardSkill.skill;
            } else {
                faceData.faces.push({
                    ...rewardFace,
                    obtainedAt: Date.now(),
                    skill: {
                        level: 1,
                        progress: 0,
                        totalKills: 0,
                        tickets: 0,
                        duplicateProgress: 0
                    }
                });
            }

            coinRewards.push(rewardFace);
        }

    }


    faceData.mudDangoCoins = coinBalance;

    await saveFaceData(
        uid,
        faceData
    );


    return { duplicateInfos, coinRewards, coinsEarned, coinBalance };

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

        let face = null;
        let guaranteedByPity = false;


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

                const pityCount = Math.max(
                    0,
                    Math.min(9, Math.floor(Number(data.gachaPityCount) || 0))
                );
                const qualifyingFaces = getGuaranteedFaces();
                guaranteedByPity = pityCount >= 9 && qualifyingFaces.length > 0;
                face = randomFace(
                    guaranteedByPity ? qualifyingFaces : gachaFaces
                );
                if (!face) throw new Error("抽選対象がありません。");
                const nextPityCount = isGuaranteedRarity(face)
                    ? 0
                    : Math.min(9, pityCount + 1);


                transaction.update(
                    userRef,
                    {

                        points:
                            points -
                            settings.singleCost,

                        gachaPityCount:
                            nextPityCount,

                        updatedAt:
                            serverTimestamp()

                    }
                );

            }
        );


        // ------------------------------
        // 所持顔保存
        // ------------------------------

        const collectionUpdate =
            await addFacesToCollection(
                user.uid,
                [face]
            );
        await loadCollection(user.uid);

        const duplicateInfo =
            collectionUpdate.duplicateInfos[0];


        // ------------------------------
        // 表示
        // ------------------------------

        renderSingleResult(
            face,
            duplicateInfo
        );
        revealGachaFace(face);


        let resultMessage = duplicateInfo?.leveledUp
            ? `${face.rarity}「${face.name}」が重複！ スキルLv${duplicateInfo.newLevel}！`
            : duplicateInfo
                ? `${face.rarity}「${face.name}」が重複！ スキル成長！`
                : `${face.rarity}「${face.name}」を獲得！`;
        if (guaranteedByPity) {
            resultMessage = `10回保証！ ${resultMessage}`;
        }
        const coinMessage = getCoinRewardMessage(collectionUpdate);
        showMessage([resultMessage, coinMessage].filter(Boolean).join(" ／ "));


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

                const pityCount = Math.max(
                    0,
                    Math.min(9, Math.floor(Number(data.gachaPityCount) || 0))
                );
                const nextPityCount = results.some(isGuaranteedRarity)
                    ? 0
                    : Math.min(9, pityCount + 10);


                transaction.update(
                    userRef,
                    {

                        points:
                            points -
                            settings.tenCost,

                        gachaPityCount:
                            nextPityCount,

                        updatedAt:
                            serverTimestamp()

                    }
                );

            }
        );


        // ------------------------------
        // 所持顔保存
        // ------------------------------

        const collectionUpdate =
            await addFacesToCollection(
                user.uid,
                results
            );
        await loadCollection(user.uid);
        const duplicateInfos = collectionUpdate.duplicateInfos;


        // ------------------------------
        // 結果表示
        // ------------------------------

        renderTenResults(
            results,
            duplicateInfos
        );
        revealGachaFace(results[results.length - 1]);


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


        let resultMessage = levelUpCount > 0
            ? `10連完了！ スキルLvアップ ${levelUpCount}件！`
            : duplicateCount > 0
                ? `10連完了！ 重複 ${duplicateCount}件がスキル成長！`
                : "10連ガチャ完了！";
        if (results.guaranteed) {
            resultMessage += ` ${guaranteeRarity}以上を1つ保証しました。`;
        }
        const coinMessage = getCoinRewardMessage(collectionUpdate);
        showMessage([resultMessage, coinMessage].filter(Boolean).join(" ／ "));


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

        void (async () => {
            await loadSettings();
            await Promise.all([
                updatePointDisplay(user.uid),
                loadCollection(user.uid)
            ]);
        })();
    }
);
