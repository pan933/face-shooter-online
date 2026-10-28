const LEVELS = [1, 1.16, 1.34, 1.55, 1.8, 2.08];
const REQUIRED_KILLS = [26, 23, 20, 18, 16, 14];

// Future faces receive a stable, reusable skill until a dedicated module is added.
const TEMPLATES = [
    { name: "星屑バースト", description: "自分の周囲を星の爆発で攻撃する。", type: "explosion", damage: 78, radius: 108 },
    { name: "一直線ビーム", description: "前方の敵をまとめて貫く。", type: "line_clear", damage: 66, width: 210, height: 145, maxTargets: 3 },
    { name: "ラピッドギア", description: "一定時間、連射速度と弾の威力が上がる。", type: "power_up", damageMultiplier: 1.18, fireRateMultiplier: 1.12, duration: 4 },
    { name: "フリーズウェーブ", description: "敵とボスを攻撃し、少しの間動きを止める。", type: "time_stop", damage: 48, stopDuration: 1.6 },
    { name: "守護の光", description: "HPを回復し、シールドを張る。", type: "defense", heal: 2, shieldDuration: 2.2 },
    { name: "弾幕リターン", description: "敵弾を消し、近くの敵へ反撃する。", type: "bullet_counter", damagePerBullet: 12, radius: 135, maxBullets: 10 },
    { name: "ミニブラックホール", description: "近くの敵を吸い込む重力攻撃。", type: "black_hole", damage: 72, radius: 112, pullPower: 1.0, duration: 2 },
    { name: "太陽フレア", description: "広い範囲を灼く大爆発。", type: "explosion", damage: 70, radius: 140 },
    { name: "クロスカッター", description: "前方を広く切り裂いて敵を攻撃する。", type: "line_clear", damage: 58, width: 300, height: 185, maxTargets: 4 },
    { name: "カウンターシールド", description: "敵弾を消し、守りながら近くへ反撃する。", type: "bullet_counter", damagePerBullet: 10, radius: 185, maxBullets: 14 },
    { name: "時空バリア", description: "敵弾を消して敵の動きを止める。", type: "time_stop", damage: 38, stopDuration: 2.1 },
    { name: "リカバリーフィールド", description: "HPとシールドを回復する。", type: "defense", heal: 3, shieldDuration: 3 }
];

function getLevelStats(template, index) {
    const scale = LEVELS[index];
    const stats = { requiredKills: REQUIRED_KILLS[index] };
    for (const [key, value] of Object.entries(template)) {
        if (["name", "description", "type"].includes(key)) continue;
        if (key === "radius" || key === "width" || key === "height" || key === "maxTargets" || key === "maxBullets") {
            stats[key] = Math.round(value + index * (key === "maxTargets" || key === "maxBullets" ? 1 : 12));
        } else if (key === "duration" || key === "stopDuration" || key === "shieldDuration") {
            stats[key] = Number((value + index * 0.25).toFixed(2));
        } else if (key === "damageMultiplier" || key === "fireRateMultiplier" || key === "pullPower") {
            stats[key] = Number((value + index * 0.07).toFixed(2));
        } else {
            stats[key] = Math.max(1, Math.round(value * scale));
        }
    }
    return stats;
}

function stableIndex(faceId) {
    let hash = 0;
    for (const char of String(faceId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return hash % TEMPLATES.length;
}

export function createFutureSkill(faceId) {
    const template = TEMPLATES[stableIndex(faceId)];
    return {
        id: String(faceId),
        name: template.name,
        description: template.description,
        maxLevel: 6,
        levels: REQUIRED_KILLS.map((_, index) => getLevelStats(template, index)),
        activate(context = {}) {
            const index = Math.max(0, Math.min(5, (Number(context.skillLevel) || 1) - 1));
            const stats = { ...this.levels[index], success: true, type: template.type };
            if (template.type === "explosion") {
                stats.x = context.player?.x ?? context.canvas?.width / 2 ?? 0;
                stats.y = context.player?.y ?? context.canvas?.height / 2 ?? 0;
            }
            return stats;
        }
    };
}

export const FUTURE_SKILL_TEMPLATE_COUNT = TEMPLATES.length;
