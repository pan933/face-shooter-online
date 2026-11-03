export function isWindowsElectronClient(env = globalThis) {
  // Electron's preload exposes the actual OS platform from the main process.
  // The user-agent fallback keeps browser-only checks straightforward in tests,
  // but production access uses the preload value when available.
  if (env?.faceShooterDesktop?.platform) {
    return env.faceShooterDesktop.platform === "win32";
  }

  const userAgent = String(env?.navigator?.userAgent || "");
  const platform = String(env?.navigator?.platform || "");
  return /Electron/i.test(userAgent) && (/Windows/i.test(userAgent) || /Win/i.test(platform));
}

export function isFaceLimited(face = {}) {
  return face?.limited === true;
}

export function createLimitedFaceSkill() {
  return { level: 6, progress: 0, duplicateProgress: 0, totalKills: 0, tickets: 0 };
}

export function applyLimitedFaceSkill(face = {}) {
  if (!isFaceLimited(face)) return face?.skill;

  const current = face.skill && typeof face.skill === "object" ? face.skill : {};
  return {
    level: 6,
    progress: 0,
    duplicateProgress: 0,
    totalKills: Math.max(0, Number(current.totalKills) || 0),
    tickets: Math.max(0, Number(current.tickets) || 0)
  };
}
