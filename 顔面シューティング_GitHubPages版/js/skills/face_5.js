// ============================================================
// 顔5 専用スキル
// ============================================================

const skill = {
    id: "face_5",

    name: "顔5・弾幕返し",

    description: "敵の弾を消し、その数に応じて反撃ダメージを与える。",

    maxLevel: 6,

    levels: [
        {
            requiredKills: 26,
            damagePerBullet: 20,
            radius: 120,
            maxBullets: 10
        },
        {
            requiredKills: 23,
            damagePerBullet: 25,
            radius: 140,
            maxBullets: 14
        },
        {
            requiredKills: 20,
            damagePerBullet: 32,
            radius: 160,
            maxBullets: 18
        },
        {
            requiredKills: 17,
            damagePerBullet: 40,
            radius: 180,
            maxBullets: 22
        },
        {
            requiredKills: 14,
            damagePerBullet: 50,
            radius: 210,
            maxBullets: 28
        },
        {
            requiredKills: 11,
            damagePerBullet: 65,
            radius: 240,
            maxBullets: 35
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
            `[顔5] 弾幕返し発動 Lv${level}`,
            levelData
        );

        return {
            success: true,

            type: "bullet_counter",

            damagePerBullet:
                levelData.damagePerBullet,

            radius:
                levelData.radius,

            maxBullets:
                levelData.maxBullets
        };
    }
};

export default skill;
