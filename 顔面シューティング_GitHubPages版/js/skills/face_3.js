// ============================================================
// 顔3 専用スキル
// ============================================================

const skill = {
    id: "face_3",

    name: "顔3・時止め",

    description: "一定時間、敵の動きを止めて攻撃できる。Lvが上がるほど停止時間とダメージが増える。",

    maxLevel: 6,

    // --------------------------------------------------------
    // スキルLvごとの性能
    // --------------------------------------------------------
    levels: [
        {
            // Lv1
            requiredKills: 25,
            damage: 60,
            stopDuration: 2.0
        },

        {
            // Lv2
            requiredKills: 23,
            damage: 80,
            stopDuration: 2.5
        },

        {
            // Lv3
            requiredKills: 20,
            damage: 105,
            stopDuration: 3.0
        },

        {
            // Lv4
            requiredKills: 17,
            damage: 140,
            stopDuration: 3.5
        },

        {
            // Lv5
            requiredKills: 14,
            damage: 180,
            stopDuration: 4.0
        },

        {
            // Lv6
            requiredKills: 11,
            damage: 240,
            stopDuration: 5.0
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
            `[顔3] 時止め発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "time_stop",

            damage: levelData.damage,

            duration: levelData.stopDuration
        };
    }
};

export default skill;
