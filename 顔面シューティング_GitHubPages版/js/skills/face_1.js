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
            widthRatio: 0.58,
            heightRatio: 0.55,
            maxTargets: 3
        },

        {
            // Lv2
            requiredKills: 22,
            damage: 105,
            widthRatio: 0.66,
            heightRatio: 0.62,
            maxTargets: 4
        },

        {
            // Lv3
            requiredKills: 20,
            damage: 135,
            widthRatio: 0.74,
            heightRatio: 0.69,
            maxTargets: 5
        },

        {
            // Lv4
            requiredKills: 18,
            damage: 175,
            widthRatio: 0.82,
            heightRatio: 0.76,
            maxTargets: 6
        },

        {
            // Lv5
            requiredKills: 15,
            damage: 225,
            widthRatio: 0.90,
            heightRatio: 0.83,
            maxTargets: 8
        },

        {
            // Lv6
            requiredKills: 12,
            damage: 300,
            widthRatio: 1.00,
            heightRatio: 0.92,
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
        const viewportWidth = Number(context.viewportWidth) || Number(canvas?.width) || 800;
        const viewportHeight = Number(context.viewportHeight) || Number(canvas?.height) || 600;

        console.log(
            `[顔1] 一掃発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "line_clear",

            damage: levelData.damage,

            width: Math.round(viewportWidth * levelData.widthRatio),

            height: Math.round(viewportHeight * levelData.heightRatio),

            maxTargets: levelData.maxTargets,

            x: playerX,

            y: playerY
        };
    }
};

export default skill;
