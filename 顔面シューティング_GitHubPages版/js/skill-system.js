// ============================================================
// 顔面シューティング
// スキルシステム
//
// ・顔ごとに別スキルを読み込む
// ・スキルLv 1～6
// ・撃破数でスキルゲージを貯める
// ・Lvごとに必要撃破数を変更できる
// ・スキルファイルを変更するだけで各顔の性能を変更できる
// ============================================================

const MAX_SKILL_LEVEL = 6;

const skillCache = new Map();


// ------------------------------------------------------------
// 顔IDの安全チェック
// ------------------------------------------------------------

function isValidFaceId(faceId) {
    return typeof faceId === "string"
        && /^[a-zA-Z0-9_-]+$/.test(faceId);
}


// ------------------------------------------------------------
// スキルファイルを読み込む
//
// 例:
// face2 → ./skills/face2.js
// face_1 → ./skills/face_1.js
// ------------------------------------------------------------

export async function loadSkill(faceId) {

    if (!isValidFaceId(faceId)) {
        console.warn("[Skill] 不正なfaceId:", faceId);
        return null;
    }

    if (skillCache.has(faceId)) {
        return skillCache.get(faceId);
    }

    try {

        const module = await import(
            `./skills/${faceId}.js`
        );

        const skill = module.default;

        if (!skill) {
            console.error(
                `[Skill] ${faceId}.js にdefault exportがありません`
            );

            return null;
        }

        skillCache.set(faceId, skill);

        console.log(
            `[Skill] ${faceId} のスキルを読み込みました`
        );

        return skill;

    } catch (error) {

        console.error(
            `[Skill] ${faceId} のスキル読み込み失敗`,
            error
        );

        return null;
    }
}


// ------------------------------------------------------------
// スキルLvの初期データ
// ------------------------------------------------------------

export function createSkillData() {

    return {
        level: 1,
        progress: 0,
        totalKills: 0,
        tickets: 0
    };
}


// ------------------------------------------------------------
// 古いデータや不足データを補正
// ------------------------------------------------------------

export function normalizeSkillData(data = {}) {

    const level = Number(data.level);

    return {
        level: Number.isFinite(level)
            ? Math.max(1, Math.min(MAX_SKILL_LEVEL, level))
            : 1,

        progress: Number.isFinite(Number(data.progress))
            ? Math.max(0, Number(data.progress))
            : 0,

        totalKills: Number.isFinite(Number(data.totalKills))
            ? Math.max(0, Number(data.totalKills))
            : 0,

        tickets: Number.isFinite(Number(data.tickets))
            ? Math.max(0, Number(data.tickets))
            : 0
    };
}


// ------------------------------------------------------------
// 現在のスキルLv設定を取得
//
// skill.levels:
//
// [
//   {
//      requiredKills: 20,
//      damage: 100,
//      radius: 80
//   },
//   ...
// ]
// ------------------------------------------------------------

export function getSkillLevelData(skill, level) {

    if (!skill || !Array.isArray(skill.levels)) {
        return null;
    }

    const index = Math.max(
        0,
        Math.min(level - 1, skill.levels.length - 1)
    );

    return skill.levels[index] || null;
}


// ------------------------------------------------------------
// 現在のLvで必要な撃破数
// ------------------------------------------------------------

export function getRequiredKills(skill, level) {

    const levelData = getSkillLevelData(skill, level);

    if (!levelData) {
        return 999999;
    }

    const required = Number(levelData.requiredKills);

    if (!Number.isFinite(required) || required <= 0) {
        return 1;
    }

    return required;
}


// ------------------------------------------------------------
// スキルゲージが満タンか
// ------------------------------------------------------------

export function isSkillReady(skill, skillData) {

    if (!skill || !skillData) {
        return false;
    }

    const data = normalizeSkillData(skillData);

    const requiredKills = getRequiredKills(
        skill,
        data.level
    );

    return data.progress >= requiredKills;
}


// ------------------------------------------------------------
// 撃破数を加算
//
// 戻り値:
// {
//   data,
//   ready,
//   leveledUp
// }
// ------------------------------------------------------------

export function addSkillKill(skill, skillData, amount = 1) {

    const data = normalizeSkillData(skillData);

    const add = Math.max(
        0,
        Number(amount) || 0
    );

    data.progress += add;
    data.totalKills += add;

    let leveledUp = false;

    // 最大Lvではレベルアップしない
    if (data.level < MAX_SKILL_LEVEL) {

        const requiredKills = getRequiredKills(
            skill,
            data.level
        );

        // ゲージ満タンでスキルLvアップ
        if (data.progress >= requiredKills) {

            data.progress -= requiredKills;

            data.level += 1;

            leveledUp = true;

            console.log(
                `[Skill] スキルLvアップ → Lv${data.level}`
            );
        }
    }

    return {
        data,
        ready: isSkillReady(skill, data),
        leveledUp
    };
}


// ------------------------------------------------------------
// スキルを使用
//
// 使用するとゲージを0にする。
// 実際の攻撃処理は各スキルファイル側で行う。
// ------------------------------------------------------------

export function consumeSkill(skill, skillData) {

    const data = normalizeSkillData(skillData);

    if (!isSkillReady(skill, data)) {
        return {
            success: false,
            data
        };
    }

    data.progress = 0;

    return {
        success: true,
        data
    };
}


// ------------------------------------------------------------
// スキルチケットを使用
//
// Tsum Tsumのスキルチケットのように
// スキル成長用として使える土台。
// ------------------------------------------------------------

export function useSkillTicket(skill, skillData) {

    const data = normalizeSkillData(skillData);

    if (data.level >= MAX_SKILL_LEVEL) {

        return {
            success: false,
            reason: "MAX_LEVEL",
            data
        };
    }

    if (data.tickets <= 0) {

        return {
            success: false,
            reason: "NO_TICKET",
            data
        };
    }

    data.tickets -= 1;

    const requiredKills = getRequiredKills(
        skill,
        data.level
    );

    // チケット1枚で必要撃破数を1回分進める
    data.progress += requiredKills;

    let leveledUp = false;

    if (data.progress >= requiredKills) {

        data.progress -= requiredKills;

        data.level += 1;

        leveledUp = true;
    }

    return {
        success: true,
        leveledUp,
        data
    };
}


// ------------------------------------------------------------
// スキル情報を取得
// ------------------------------------------------------------

export function getSkillInfo(skill, skillData) {

    if (!skill) {
        return null;
    }

    const data = normalizeSkillData(skillData);

    const levelData = getSkillLevelData(
        skill,
        data.level
    );

    const requiredKills = getRequiredKills(
        skill,
        data.level
    );

    return {

        id: skill.id || "",

        name: skill.name || "スキル",

        description:
            skill.description || "",

        level: data.level,

        maxLevel: Math.min(
            MAX_SKILL_LEVEL,
            Array.isArray(skill.levels)
                ? skill.levels.length
                : MAX_SKILL_LEVEL
        ),

        progress: data.progress,

        requiredKills,

        totalKills: data.totalKills,

        ready:
            data.progress >= requiredKills,

        levelData
    };
}


// ------------------------------------------------------------
// キャッシュを削除
//
// 管理画面でスキルファイルを変更したときなどに使用。
// ------------------------------------------------------------

export function clearSkillCache(faceId = null) {

    if (faceId) {
        skillCache.delete(faceId);
        return;
    }

    skillCache.clear();
}


// ------------------------------------------------------------
// 定数を公開
// ------------------------------------------------------------

export {
    MAX_SKILL_LEVEL
};
