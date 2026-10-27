import { auth, db } from "./firebase-config.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";


// ==================================================
// 初期顔
// ==================================================

export const INITIAL_FACE = "face2";


// ==================================================
// Cloudinary
// ==================================================

export const CLOUDINARY_FACE_URLS = {

    face_1:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_1.jpg",

    face_2:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_2.jpg",

    face_3:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_3.jpg",

    face_4:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_4.jpg",

    face2:
        "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png"

};


// ==================================================
// レア度
// ==================================================

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


// ==================================================
// レア度取得
// ==================================================

export function getFaceRarity(number) {

    number =
        Number(number);


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


// ==================================================
// 管理画面のガチャ顔を取得
// ==================================================

export async function loadGachaFaces() {

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
            !snapshot.exists()
        ) {

            return [];

        }


        const data =
            snapshot.data();


        if (
            !Array.isArray(
                data.gachaFaces
            )
        ) {

            return [];

        }


        return data.gachaFaces
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
                        RARITIES[
                            face.rarity
                        ]
                            ? face.rarity
                            : "N",

                    probability:
                        Number(
                            face.probability
                        ) || 0

                })
            )
            .filter(
                face =>
                    face.id &&
                    face.imageUrl
            );

    } catch (error) {

        console.error(
            "[FACE] ガチャ顔読み込み失敗:",
            error
        );


        return [];

    }

}


// ==================================================
// 顔データを発見
// ==================================================

export async function discoverFaces() {

    /*
     * まず管理画面で登録された顔を使用
     */
    const managedFaces =
        await loadGachaFaces();


    if (
        managedFaces.length > 0
    ) {

        return managedFaces;

    }


    /*
     * Firestoreにまだガチャ設定がない場合は
     * 現在のCloudinary画像を使用する。
     *
     * 初回移行用。
     */
    const fallbackIds = [
        "face_1",
        "face_2",
        "face_3",
        "face_4"
    ];


    const faces = [];


    for (
        const id
        of fallbackIds
    ) {

        const imageUrl =
            CLOUDINARY_FACE_URLS[id];


        if (!imageUrl) {
            continue;
        }


        const number =
            Number(
                id.replace(
                    "face_",
                    ""
                )
            );


        faces.push({

            id,

            name:
                id,

            imageUrl,

            rarity:
                getFaceRarity(
                    number
                ),

            probability:
                0

        });

    }


    /*
     * 初期顔も追加
     */
    faces.unshift({

        id:
            INITIAL_FACE,

        name:
            "初期顔",

        imageUrl:
            CLOUDINARY_FACE_URLS[
                INITIAL_FACE
            ],

        rarity:
            "N",

        probability:
            0

    });


    return faces;

}


// ==================================================
// 顔を1つ作る
// ==================================================

export function buildFace(
    number
) {

    const id =
        `face_${number}`;


    const imageUrl =
        CLOUDINARY_FACE_URLS[id];


    if (!imageUrl) {

        return null;

    }


    return {

        id,

        name:
            id,

        imageUrl,

        rarity:
            getFaceRarity(
                number
            ),

        probability:
            0

    };

}


// ==================================================
// ユーザーの顔データ
// ==================================================

export async function loadFaceData(
    uid
) {

    if (!uid) {
        return null;
    }


    try {

        const ref =
            doc(
                db,
                "users",
                uid
            );


        const snapshot =
            await getDoc(ref);


        if (
            !snapshot.exists()
        ) {

            return {

                faces: [],

                selectedFace:
                    INITIAL_FACE

            };

        }


        const data =
            snapshot.data();


        return {

            ...data,

            faces:
                Array.isArray(
                    data.faces
                )
                    ? data.faces
                    : [],

            selectedFace:
                data.selectedFace ||
                INITIAL_FACE

        };

    } catch (error) {

        console.error(
            "[FACE] 顔データ読み込み失敗:",
            error
        );


        return {

            faces: [],

            selectedFace:
                INITIAL_FACE

        };

    }

}


// ==================================================
// ユーザーの顔データ保存
// ==================================================

export async function saveFaceData(
    uid,
    data
) {

    if (!uid) {
        return;
    }


    const ref =
        doc(
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


// ==================================================
// バフ表示
// ==================================================

export function formatBuffs(
    buffs
) {

    if (
        !buffs ||
        typeof buffs !== "object"
    ) {

        return "";

    }


    return Object.entries(
        buffs
    )
        .map(
            ([key, value]) =>
                `${key}: ${value}`
        )
        .join(" / ");

}


// ==================================================
// 画像が存在するか確認
// ==================================================

export function imageExists(
    url
) {

    return new Promise(
        resolve => {

            if (!url) {

                resolve(false);

                return;

            }


            const image =
                new Image();


            image.onload =
                () => resolve(true);


            image.onerror =
                () => resolve(false);


            image.src =
                url;

        }
    );

}


// ==================================================
// 管理画面設定を監視
// ==================================================

export function watchGachaFaces(
    callback
) {

    let lastJson = "";


    async function check() {

        try {

            const faces =
                await loadGachaFaces();


            const json =
                JSON.stringify(
                    faces
                );


            if (
                json !== lastJson
            ) {

                lastJson =
                    json;


                callback(
                    faces
                );

            }

        } catch (error) {

            console.error(
                "[FACE] ガチャ設定監視エラー:",
                error
            );

        }

    }


    void check();


    const timer =
        setInterval(
            check,
            5000
        );


    return () => {

        clearInterval(
            timer
        );

    };

}
