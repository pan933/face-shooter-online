import {
    auth,
    db
} from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
    discoverFaces,
    buildFace,
    loadFaceData,
    saveFaceData,
    formatBuffs,
    RARITIES,
    getFaceRarity,
    INITIAL_FACE
} from "./face-system.js";


/* =========================================================
   DOM
========================================================= */

const loginRequired =
    document.getElementById("loginRequired");

const app =
    document.getElementById("app");

const pointValue =
    document.getElementById("pointValue");

const singleButton =
    document.getElementById("singleButton");

const tenButton =
    document.getElementById("tenButton");

const singleCost =
    document.getElementById("singleCost");

const tenCost =
    document.getElementById("tenCost");

const gachaMessage =
    document.getElementById("gachaMessage");

const gachaFace =
    document.getElementById("gachaFace");

const gachaRarity =
    document.getElementById("gachaRarity");

const resultGrid =
    document.getElementById("resultGrid");

const collectionGrid =
    document.getElementById("collectionGrid");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let faceData = null;

let faces = [];

let settings = {

    singleCost: 1000,

    tenCost: 9000

};

let busy = false;


/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(
    auth,
    async user => {

        currentUser = user;

        if (!user) {

            loginRequired.style.display =
                "flex";

            app.style.display =
                "none";

            return;

        }

        loginRequired.style.display =
            "none";

        app.style.display =
            "block";

        await initialize();

    }
);


/* =========================================================
   初期化
========================================================= */

async function initialize() {

    try {

        showMessage(
            "読み込み中..."
        );

        faces =
            await discoverFaces();

        /*
         * face2.png は初期顔。
         * face_1.pngなどとは別枠。
         */
        faces.unshift({

            id: INITIAL_FACE,

            name: "初期FACE",

            image:
                "./images/faces/face2.png",

            rarity: "N",

            buffs: {}

        });

        faceData =
            await loadFaceData();

        await loadSettings();

        updateUI();

        renderCollection();

        showMessage("");

    } catch (error) {

        console.error(error);

        showMessage(
            "読み込みに失敗しました。"
        );

    }

}


/* =========================================================
   設定
========================================================= */

async function loadSettings() {

    try {

        const ref =
            doc(
                db,
                "gameSettings",
                "faceGacha"
            );

        const snapshot =
            await getDoc(ref);

        if (!snapshot.exists()) {
            return;
        }

        const data =
            snapshot.data();

        settings.singleCost =
            Math.max(
                1,
                Number(
                    data.singleCost
                ) || 1000
            );

        settings.tenCost =
            Math.max(
                1,
                Number(
                    data.tenCost
                ) || 9000
            );

    } catch (error) {

        console.warn(
            "ガチャ設定の読み込みに失敗",
            error
        );

    }

}


/* =========================================================
   UI
========================================================= */

function updateUI() {

    if (!faceData) {
        return;
    }

    pointValue.textContent =
        Number(
            faceData.points || 0
        ).toLocaleString();

    singleCost.textContent =
        `${settings.singleCost.toLocaleString()} P`;

    tenCost.textContent =
        `${settings.tenCost.toLocaleString()} P`;

    singleButton.disabled =
        busy ||
        faceData.points <
        settings.singleCost;

    tenButton.disabled =
        busy ||
        faceData.points <
        settings.tenCost;

}


/* =========================================================
   メッセージ
========================================================= */

function showMessage(text) {

    gachaMessage.textContent =
        text;

}


/* =========================================================
   ガチャ抽選
========================================================= */

function randomFace() {

    const pool =
        faces.filter(
            face => face.id !== INITIAL_FACE
        );

    if (!pool.length) {

        return null;

    }

    let total =
        pool.reduce(
            (sum, face) => {

                return sum +
                    RARITIES[
                        face.rarity
                    ].weight;

            },
            0
        );

    let random =
        Math.random() *
        total;

    for (const face of pool) {

        random -=
            RARITIES[
                face.rarity
            ].weight;

        if (random <= 0) {

            return face;

        }

    }

    return pool[
        pool.length - 1
    ];

}


/* =========================================================
   ポイント消費 + 結果追加
========================================================= */

async function performPull(count) {

    if (busy) {
        return;
    }

    const cost =
        count === 10
            ? settings.tenCost
            : settings.singleCost;

    if (
        Number(faceData.points || 0)
        < cost
    ) {

        showMessage(
            "ポイントが足りません。"
        );

        return;

    }

    busy = true;

    updateUI();

    try {

        /*
         * Firestore transactionでポイント消費。
         *
         * 同時に別端末からガチャしても
         * ポイントが二重に使われにくくする。
         */
        const ref =
            doc(
                db,
                "faceGacha",
                currentUser.uid
            );

        let results = [];

        await runTransaction(
            db,
            async transaction => {

                const snapshot =
                    await transaction.get(ref);

                let data =
                    snapshot.exists()
                        ? snapshot.data()
                        : {};

                let points =
                    Number(
                        data.points || 0
                    );

                if (points < cost) {

                    throw new Error(
                        "ポイントが足りません。"
                    );

                }

                points -= cost;

                results =
                    Array.from(
                        { length: count },
                        () => randomFace()
                    ).filter(Boolean);

                const owned =
                    Array.isArray(
                        data.ownedFaces
                    )
                        ? [
                            ...data.ownedFaces
                        ]
                        : [INITIAL_FACE];

                for (
                    const face
                    of results
                ) {

                    if (
                        !owned.includes(
                            face.id
                        )
                    ) {

                        owned.push(
                            face.id
                        );

                    }

                }

                transaction.set(

                    ref,

                    {

                        points,

                        ownedFaces:
                            owned,

                        selectedFace:
                            data.selectedFace
                            || INITIAL_FACE,

                        updatedAt:
                            serverTimestamp()

                    },

                    {
                        merge: true
                    }

                );

            }
        );


        /*
         * ローカルデータを更新
         */
        faceData.points -= cost;

        for (
            const face
            of results
        ) {

            if (
                !faceData.ownedFaces.includes(
                    face.id
                )
            ) {

                faceData.ownedFaces.push(
                    face.id
                );

            }

        }


        await showResults(
            results
        );

        renderCollection();

        updateUI();

    } catch (error) {

        console.error(error);

        showMessage(
            error.message ||
            "ガチャに失敗しました。"
        );

        updateUI();

    } finally {

        busy = false;

        updateUI();

    }

}


