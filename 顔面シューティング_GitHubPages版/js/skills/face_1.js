// ============================================================
// 顔1 専用スキル
// ============================================================

const skill = {
    id: "face_1",

    name: "顔1・一掃",

    description: "前方の敵をまとめて攻撃する。Lvが上がるほど攻撃範囲と威力が上昇する。",

    maxLevel: 6,

    // --------------------------------------------------------
    // スキルLvごとの性能
    // --------------------------------------------------------
    levels: [
        {
            // Lv1
            requiredKills: 24,
            damage: 80,
            width: 180,
            height: 120,
            maxTargets: 3
        },

        {
            // Lv2
            requiredKills: 22,
            damage: 105,
            width: 210,
            height: 135,
            maxTargets: 4
        },

        {
            // Lv3
            requiredKills: 20,
            damage: 135,
            width: 240,
            height: 150,
            maxTargets: 5
        },

        {
            // Lv4
            requiredKills: 18,
            damage: 175,
            width: 280,
            height: 170,
            maxTargets: 6
        },

        {
            // Lv5
            requiredKills: 15,
            damage: 225,
            width: 320,
            height: 195,
            maxTargets: 8
        },

        {
            // Lv6
            requiredKills: 12,
            damage: 300,
            width: 370,
            height: 220,
            maxTargets: 10
        }
    ],

    // --------------------------------------------------------
    // スキル発動
    // --------------------------------------------------------

    activate(context) {

        const {
            player,
            canvas
        } = context;

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

        const playerX =
            player?.x ??
            (canvas ? canvas.width / 2 : 0);

        const playerY =
            player?.y ??
            (canvas ? canvas.height / 2 : 0);

        console.log(
            `[顔1] 一掃発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "line_clear",

            damage: levelData.damage,

            width: levelData.width,

            height: levelData.height,

            maxTargets: levelData.maxTargets,

            x: playerX,

            y: playerY
        };
    }
};

export default skill;
