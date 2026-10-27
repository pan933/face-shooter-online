import { auth, db } from "./firebase-config.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";


/* =========================================================
   FACE SYSTEM
========================================================= */

export const FACE_BASE_PATH = "https://res.cloudinary.com/i0ptpjzc/image/upload/";

export const CLOUDINARY_FACE_URLS = {
    face_1: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_1.jpg",
    face_2: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_2.jpg",
    face_3: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_3.jpg",
    face_4: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_4.jpg",
    face2: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png"
};

export const INITIAL_FACE = "face2";


/* =========================================================
   30種類のバフ
========================================================= */

export const FACE_BUFFS = {

    bulletSpeed: {
        name: "弾速UP",
        unit: "%",
        max: 30
    },

    bulletSize: {
        name: "弾サイズUP",
        unit: "%",
        max: 30
    },

    bulletDamage: {
        name: "弾威力UP",
        unit: "%",
        max: 50
    },

    fireRate: {
        name: "連射速度UP",
        unit: "%",
        max: 30
    },

    pierce: {
        name: "貫通性能UP",
        unit: "",
        max: 3
    },

    criticalRate: {
        name: "クリティカル率UP",
        unit: "%",
        max: 20
    },

    criticalDamage: {
        name: "クリティカルダメージUP",
        unit: "%",
        max: 50
    },

    explosionRadius: {
        name: "爆発範囲UP",
        unit: "%",
        max: 40
    },

    bossDamage: {
        name: "ボスダメージUP",
        unit: "%",
        max: 50
    },

    enemyDamage: {
        name: "雑魚ダメージUP",
        unit: "%",
        max: 40
    },

    maxHp: {
        name: "最大HP+",
        unit: "",
        max: 3
    },

    maxHpAlt: {
        name: "追加HP+",
        unit: "",
        max: 2
    },

    damageReduction: {
        name: "ダメージ軽減",
        unit: "%",
        max: 20
    },

    invincibleTime: {
        name: "無敵時間延長",
        unit: "%",
        max: 40
    },

    bossContactGuard: {
        name: "ボス接触軽減",
        unit: "%",
        max: 30
    },

    bulletGuard: {
        name: "敵弾ダメージ軽減",
        unit: "%",
        max: 30
    },

    healPower: {
        name: "回復効果UP",
        unit: "%",
        max: 50
    },

    shieldTime: {
        name: "シールド時間延長",
        unit: "%",
        max: 50
    },

    moveSpeed: {
        name: "移動速度UP",
        unit: "%",
        max: 40
    },

    verticalSpeed: {
        name: "上下移動速度UP",
        unit: "%",
        max: 40
    },

    acceleration: {
        name: "加速性能UP",
        unit: "%",
        max: 30
    },

    deceleration: {
        name: "減速性能UP",
        unit: "%",
        max: 30
    },

    hitbox: {
        name: "当たり判定縮小",
        unit: "%",
        max: 25
    },

    itemDrop: {
        name: "アイテム出現率UP",
        unit: "%",
        max: 30
    },

    healDrop: {
        name: "回復アイテム率UP",
        unit: "%",
        max: 30
    },

    bombCooldown: {
        name: "爆弾CT短縮",
        unit: "%",
        max: 40
    },

    bombDamage: {
        name: "爆弾威力UP",
        unit: "%",
        max: 50
    },

    gimmickSpeed: {
        name: "ギミック解除速度UP",
        unit: "%",
        max: 50
    },

    scoreMultiplier: {
        name: "スコア倍率UP",
        unit: "%",
        max: 50
    },

    pointBonus: {
        name: "獲得ポイントUP",
        unit: "%",
        max: 30
    }

};


/* =========================================================
   レアリティ
========================================================= */

export const RARITIES = {
    N: {
        name: "N",
        color: "#9ca3af",
        weight: 600
    },

    R: {
        name: "R",
        color: "#60a5fa",
        weight: 250
    },

    SR: {
        name: "SR",
        color: "#c084fc",
        weight: 100
    },

    SSR: {
        name: "SSR",
        color: "#facc15",
        weight: 40
    },

    UR: {
        name: "UR",
        color: "#f97316",
        weight: 10
    }
};


/* =========================================================
   顔番号 → レアリティ
========================================================= */

export function getFaceRarity(number) {

    if (number <= 3) {
        return "UR";
    }

    if (number <= 10) {
        return "SSR";
    }

    if (number <= 25) {
        return "SR";
    }

    if (number <= 50) {
        return "R";
    }

    return "N";
}


/* =========================================================
   顔のバフ生成
========================================================= */

function seededRandom(seed) {

    let x = Math.sin(seed) * 10000;

    return x - Math.floor(x);
}


