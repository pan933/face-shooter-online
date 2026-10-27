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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";


const DEFAULTS = {
    N: 60,
    R: 25,
    SR: 10,
    SSR: 4,
    UR: 1
};


let currentUser = null;


// ========================================
// 管理画面にパネルを追加
// ========================================

function createPanel() {

    // 二重作成防止
    if (
        document.getElementById(
            "gachaProbabilityPanel"
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
        "gachaProbabilityPanel";

    panel.className =
        "panel";


    panel.innerHTML = `

        <div class="panel-heading">

            <div>

                <p class="eyebrow">
                    GACHA PROBABILITY
                </p>

                <h2>
                    🎲 ガチャ排出確率
                </h2>

            </div>

        </div>


        <p class="muted">
            各レアリティの排出確率を設定できます。
            合計が100%になるようにしてください。
            同じレアリティの顔が複数ある場合は、その中で均等に抽選されます。
        </p>


        <div
            class="config-grid"
        >

            <label>
                N
                <span>0〜100%</span>

                <input
                    id="gachaProbN"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                >

            </label>


            <label>
                R
                <span>0〜100%</span>

                <input
                    id="gachaProbR"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                >

            </label>


            <label>
                SR
                <span>0〜100%</span>

                <input
                    id="gachaProbSR"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                >

            </label>


            <label>
                SSR
                <span>0〜100%</span>

                <input
                    id="gachaProbSSR"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                >

            </label>


            <label>
                UR
                <span>0〜100%</span>

                <input
                    id="gachaProbUR"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                >

            </label>

        </div>


        <p
            id="gachaProbabilityTotal"
            class="muted"
        >
            合計: -
        </p>


        <div class="form-actions">

            <button
                id="saveGachaProbability"
                class="primary"
                type="button"
            >
                確率を保存
            </button>


            <button
                id="resetGachaProbability"
                class="secondary"
                type="button"
            >
                初期値に戻す
            </button>

        </div>

    `;


    /*
     * 既存のガチャ設定パネルがあれば
     * その後ろに追加
     */
    const extension =
        document.getElementById(
            "faceShooterAdminExtension"
        );


    if (extension) {

        extension.after(
            panel
        );

    } else {

        adminPanel.appendChild(
            panel
        );

    }


    // 初期値読み込み
    loadProbabilityForm();


    // 保存
    document
        .getElementById(
            "saveGachaProbability"
        )
        .addEventListener(
            "click",
            saveProbability
        );


    // リセット
    document
        .getElementById(
            "resetGachaProbability"
        )
        .addEventListener(
            "click",
            resetProbability
        );


    // 入力変更時に合計更新
    const inputIds = [
        "gachaProbN",
        "gachaProbR",
        "gachaProbSR",
        "gachaProbSSR",
        "gachaProbUR"
    ];


    for (const id of inputIds) {

        document
            .getElementById(id)
            .addEventListener(
                "input",
                updateTotal
            );

    }

}


// ========================================
// フォームに値を入れる
// ========================================

function setValues(values) {

    document.getElementById(
        "gachaProbN"
    ).value = values.N;


    document.getElementById(
        "gachaProbR"
    ).value = values.R;


    document.getElementById(
        "gachaProbSR"
    ).value = values.SR;


    document.getElementById(
        "gachaProbSSR"
    ).value = values.SSR;


    document.getElementById(
        "gachaProbUR"
    ).value = values.UR;


    updateTotal();

}


// ========================================
// フォームから値を取得
// ========================================

function getValues() {

    return {

        N:
            Number(
                document.getElementById(
                    "gachaProbN"
                ).value
            ) || 0,


        R:
            Number(
                document.getElementById(
                    "gachaProbR"
                ).value
            ) || 0,


        SR:
            Number(
                document.getElementById(
                    "gachaProbSR"
                ).value
            ) || 0,


        SSR:
            Number(
                document.getElementById(
                    "gachaProbSSR"
                ).value
            ) || 0,


        UR:
            Number(
                document.getElementById(
                    "gachaProbUR"
                ).value
            ) || 0

    };

}


// ========================================
// 合計表示
// ========================================

function updateTotal() {

    const values =
        getValues();


    const total =
        Object.values(values)
            .reduce(
                (a, b) => a + b,
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
        `合計: ${total.toFixed(1)}%`;


    if (
        Math.abs(
            total - 100
        ) < 0.01
    ) {

        element.style.color = "";

    } else {

        element.style.color =
            "#ff7777";

    }

}


// ========================================
// Firestoreから設定を読み込む
// ========================================

async function loadProbabilityForm() {

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


        const saved =
            data.gachaProbabilities || {};


        setValues({

            ...DEFAULTS,

            ...saved

        });


    } catch (error) {

        console.error(
            "ガチャ確率設定の読み込み失敗:",
            error
        );


        setValues(
            DEFAULTS
        );

    }

}


// ========================================
// 確率を保存
// ========================================

async function saveProbability() {

    const values =
        getValues();


    const total =
        Object.values(values)
            .reduce(
                (a, b) => a + b,
                0
            );


    // 100%チェック
    if (
        Math.abs(
            total - 100
        ) > 0.01
    ) {

        alert(
            `確率の合計を100%にしてください。\n現在: ${total.toFixed(1)}%`
        );

        return;
    }


    const button =
        document.getElementById(
            "saveGachaProbability"
        );


    button.disabled = true;


    try {

        const ref =
            doc(
                db,
                "adminSettings",
                "gameplay"
            );


        /*
         * 既存設定を取得してから
         * ガチャ確率だけ更新する
         *
         * 他のゲーム設定は消さない
         */
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

                gachaProbabilities:
                    values,

                updatedBy:
                    currentUser.uid,

                updatedAt:
                    serverTimestamp()

            }
        );


        alert(
            "ガチャ排出確率を保存しました。"
        );


    } catch (error) {

        console.error(
            "ガチャ確率保存失敗:",
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


// ========================================
// 初期値に戻す
// ========================================

async function resetProbability() {

    if (
        !confirm(
            "ガチャ排出確率を初期値に戻しますか？\n\nN 60%\nR 25%\nSR 10%\nSSR 4%\nUR 1%"
        )
    ) {

        return;

    }


    setValues(
        DEFAULTS
    );


    await saveProbability();

}


// ========================================
// Firebase認証・管理者確認
// ========================================

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
             * admin.js側で
             * adminPanelが表示されるまで待つ
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


            // 10秒以上待たない
            setTimeout(
                () => {

                    clearInterval(
                        wait
                    );

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
