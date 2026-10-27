// ============================================================
// 顔面シューティング
// 顔データシステム
// ============================================================

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { db } from "./firebase-config.js";


// ============================================================
// 初期顔
// ============================================================

export const INITIAL_FACE = "face2";


// ============================================================
// Cloudinary 顔画像
// ============================================================

export const CLOUDINARY_FACE_URLS = {

    face2:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png",

    face_1:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_1.jpg",

    face_2:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_2.jpg",

    face_3:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_3.jpg",

    face_4:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_4.jpg"
};


// ============================================================
// レアリティ
// ============================================================

export const RARITIES = {

    N: {
        name: "N",
        weight: 93
    },

    R: {
        name: "R",
        weight: 0
    },

    SR: {
        name: "SR",
        weight: 4
    },

    SSR: {
        name: "SSR",
        weight: 2
    },

    UR: {
        name: "UR",
        weight: 1
    }
};


// ============================================================
// 顔のレアリティ
// ============================================================

export function getFaceRarity(number) {

    if (number === "face2") {
        return "N";
    }

    if (number === "face_4") {
        return "SR";
    }

    if (
        number === "face_1" ||
        number === "face_2" ||
        number === "face_3"
    ) {
        return "UR";
    }

    return "N";
}


// ============================================================
// スキルデータ
// ============================================================
//
// 各顔に最初からスキルLv1を付ける。
// 既存ユーザーのデータにも後から自動追加される。
// ============================================================

export function createDefaultSkillData() {

    return {
        level: 1,
        progress: 0,
        totalKills: 0,
        tickets: 0
    };
}


// ============================================================
// 顔データ作成
// ============================================================

export function buildFace(number) {

    return {

        id: number,

        name:
            number === "face2"
                ? "初期顔"
                : `顔 ${number.replace("face_", "")}`,

        imageUrl:
            CLOUDINARY_FACE_URLS[number] ||
            CLOUDINARY_FACE_URLS.face2,

        rarity:
            getFaceRarity(number),

        probability: 0,

        skill:
            createDefaultSkillData()
    };
}


// ============================================================
// ガチャ顔データ取得
// ============================================================

export async function loadGachaFaces() {

    try {

        const ref = doc(
            db,
            "adminSettings",
            "gameplay"
        );

        const snap = await getDoc(ref);

        if (!snap.exists()) {
            return [];
        }

        const data = snap.data();

        if (!Array.isArray(data.gachaFaces)) {
            return [];
        }

        return data.gachaFaces;

    } catch (error) {

        console.error(
            "[FaceSystem] ガチャ顔読み込み失敗:",
            error
        );

        return [];
    }
}


// ============================================================
// 顔一覧取得
// ============================================================

export async function discoverFaces() {

    const managedFaces = await loadGachaFaces();

    if (managedFaces.length > 0) {

        return managedFaces.map(face => {

            return {
                ...face,

                skill:
                    face.skill ||
                    createDefaultSkillData()
            };
        });
    }

    // 管理画面に設定がない場合の初期顔
    return [
        buildFace("face2"),
        buildFace("face_1"),
        buildFace("face_2"),
        buildFace("face_3"),
        buildFace("face_4")
    ];
}


// ============================================================
// ユーザーの顔データ読み込み
// ============================================================

export async function loadFaceData(uid) {

    if (!uid) {

        return {

            faces: [],

            selectedFace: INITIAL_FACE,

            skillTickets: 0
        };
    }

    try {

        const ref = doc(
            db,
            "users",
            uid
        );

        const snap = await getDoc(ref);

        if (!snap.exists()) {

            return {

                faces: [],

                selectedFace: INITIAL_FACE,

                skillTickets: 0
            };
        }

        const data = snap.data();

        const faces = Array.isArray(data.faces)
            ? data.faces
            : [];

        // ----------------------------------------------------
        // 古い顔データにもスキル情報を追加
        // ----------------------------------------------------

        const normalizedFaces = faces.map(face => {

            return {

                ...face,

                skill:
                    normalizeSkillData(
                        face.skill
                    )
            };
        });

        return {

            ...data,

            faces: normalizedFaces,

            selectedFace:
                data.selectedFace ||
                INITIAL_FACE,

            skillTickets:
                Number(data.skillTickets) || 0
        };

    } catch (error) {

        console.error(
            "[FaceSystem] 顔データ読み込み失敗:",
            error
        );

        return {

            faces: [],

            selectedFace: INITIAL_FACE,

            skillTickets: 0
        };
    }
}


// ============================================================
// スキルデータ補正
// ============================================================

export function normalizeSkillData(skill) {

    if (!skill) {
        return createDefaultSkillData();
    }

    return {

        level:
            Math.max(
                1,
                Math.min(
                    6,
                    Number(skill.level) || 1
                )
            ),

        progress:
            Math.max(
                0,
                Number(skill.progress) || 0
            ),

        totalKills:
            Math.max(
                0,
                Number(skill.totalKills) || 0
            ),

        tickets:
            Math.max(
                0,
                Number(skill.tickets) || 0
            )
    };
}


// ============================================================
// 顔データ保存
// ============================================================

export async function saveFaceData(uid, data) {

    if (!uid) {
        throw new Error(
            "UIDがありません"
        );
    }

    const ref = doc(
        db,
        "users",
        uid
    );

    await setDoc(
        ref,
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


// ============================================================
// スキル撃破数を追加
// ============================================================

export function addFaceSkillKill(
    face,
    amount = 1
) {

    if (!face) {
        return face;
    }

    const skill =
        normalizeSkillData(face.skill);

    skill.progress += Math.max(
        0,
        Number(amount) || 0
    );

    skill.totalKills += Math.max(
        0,
        Number(amount) || 0
    );

    return {

        ...face,

        skill
    };
}


// ============================================================
// スキルチケット追加
// ============================================================

export function addSkillTickets(
    data,
    amount = 1
) {

    return {

        ...data,

        skillTickets:
            Math.max(
                0,
                Number(data?.skillTickets || 0) +
                Number(amount || 0)
            )
    };
}


// ============================================================
// バフ表示
// ============================================================

export function formatBuffs(buffs) {

    if (!buffs) {
        return "";
    }

    if (Array.isArray(buffs)) {
        return buffs.join(" / ");
    }

    return String(buffs);
}


// ============================================================
// 画像存在確認
// ============================================================

export async function imageExists(url) {

    if (!url) {
        return false;
    }

    try {

        const response =
            await fetch(
                url,
                {
                    method: "HEAD"
                }
            );

        return response.ok;

    } catch {

        return false;
    }
}


// ============================================================
// ガチャ顔変更監視
// ============================================================

export function watchGachaFaces(callback) {

    let stopped = false;

    const check = async () => {

        if (stopped) {
            return;
        }

        try {

            const faces =
                await loadGachaFaces();

            callback(faces);

        } catch (error) {

            console.error(
                "[FaceSystem] ガチャ顔監視エラー:",
                error
            );
        }
    };

    check();

    const timer =
        setInterval(
            check,
            5000
        );

    return () => {

        stopped = true;

        clearInterval(timer);
    };
}
