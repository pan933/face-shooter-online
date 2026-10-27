// ============================================================
// 顔2 専用スキル
// ============================================================

const skill = {
    id: "face2",

    name: "顔2・大爆発",

    description: "画面中央に大爆発を起こして周囲の敵に大ダメージを与える",

    maxLevel: 6,

    // --------------------------------------------------------
    // スキルLvごとの性能
    // --------------------------------------------------------
    levels: [
        {
            // Lv1
            requiredKills: 20,
            damage: 100,
            radius: 100
        },

        {
            // Lv2
            requiredKills: 18,
            damage: 130,
            radius: 120
        },

        {
            // Lv3
            requiredKills: 16,
            damage: 170,
            radius: 145
        },

        {
            // Lv4
            requiredKills: 14,
            damage: 220,
            radius: 170
        },

        {
            // Lv5
            requiredKills: 12,
            damage: 280,
            radius: 200
        },

        {
            // Lv6
            requiredKills: 10,
            damage: 350,
            radius: 240
        }
    ],

    // --------------------------------------------------------
    // スキル発動処理
    //
    // 今は土台だけ。
    // 実際の敵へのダメージ処理は game.js と接続するときに
    // ここへ追加する。
    // --------------------------------------------------------

    activate(context) {

        const {
            player,
            enemies,
            canvas
        } = context;

        const level = context.skillLevel || 1;

        const levelData =
            this.levels[
                Math.min(level - 1, this.levels.length - 1)
            ];

        if (!levelData) {
            return {
                success: false
            };
        }

        console.log(
            `[顔2] 大爆発発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "explosion",

            damage: levelData.damage,

            radius: levelData.radius,

            x: player
                ? player.x
                : canvas
                    ? canvas.width / 2
                    : 0,

            y: player
                ? player.y
                : canvas
                    ? canvas.height / 2
                    : 0
        };
    }
};

export default skill;