export function generateFaceBuffs(faceNumber) {

    const rarity = getFaceRarity(faceNumber);

    const keys = Object.keys(FACE_BUFFS);

    const result = {};

    let count = 1;

    if (rarity === "R") {
        count = 2;
    }

    if (rarity === "SR") {
        count = 3;
    }

    if (rarity === "SSR") {
        count = 4;
    }

    if (rarity === "UR") {
        count = 5;
    }

    const used = new Set();

    for (let i = 0; i < count; i++) {

        let index =
            Math.floor(
                seededRandom(faceNumber * 100 + i * 17)
                * keys.length
            );

        let key = keys[index];

        while (used.has(key)) {

            index++;

            if (index >= keys.length) {
                index = 0;
            }

            key = keys[index];
        }

        used.add(key);

        const definition = FACE_BUFFS[key];

        const multiplier =
            rarity === "N" ? 0.35 :
            rarity === "R" ? 0.55 :
            rarity === "SR" ? 0.75 :
            rarity === "SSR" ? 0.9 :
            1.0;

        let value =
            Math.max(
                1,
                Math.round(definition.max * multiplier)
            );

        result[key] = value;
    }

    return result;
}


/* =========================================================
   顔データ生成
========================================================= */

export function buildFace(number) {

    const id = `face_${number}`;

    const rarity = getFaceRarity(number);

    return {

        id,

        name: `FACE ${number}`,

        image:
            CLOUDINARY_FACE_URLS[id] || "",

        rarity,

        buffs:
            generateFaceBuffs(number)

    };
}


/* =========================================================
   顔画像の自動検出
========================================================= */

export async function discoverFaces() {

    const faces = [];

    let missCount = 0;

    for (let i = 1; i <= 200; i++) {

        const path =
            `${FACE_BASE_PATH}face_${i}.png`;

        const exists =
            await imageExists(path);

        if (exists) {

            faces.push(
                buildFace(i)
            );

            missCount = 0;

        } else {

            missCount++;

            /*
             * 5個連続で存在しなかったら終了
             */
            if (missCount >= 5) {
                break;
            }
        }
    }

    return faces;
}


function imageExists(src) {

    return new Promise(resolve => {

        const img = new Image();

        img.onload = () => resolve(true);

        img.onerror = () => resolve(false);

        img.src = src;

    });

}


/* =========================================================
   ユーザーデータ
========================================================= */

export function getFaceDocRef(uid) {

    return doc(
        db,
        "faceGacha",
        uid
    );

}


export function createDefaultFaceData() {

    return {

        points: 0,

        selectedFace: INITIAL_FACE,

        ownedFaces: [
            INITIAL_FACE
        ],

        updatedAt: serverTimestamp()

    };

}


/* =========================================================
   データ読み込み
========================================================= */

export async function loadFaceData() {

    if (!auth.currentUser) {

        throw new Error(
            "ログインが必要です。"
        );

    }

    const uid =
        auth.currentUser.uid;

    const ref =
        getFaceDocRef(uid);

    const snapshot =
        await getDoc(ref);

    if (!snapshot.exists()) {

        const data =
            createDefaultFaceData();

        await setDoc(
            ref,
            data
        );

        return {
            ...data,
            points: 0,
            updatedAt: null
        };

    }

    const data =
        snapshot.data();

    if (!Array.isArray(data.ownedFaces)) {
        data.ownedFaces = [];
    }

    if (!data.ownedFaces.includes(INITIAL_FACE)) {

        data.ownedFaces.push(
            INITIAL_FACE
        );

    }

    if (!data.selectedFace) {

        data.selectedFace =
            INITIAL_FACE;

    }

    if (typeof data.points !== "number") {

        data.points = 0;

    }

    return data;

}


/* =========================================================
   データ保存
========================================================= */

export async function saveFaceData(data) {

    if (!auth.currentUser) {

        throw new Error(
            "ログインが必要です。"
        );

    }

    const uid =
        auth.currentUser.uid;

    await setDoc(

        getFaceDocRef(uid),

        {

            ...data,

            updatedAt:
                serverTimestamp()

        },

        {
            merge: true
        }

    );

}


/* =========================================================
   ポイント追加
========================================================= */

export async function addMatchPoints(points) {

    if (!auth.currentUser) {
        return;
    }

    points =
        Math.max(
            0,
            Math.floor(Number(points) || 0)
        );

    if (points <= 0) {
        return;
    }

    const data =
        await loadFaceData();

    data.points =
        Math.max(
            0,
            Number(data.points || 0)
        ) + points;

    await saveFaceData(data);

    return data.points;

}


/* =========================================================
   ポイント取得
========================================================= */

export async function getFacePoints() {

    const data =
        await loadFaceData();

    return Number(
        data.points || 0
    );

}


/* =========================================================
   所持確認
========================================================= */

export function ownsFace(
    data,
    faceId
) {

    return Array.isArray(data.ownedFaces)
        && data.ownedFaces.includes(faceId);

}


/* =========================================================
   顔選択
========================================================= */

export async function selectFace(faceId) {

    const data =
        await loadFaceData();

    if (!ownsFace(data, faceId)) {

        throw new Error(
            "この顔はまだ持っていません。"
        );

    }

    data.selectedFace =
        faceId;

    await saveFaceData(data);

    return data;

}


/* =========================================================
   バフ表示
========================================================= */

export function formatBuffs(
    buffs
) {

    if (!buffs) {
        return [];
    }

    return Object.entries(buffs)
        .map(([key, value]) => {

            const info =
                FACE_BUFFS[key];

            if (!info) {
                return null;
            }

            return {

                key,

                name:
                    info.name,

                value,

                text:
                    `${info.name} +${value}${info.unit}`

            };

        })
        .filter(Boolean);

}
