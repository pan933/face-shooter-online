import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
    discoverFaces,
    getFaceRarity,
    RARITIES
} from "./face-system.js";


const DEFAULTS = {
    N: 60,
    R: 25,
    SR: 10,
    SSR: 4,
    UR: 1
};


const singleButton =
    document.getElementById("singleButton");

const tenButton =
    document.getElementById("tenButton");


let ready = false;
let enabled = true;


function setButtonsDisabled(disabled) {

    if (singleButton) {
        singleButton.disabled = disabled;
    }

    if (tenButton) {
        tenButton.disabled = disabled;
    }

}


// 読み込み中はガチャを押せない
setButtonsDisabled(true);


function normalize(values) {

    const result = {};

    let total = 0;

    for (const key of Object.keys(DEFAULTS)) {

        const value =
            Number(values?.[key]);

        result[key] =
            Number.isFinite(value) && value >= 0
                ? value
                : DEFAULTS[key];

        total += result[key];
    }


    if (total <= 0) {

        return {
            ...DEFAULTS
        };

    }


    for (const key of Object.keys(result)) {

        result[key] =
            result[key] / total * 100;

    }


    return result;

}


async function applyGachaSettings() {

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


        const probabilities =
            normalize(
                data.gachaProbabilities
            );


        enabled =
            data.gachaEnabled !== false;


        /*
         * 現在存在する顔を調べる
         *
         * 同じレアリティの顔は
         * そのレアリティ内で均等抽選。
         */
        const faces =
            await discoverFaces();


        const counts = {
            N: 0,
            R: 0,
            SR: 0,
            SSR: 0,
            UR: 0
        };


        for (const face of faces) {

            const number =
                Number(
                    String(face.id)
                        .replace("face_", "")
                );


            const rarity =
                getFaceRarity(number);


            if (
                counts[rarity] !== undefined
            ) {

                counts[rarity]++;

            }

        }


        /*
         * gacha.jsはRARITIESのweightを使って
         * 抽選しているので、ここを書き換える。
         *
         * 同じレアリティの顔が複数ある場合は
         * 確率を人数で割る。
         */
        for (
            const rarity
            of Object.keys(RARITIES)
        ) {

            const count =
                counts[rarity] || 0;


            RARITIES[rarity].weight =
                count > 0
                    ? probabilities[rarity] / count
                    : 0;

        }


        ready = true;


        setButtonsDisabled(
            !enabled
        );


        window.dispatchEvent(
            new CustomEvent(
                "gachaProbabilityReady",
                {
                    detail: {
                        probabilities,
                        counts,
                        enabled
                    }
                }
            )
        );


        console.log(
            "[GACHA] 確率設定:",
            probabilities
        );

        console.log(
            "[GACHA] 対象数:",
            counts
        );


    } catch (error) {

        console.warn(
            "[GACHA] 確率設定の読み込み失敗。既定値を使用します。",
            error
        );


        for (
            const rarity
            of Object.keys(RARITIES)
        ) {

            RARITIES[rarity].weight =
                DEFAULTS[rarity];

        }


        ready = true;

        setButtonsDisabled(
            !enabled
        );

    }

}


onAuthStateChanged(
    auth,
    user => {

        if (!user) {

            setButtonsDisabled(true);

            return;

        }


        void applyGachaSettings();

    }
);


// ガチャ無効時の表示
window.addEventListener(
    "gachaProbabilityReady",
    event => {

        const detail =
            event.detail || {};


        const message =
            document.getElementById(
                "gachaMessage"
            );


        if (
            !detail.enabled &&
            message
        ) {

            message.textContent =
                "現在、顔ガチャは管理者によって無効化されています。";

        }

    }
);


// 設定読み込み前のクリックを防止
document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest?.(
                "#singleButton, #tenButton"
            );


        if (!button) {
            return;
        }


        if (!ready || !enabled) {

            event.preventDefault();

            event.stopImmediatePropagation();

        }

    },
    true
);
