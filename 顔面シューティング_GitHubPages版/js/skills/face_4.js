// ============================================================
// 顔4 専用スキル
// ============================================================

const skill = {
    id: "face_4",

    name: "顔4・完全防御",

    description: "HPを回復し、一定時間ダメージを無効化するシールドを展開する。",

    maxLevel: 6,

    // --------------------------------------------------------
    // スキルLvごとの性能
    // --------------------------------------------------------
    levels: [
        {
            // Lv1
            requiredKills: 28,
            heal: 10,
            shieldDuration: 2.0
        },

        {
            // Lv2
            requiredKills: 25,
            heal: 15,
            shieldDuration: 2.5
        },

        {
            // Lv3
            requiredKills: 22,
            heal: 20,
            shieldDuration: 3.0
        },

        {
            // Lv4
            requiredKills: 19,
            heal: 25,
            shieldDuration: 3.5
        },

        {
            // Lv5
            requiredKills: 16,
            heal: 30,
            shieldDuration: 4.0
        },

        {
            // Lv6
            requiredKills: 13,
            heal: 40,
            shieldDuration: 5.0
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
            `[顔4] 完全防御発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "defense",

            heal: levelData.heal,

            shieldDuration:
                levelData.shieldDuration
        };
    }
};

export default skill;
