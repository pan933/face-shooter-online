import {
    doc,
    getDoc,
    setDoc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { applyLimitedFaceSkill, createLimitedFaceSkill, isWindowsElectronClient } from "./limited-face-system.js";

export const INITIAL_FACE = "face2";
export const CLOUDINARY_FACE_URLS = {
    face2: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063262/face2.png",
    face_1: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_1.jpg",
    face_2: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_2.jpg",
    face_3: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_3.jpg",
    face_4: "https://res.cloudinary.com/i0ptpjzc/image/upload/v1793063261/face_4.jpg"
};
export const RARITIES = {
    N: { name: "N", weight: 93 }, R: { name: "R", weight: 0 },
    SR: { name: "SR", weight: 4 }, SSR: { name: "SSR", weight: 2 }, UR: { name: "UR", weight: 1 }
};

export function getFaceRarity(number) {
    if (number === "face2") return "N";
    if (number === "face_4") return "SR";
    if (["face_1", "face_2", "face_3"].includes(number)) return "UR";
    return "N";
}

export function createDefaultSkillData() {
    return { level: 1, progress: 0, duplicateProgress: 0, totalKills: 0, tickets: 0 };
}

export function buildFace(number) {
    return {
        id: number,
        name: number === "face2" ? "初期顔" : `顔 ${number.replace("face_", "")}`,
        imageUrl: CLOUDINARY_FACE_URLS[number] || CLOUDINARY_FACE_URLS.face2,
        rarity: getFaceRarity(number),
        probability: 0,
        skill: createDefaultSkillData()
    };
}

export async function loadGachaFaces() {
    try {
        const snap = await getDoc(doc(db, "adminSettings", "gameplay"));
        const faces = snap.exists() ? snap.data().gachaFaces : [];
        return Array.isArray(faces) ? faces : [];
    } catch (error) {
        console.error("[FaceSystem] ガチャ顔読み込み失敗:", error);
        return [];
    }
}

export async function discoverFaces() {
    const managedFaces = await loadGachaFaces();
    if (managedFaces.length) return managedFaces.map(face => ({ ...face, skill: face.skill || createDefaultSkillData() }));
    return [buildFace("face2"), buildFace("face_1"), buildFace("face_2"), buildFace("face_3"), buildFace("face_4")];
}

export async function loadFaceData(uid) {
    if (!uid) return { faces: [], selectedFace: INITIAL_FACE, skillTickets: 0 };
    try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        let faces = Array.isArray(data.faces) ? data.faces : [];
        if (!faces.length) {
            faces = [{ ...buildFace(INITIAL_FACE), obtainedAt: Date.now() }];
            await setDoc(ref, {
                faces,
                selectedFace: data.selectedFace || INITIAL_FACE,
                skillTickets: Number(data.skillTickets) || 0,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }

        // Automatic entitlement is intentionally limited to authenticated users in the Windows Electron build.
        if (isWindowsElectronClient()) {
            const configuredLimitedFaces = (await loadGachaFaces()).filter(face => face?.limited === true);
            let changed = false;
            for (const configured of configuredLimitedFaces) {
                const existing = faces.find(face => face.id === configured.id);
                if (!existing) {
                    faces.push({
                        id: String(configured.id), name: String(configured.name || configured.id),
                        imageUrl: String(configured.imageUrl || ""), rarity: String(configured.rarity || "UR"),
                        description: String(configured.description || ""), skillId: String(configured.skillId || configured.id),
                        probability: Number(configured.probability) || 0, limited: true, obtainedAt: Date.now(),
                        skill: createLimitedFaceSkill()
                    });
                    changed = true;
                } else if (existing.skill?.level !== 6 || existing.limited !== true) {
                    existing.limited = true;
                    existing.skill = applyLimitedFaceSkill({ ...existing, limited: true });
                    changed = true;
                }
            }
            if (changed) await setDoc(ref, { faces, updatedAt: serverTimestamp() }, { merge: true });
        }

        const normalizedFaces = faces.map(face => ({
            ...face,
            skill: face?.limited === true ? applyLimitedFaceSkill(face) : normalizeSkillData(face?.skill)
        }));
        return { ...data, faces: normalizedFaces, selectedFace: data.selectedFace || INITIAL_FACE, skillTickets: Number(data.skillTickets) || 0 };
    } catch (error) {
        console.error("[FaceSystem] 顔データ読み込み失敗:", error);
        throw error;
    }
}

export function normalizeSkillData(skill) {
    if (!skill) return createDefaultSkillData();
    return {
        level: Math.max(1, Math.min(6, Number(skill.level) || 1)),
        progress: Math.max(0, Number(skill.progress) || 0),
        duplicateProgress: Math.max(0, Number(skill.duplicateProgress) || 0),
        totalKills: Math.max(0, Number(skill.totalKills) || 0),
        tickets: Math.max(0, Number(skill.tickets) || 0)
    };
}

export async function saveFaceData(uid, data) {
    if (!uid) throw new Error("UIDがありません");
    await setDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export function addFaceSkillKill(face, amount = 1) {
    if (!face) return face;
    const skill = normalizeSkillData(face.skill);
    skill.progress += Math.max(0, Number(amount) || 0);
    skill.totalKills += Math.max(0, Number(amount) || 0);
    return { ...face, skill };
}

export function addSkillTickets(data, amount = 1) {
    return { ...data, skillTickets: Math.max(0, Number(data?.skillTickets || 0) + Number(amount || 0)) };
}

export function formatBuffs(buffs) {
    if (!buffs) return "";
    return Array.isArray(buffs) ? buffs.join(" / ") : String(buffs);
}

export async function imageExists(url) {
    if (!url) return false;
    try { return (await fetch(url, { method: "HEAD" })).ok; } catch { return false; }
}

export function watchGachaFaces(callback) {
    let stopped = false;
    const check = async () => {
        if (!stopped) callback(await loadGachaFaces());
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => { stopped = true; clearInterval(timer); };
}

export async function addMatchPoints(uid, amount = 0) {
    if (!uid || uid === "guest-local-only") return { success: false, points: 0 };
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return { success: true, points: 0 };
    try {
        const ref = doc(db, "users", uid);
        const points = await runTransaction(db, async transaction => {
            const snap = await transaction.get(ref);
            const next = Math.max(0, Number(snap.exists() ? snap.data().points : 0) || 0) + add;
            transaction.set(ref, { points: next, updatedAt: serverTimestamp() }, { merge: true });
            return next;
        });
        return { success: true, points };
    } catch (error) {
        console.error("[FaceSystem] 試合ポイント追加失敗:", error);
        return { success: false, points: 0, error };
    }
}

export async function claimDailyLoginBonus(uid, amount = 500) {
    if (!uid || uid === "guest-local-only") return { success: false, claimed: false, points: 0, bonus: 0 };
    const bonus = Math.max(0, Math.floor(Number(amount) || 0));
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date()).reduce((result, part) => {
            if (part.type !== "literal") result[part.type] = part.value;
            return result;
        }, {});
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    const ref = doc(db, "users", uid);
    try {
        const result = await runTransaction(db, async transaction => {
            const snap = await transaction.get(ref);
            const data = snap.exists() ? snap.data() : {};
            const points = Math.max(0, Number(data.points) || 0);
            if (data.lastDailyLoginBonusDate === today) return { claimed: false, points, bonus: 0 };
            const next = points + bonus;
            transaction.set(ref, { points: next, lastDailyLoginBonusDate: today, lastDailyLoginBonusAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
            return { claimed: true, points: next, bonus };
        });
        return { success: true, ...result };
    } catch (error) {
        console.error("[FaceSystem] ログインボーナス付与失敗:", error);
        return { success: false, claimed: false, points: 0, bonus: 0, error };
    }
}
