// ============================================================
// 顔6 専用スキル
// ============================================================

const skill = {
    id: "face_6",

    name: "顔6・ブラックホール",

    description: "周囲の敵を引き寄せて動きを鈍らせ、最後にまとめてダメージを与える。",

    maxLevel: 6,

    levels: [
        {
            requiredKills: 30,
            radius: 120,
            pullPower: 0.8,
            duration: 2.0,
            damage: 100
        },
        {
            requiredKills: 27,
            radius: 145,
            pullPower: 1.0,
            duration: 2.3,
            damage: 130
        },
        {
            requiredKills: 24,
            radius: 170,
            pullPower: 1.2,
            duration: 2.6,
            damage: 165
        },
        {
            requiredKills: 21,
            radius: 200,
            pullPower: 1.4,
            duration: 3.0,
            damage: 210
        },
        {
            requiredKills: 18,
            radius: 235,
            pullPower: 1.7,
            duration: 3.5,
            damage: 270
        },
        {
            requiredKills: 15,
            radius: 280,
            pullPower: 2.0,
            duration: 4.0,
            damage: 350
        }
    ],

    activate(context) {

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
            `[顔6] ブラックホール発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "black_hole",

            radius:
                levelData.radius,

            pullPower:
                levelData.pullPower,

            duration:
                levelData.duration,

            damage:
                levelData.damage
        };
    }
};

export default skill;
