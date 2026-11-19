// レベル差でスキル性能が極端にならないよう、成長幅を緩やかにする。
const LEVELS = [1, 1.08, 1.16, 1.24, 1.33, 1.42];
const REQUIRED_KILLS = [22, 21, 20, 19, 18, 17];

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
    { name: "リカバリーフィールド", description: "HPとシールドを回復する。", type: "defense", heal: 3, shieldDuration: 3 },
    { id: "skill_bomb", name: "ころころ爆弾", description: "狙った場所に大きな爆弾を落として周囲を吹き飛ばす。", type: "explosion", damage: 145, radius: 165 },
    { id: "skill_laser", name: "一直線レーザー", description: "画面上端まで伸びるレーザーで前方の敵を貫く。", type: "laser", damage: 125, width: 110 },
    { id: "skill_sweep", name: "画面一掃", description: "画面内の敵全員にダメージ。ピンチの時に便利。", type: "screen_clear", damage: 62 },
    { id: "skill_homing", name: "おっかけミサイル", description: "近くの敵を追尾するミサイルを最大5体に発射。", type: "homing_volley", damage: 115, maxTargets: 5 },
    { id: "skill_teleport", name: "ワープ回避", description: "画面下の安全な場所へワープし、敵弾を消す。", type: "teleport", damage: 75 },
    { id: "skill_score", name: "ポイントシャワー", description: "敵を攻撃しながらスコアボーナスを獲得。", type: "score_boost", damage: 52, score: 500 },
    { id: "skill_shockwave", name: "地震ウェーブ", description: "足元から衝撃波を広げ、近くの敵をまとめて攻撃。", type: "explosion", damage: 95, radius: 225 },
    { id: "skill_snipe", name: "ボスハンター", description: "最も強い敵とボスを狙い撃ちする。", type: "homing_volley", damage: 230, maxTargets: 2 },
    { id: "skill_guard", name: "くるくるガード", description: "敵弾を消してシールドを展開。", type: "orbit_guard", shieldDuration: 4 },
    { id: "skill_freeze", name: "氷結フィールド", description: "敵を傷つけて動きを止め、反撃の時間を作る。", type: "time_stop", damage: 72, stopDuration: 2.8 },

    // 追加スキル：斬撃・属性攻撃・大技
    { id: "skill_iaido", name: "一閃・居合斬り", description: "一瞬のタメから画面を横切る超高速斬撃。", type: "slash", damage: 155, width: 620, height: 210 },
    { id: "skill_cross_slash", name: "十文字斬り", description: "二本の巨大な斬撃で敵を十字に切り裂く。", type: "slash", damage: 135, width: 700, height: 260 },
    { id: "skill_infinite_slash", name: "無限連斬", description: "連続する斬撃で広範囲の敵を攻撃。", type: "slash", damage: 92, width: 760, height: 300 },
    { id: "skill_flying_slash", name: "飛ぶ斬撃", description: "前方へ巨大な三日月状の斬撃を飛ばす。", type: "line_clear", damage: 118, width: 520, height: 390, maxTargets: 8 },
    { id: "skill_meteor", name: "メテオレイン", description: "無数の隕石が降り注ぎ敵を一掃する。", type: "screen_clear", damage: 88 },
    { id: "skill_thunder_god", name: "雷神・天轟", description: "画面全体に雷を落として敵を貫く。", type: "screen_clear", damage: 105 },
    { id: "skill_ice_age", name: "絶対零度", description: "氷の波動で敵を攻撃し時間を止める。", type: "time_stop", damage: 82, stopDuration: 3.4 },
    { id: "skill_inferno", name: "煉獄の炎", description: "炎の渦で周囲を焼き尽くす。", type: "explosion", damage: 125, radius: 205 },
    { id: "skill_phoenix", name: "不死鳥の加護", description: "HPを回復し強力なシールドを展開。", type: "defense", heal: 4, shieldDuration: 5 },
    { id: "skill_clone", name: "残像分身", description: "分身の連続攻撃で複数の敵を狙う。", type: "homing_volley", damage: 105, maxTargets: 9 },
    { id: "skill_void", name: "虚無領域", description: "重力で敵を引き寄せて一気に攻撃。", type: "black_hole", damage: 118, radius: 260, pullPower: 1.15, duration: 2.5 },
    { id: "skill_god_beam", name: "神の裁き", description: "天から巨大な光線を落とす。", type: "laser", damage: 210, width: 210 },
    { id: "skill_face_beam", name: "顔面極太ビーム", description: "超極太ビームで前方をなぎ払う。", type: "laser", damage: 165, width: 310 },
    { id: "skill_hammer", name: "超重量ハンマー", description: "巨大ハンマーの衝撃で広範囲を吹き飛ばす。", type: "explosion", damage: 145, radius: 245 },
    { id: "skill_drill", name: "ドリルブレイク", description: "貫通ドリルで前方の敵をまとめて攻撃。", type: "line_clear", damage: 148, width: 260, height: 520, maxTargets: 10 },
    { id: "skill_storm", name: "テンペスト", description: "嵐を呼び敵弾を消しながら攻撃。", type: "bullet_counter", damagePerBullet: 22, radius: 320, maxBullets: 22 },
    { id: "skill_mirror", name: "ミラーリフレクト", description: "敵弾を消して強烈な反撃を放つ。", type: "bullet_counter", damagePerBullet: 28, radius: 360, maxBullets: 24 },
    { id: "skill_overdrive", name: "限界突破", description: "一定時間、攻撃力と連射速度が大幅上昇。", type: "power_up", damageMultiplier: 1.75, fireRateMultiplier: 1.55, duration: 7 },
    { id: "skill_warp", name: "次元跳躍", description: "瞬間移動して敵弾を消し周囲を攻撃。", type: "teleport", damage: 145 },
    { id: "skill_final", name: "ファイナルインパクト", description: "画面全体を揺るがす必殺の大爆発。", type: "screen_clear", damage: 185 }
];

function getLevelStats(template, index) {
    const scale = LEVELS[index];
    const stats = { requiredKills: REQUIRED_KILLS[index] };
    for (const [key, value] of Object.entries(template)) {
        if (["id", "name", "description", "type"].includes(key)) continue;
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
    return createSkillFromTemplate(faceId, template);
}

function createSkillFromTemplate(id, template) {
    return {
        id: String(id),
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
            } else if (template.type === "laser") {
                stats.x = context.player?.x ?? 0;
                stats.y = context.player?.y ?? 0;
            }
            return stats;
        }
    };
}

export function getSkillOptions() {
    return TEMPLATES.map((skill, index) => ({
        id: skill.id || `future_${index}`,
        name: skill.name,
        description: skill.description
    }));
}

export function createCatalogSkill(skillId, faceId = skillId) {
    const index = TEMPLATES.findIndex((skill, i) => (skill.id || `future_${i}`) === skillId);
    if (index < 0) return null;
    return createSkillFromTemplate(faceId, TEMPLATES[index]);
}

export const FUTURE_SKILL_TEMPLATE_COUNT = TEMPLATES.length;
