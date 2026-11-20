import { auth, db } from "./firebase-config.js";
import { doc, getDoc, getDocs, collection, query, where, limit, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const rarities = ["N", "R", "SR", "SSR", "UR"];
const esc = value => String(value ?? "");
let panel, list, refreshButton;

function makePanel() {
  if (document.getElementById("communityReviewPanel")) return;
  panel = document.createElement("section");
  panel.id = "communityReviewPanel";
  panel.className = "panel";
  panel.innerHTML = '<div class="panel-heading"><div><p class="eyebrow">COMMUNITY</p><h2>🎭 投稿審査</h2></div><button id="reloadFaceReview" class="secondary" type="button">更新</button></div><div id="reviewList">読み込み中…</div>';
  // adminPanel is hidden during the admin.js initialization. Put this panel outside it.
  const main = document.querySelector("main.page");
  const adminPanel = document.getElementById("adminPanel");
  if (main && adminPanel) main.insertBefore(panel, adminPanel.nextSibling);
  else if (main) main.append(panel);
  else document.body.append(panel);
  list = panel.querySelector("#reviewList");
  refreshButton = panel.querySelector("#reloadFaceReview");
  refreshButton.addEventListener("click", load);
}

async function load() {
  if (!list) return;
  list.textContent = "申請を読み込み中…";
  try {
    const q = query(collection(db, "faceSubmissions"), where("status", "==", "pending"), limit(50));
    const snap = await getDocs(q);
    list.replaceChildren();
    for (const item of snap.docs) {
      const data = item.data();
      const card = document.createElement("article");
      card.style.cssText = "padding:12px;border:1px solid #445;margin:12px 0;border-radius:12px";
      const img = document.createElement("img");
      img.src = data.imageData || "";
      img.alt = "投稿画像";
      img.style.cssText = "max-width:200px;max-height:200px;display:block";
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "名前";
      const name = document.createElement("input");
      name.className = "n"; name.maxLength = 40; name.value = esc(data.name);
      nameLabel.append(name);
      const descLabel = document.createElement("label");
      descLabel.textContent = "説明";
      const desc = document.createElement("textarea");
      desc.className = "d"; desc.maxLength = 300; desc.value = esc(data.description);
      descLabel.append(desc);
      const rarityLabel = document.createElement("label");
      rarityLabel.textContent = "レア度";
      const rarity = document.createElement("select");
      rarity.className = "r";
      for (const r of rarities) { const opt = document.createElement("option"); opt.value = r; opt.textContent = r; rarity.append(opt); }
      rarity.value = "N";
      const approveBtn = document.createElement("button"); approveBtn.textContent = "承認して追加"; approveBtn.className = "primary"; approveBtn.type = "button";
      const rejectBtn = document.createElement("button"); rejectBtn.textContent = "却下"; rejectBtn.className = "danger"; rejectBtn.type = "button";
      const uid = document.createElement("small"); uid.textContent = "投稿UID: " + esc(data.uid);
      card.append(img,nameLabel,descLabel,rarityLabel,approveBtn,rejectBtn,uid);
      approveBtn.addEventListener("click", () => approve(item.id, data, card));
      rejectBtn.addEventListener("click", () => reject(item.id));
      list.append(card);
    }
    if (!snap.size) list.textContent = "未審査の申請はありません。";
  } catch (error) {
    console.error("コミュニティ申請読み込みエラー:", error);
    list.textContent = "申請の読み込みに失敗しました: " + (error.code || error.message || error);
  }
}

async function approve(id, original, card) {
  try {
    const name = card.querySelector(".n").value.trim();
    const description = card.querySelector(".d").value.trim();
    const rarity = card.querySelector(".r").value;
    if (!name) { alert("名前を入力してください。"); return; }
    const ref = doc(db, "adminSettings", "gameplay");
    const snap = await getDoc(ref);
    const settings = snap.exists() ? snap.data() : {};
    const faces = Array.isArray(settings.gachaFaces) ? settings.gachaFaces : [];
    if (faces.some(f => f.id === "community_" + id)) { alert("すでに追加されています。"); return; }
    await setDoc(ref, { ...settings, gachaFaces: [...faces, { id: "community_" + id, name, description, imageUrl: original.imageData, skillId: "face2", rarity, probability: 0, boosted: false, excludeFromGacha: false }], updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() });
    await updateDoc(doc(db, "faceSubmissions", id), { status: "approved", reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp(), approvedName: name, approvedDescription: description, approvedRarity: rarity });
    await load();
  } catch (error) { console.error(error); alert("承認に失敗しました: " + (error.code || error.message || error)); }
}

async function reject(id) {
  if (!confirm("この申請を却下しますか？")) return;
  try { await updateDoc(doc(db, "faceSubmissions", id), { status: "rejected", reviewedBy: auth.currentUser.uid, reviewedAt: serverTimestamp() }); await load(); }
  catch (error) { console.error(error); alert("却下に失敗しました: " + (error.code || error.message || error)); }
}

async function init() {
  await auth.authStateReady();
  if (!auth.currentUser) return;
  const admin = await getDoc(doc(db, "admins", auth.currentUser.uid));
  if (!admin.exists() || !["admin", "owner"].includes(admin.data().role)) return;
  makePanel();
  await load();
}
init().catch(error => { console.error("投稿審査の初期化エラー:", error); if (list) list.textContent = "初期化失敗: " + (error.code || error.message || error); });