/* =========================================================
   結果表示
========================================================= */

async function showResults(results) {

    resultGrid.innerHTML = "";

    if (!results.length) {

        showMessage(
            "ガチャ対象の顔がありません。"
        );

        return;

    }

    if (results.length === 1) {

        await playSingleAnimation(
            results[0]
        );

    } else {

        gachaFace.innerHTML = "?";

        gachaRarity.textContent =
            "10 PULL";

        showMessage(
            "10連結果！"
        );

        for (
            const face
            of results
        ) {

            addResultCard(face);

            await delay(120);

        }

    }

}


/* =========================================================
   1回演出
========================================================= */

async function playSingleAnimation(face) {

    gachaFace.classList.remove(
        "gachaReveal"
    );

    gachaFace.classList.add(
        "gachaSpin"
    );

    gachaFace.innerHTML = "?";

    gachaRarity.textContent =
        "DRAW...";

    await delay(1200);

    gachaFace.classList.remove(
        "gachaSpin"
    );

    gachaFace.innerHTML = "";

    const img =
        document.createElement("img");

    img.src =
        face.image;

    gachaFace.appendChild(
        img
    );

    gachaRarity.textContent =
        face.rarity;

    gachaRarity.style.color =
        RARITIES[
            face.rarity
        ].color;

    gachaFace.style.borderColor =
        RARITIES[
            face.rarity
        ].color;

    gachaFace.classList.add(
        "gachaReveal"
    );

    showMessage(
        `${face.name} を獲得！`
    );

    addResultCard(face);

}


/* =========================================================
   結果カード
========================================================= */

function addResultCard(face) {

    const card =
        document.createElement("div");

    card.className =
        "resultCard";

    card.style.borderColor =
        RARITIES[
            face.rarity
        ].color;

    const image =
        document.createElement("div");

    image.className =
        "faceImage";

    const img =
        document.createElement("img");

    img.src =
        face.image;

    image.appendChild(
        img
    );


    const name =
        document.createElement("div");

    name.className =
        "faceName";

    name.textContent =
        face.name;


    const rarity =
        document.createElement("div");

    rarity.className =
        "rarity";

    rarity.textContent =
        face.rarity;

    rarity.style.color =
        RARITIES[
            face.rarity
        ].color;


    card.append(
        image,
        name,
        rarity
    );

    resultGrid.appendChild(
        card
    );

}


/* =========================================================
   コレクション
========================================================= */

function renderCollection() {

    collectionGrid.innerHTML = "";

    for (
        const face
        of faces
    ) {

        const owned =
            faceData.ownedFaces
                .includes(face.id);

        const selected =
            faceData.selectedFace
            === face.id;

        if (!owned) {
            continue;
        }

        const card =
            document.createElement("div");

        card.className =
            "faceCard";

        if (selected) {

            card.classList.add(
                "selected"
            );

        }

        card.style.borderColor =
            RARITIES[
                face.rarity
            ].color;


        const badge =
            document.createElement("div");

        badge.className =
            "ownedBadge";

        badge.textContent =
            selected
                ? "使用中"
                : "所持";


        const image =
            document.createElement("div");

        image.className =
            "faceImage";

        const img =
            document.createElement("img");

        img.src =
            face.image;

        image.appendChild(
            img
        );


        const name =
            document.createElement("div");

        name.className =
            "faceName";

        name.textContent =
            face.name;


        const rarity =
            document.createElement("div");

        rarity.className =
            "rarity";

        rarity.textContent =
            face.rarity;

        rarity.style.color =
            RARITIES[
                face.rarity
            ].color;


        card.append(
            badge,
            image,
            name,
            rarity
        );


        card.addEventListener(
            "click",
            async () => {

                try {

                    faceData.selectedFace =
                        face.id;

                    await saveFaceData(
                        faceData
                    );

                    renderCollection();

                    showMessage(
                        `${face.name} を使用する顔に設定しました。`
                    );

                } catch (error) {

                    console.error(error);

                    showMessage(
                        "顔の変更に失敗しました。"
                    );

                }

            }
        );


        collectionGrid.appendChild(
            card
        );

    }

}


/* =========================================================
   ボタン
========================================================= */

singleButton.addEventListener(
    "click",
    () => {

        performPull(1);

    }
);


tenButton.addEventListener(
    "click",
    () => {

        performPull(10);

    }
);


/* =========================================================
   Utility
========================================================= */

function delay(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}
