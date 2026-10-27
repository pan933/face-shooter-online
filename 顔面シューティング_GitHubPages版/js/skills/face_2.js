// ============================================================
// 顔2 専用スキル
// ============================================================

const skill = {
    id: "face_2",

    name: "顔2・暴走モード",

    description: "一定時間、攻撃力と連射性能が大幅に上昇する。",

    maxLevel: 6,

    // --------------------------------------------------------
    // スキルLvごとの性能
    // --------------------------------------------------------
    levels: [
        {
            // Lv1
            requiredKills: 22,
            damageMultiplier: 1.25,
            fireRateMultiplier: 1.15,
            duration: 4
        },

        {
            // Lv2
            requiredKills: 20,
            damageMultiplier: 1.35,
            fireRateMultiplier: 1.20,
            duration: 5
        },

        {
            // Lv3
            requiredKills: 18,
            damageMultiplier: 1.50,
            fireRateMultiplier: 1.25,
            duration: 6
        },

        {
            // Lv4
            requiredKills: 16,
            damageMultiplier: 1.70,
            fireRateMultiplier: 1.30,
            duration: 7
        },

        {
            // Lv5
            requiredKills: 14,
            damageMultiplier: 1.90,
            fireRateMultiplier: 1.40,
            duration: 8
        },

        {
            // Lv6
            requiredKills: 12,
            damageMultiplier: 2.20,
            fireRateMultiplier: 1.50,
            duration: 10
        }
    ],

    // --------------------------------------------------------
    // スキル発動
    // --------------------------------------------------------

    activate(context) {

        const level = context.skillLevel || 1;

        const levelIndex = Math.min(
            level - 1,
            this.levels.length - 1
        );

        const levelData = this.levels[levelIndex];

        if (!levelData) {
            return {
                success: false
            };
        }

        console.log(
            `[顔2] 暴走モード発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "power_up",

            damageMultiplier:
                levelData.damageMultiplier,

            fireRateMultiplier:
                levelData.fireRateMultiplier,

            duration:
                levelData.duration
        };
    }
};

export default skill;
