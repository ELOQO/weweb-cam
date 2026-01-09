<template>
  <div class="recorder">
    /**
    <video ref="previewEl" class="preview" autoplay playsinline muted></video>

    <div class="controls">
      <button :disabled="busy" @click="toggleRecording">
        {{ isRecording ? "Stop" : "Enregistrer" }}
      </button>

      <button :disabled="busy || !stream" @click="initCamera">
        Réinitialiser caméra
      </button>
      

      <span class="status">
        {{ status }}
      </span>
    </div>

    <hr />
    <h3>Vidéos stockées (IndexedDB)</h3>

    <div v-if="records.length === 0" class="empty">Aucune vidéo enregistrée.</div>

    <ul class="list">
      <li v-for="r in records" :key="r.id" class="item">
        <div class="meta">
          <div class="title">
            {{ new Date(r.createdAt).toLocaleString() }}
          </div>
          <div class="sub">
            {{ r.mimeType }} — {{ humanBytes(r.size) }}
          </div>
        </div>

        <div class="actions">
          <button @click="playRecord(r.id)">Lire</button>
          <button @click="downloadRecord(r.id)">Télécharger</button>
          <button @click="deleteRecord(r.id)">Supprimer</button>
        </div>
      </li>
    </ul>*/

    <div v-if="playUrl" class="player">
      <h4>Lecture</h4>
      <video class="playback" :src="playUrl" controls playsinline></video>
      <button class="close" @click="closePlayer">Fermer</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";

/**
 * --- State ---
 */
const previewEl = ref(null);

const stream = ref(null);
const recorder = ref(null);
const chunks = ref([]);

const isRecording = ref(false);
const busy = ref(false);
const status = ref("");

// Playback
const playUrl = ref(null);

// Records list
const records = ref([]);

/**
 * --- Helpers: mime type selection ---
 */
function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    // Safari 17+ may support mp4 recording in some cases, but it's inconsistent:
    "video/mp4"
  ];
  for (const t of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return ""; // Let the browser decide
}

/**
 * --- Camera init / cleanup ---
 */
async function initCamera() {
  busy.value = true;
  status.value = "Demande d'accès caméra/micro…";
  try {
    // Stop old stream if any
    stopStream();

    const s = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    stream.value = s;
    if (previewEl.value) {
      previewEl.value.srcObject = s;
    }
    status.value = "Caméra prête.";
  } catch (e) {
    console.error(e);
    status.value = "Accès caméra refusé ou indisponible.";
  } finally {
    busy.value = false;
  }
}

function stopStream() {
  if (stream.value) {
    for (const track of stream.value.getTracks()) track.stop();
    stream.value = null;
  }
  if (previewEl.value) {
    previewEl.value.srcObject = null;
  }
}

/**
 * --- Recording ---
 */
async function startRecording() {
  if (!stream.value) {
    await initCamera();
    if (!stream.value) return;
  }

  busy.value = true;
  status.value = "Démarrage enregistrement…";
  chunks.value = [];

  try {
    const mimeType = pickMimeType();
    const r = new MediaRecorder(stream.value, mimeType ? { mimeType } : undefined);
    recorder.value = r;

    r.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.value.push(ev.data);
    };

    r.onstart = () => {
      isRecording.value = true;
      status.value = "Enregistrement…";
      busy.value = false;
    };

    r.onerror = (err) => {
      console.error(err);
      status.value = "Erreur pendant l'enregistrement.";
      isRecording.value = false;
      busy.value = false;
    };

    r.onstop = async () => {
      isRecording.value = false;
      busy.value = true;
      status.value = "Finalisation & sauvegarde…";

      try {
        const blob = new Blob(chunks.value, { type: r.mimeType || "video/webm" });
        await idbClearRecords();
        await idbAddRecord({
          createdAt: Date.now(),
          mimeType: blob.type || r.mimeType || "video/webm",
          size: blob.size,
          blob
        });
        await refreshRecords();
        status.value = "Vidéo sauvegardée dans le navigateur.";
      } catch (e) {
        console.error(e);
        status.value = "Impossible de sauvegarder la vidéo.";
      } finally {
        chunks.value = [];
        busy.value = false;
      }
    };

    // Start and request data chunks every second (keeps memory stable)
    r.start(1000);
  } catch (e) {
    console.error(e);
    status.value = "MediaRecorder indisponible (navigateur?).";
    busy.value = false;
  }
}

function stopRecording() {
  if (recorder.value && recorder.value.state !== "inactive") {
    status.value = "Arrêt…";
    recorder.value.stop();
  }
}

function toggleRecording() {
  if (busy.value) return;
  if (!isRecording.value) startRecording();
  else stopRecording();
}

/**
 * --- IndexedDB persistence ---
 * DB: "webcam-recorder-db"
 * Store: "records" (keyPath autoIncrement "id")
 */
const DB_NAME = "webcam-recorder-db";
const DB_VERSION = 1;
const STORE = "records";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAddRecord(record) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.objectStore(STORE).add(record);
  });
}

async function idbClearRecords() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function idbGetAllRecords() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      // newest first
      resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function idbGetRecord(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function idbDeleteRecord(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * --- Records UI actions ---
 */
async function refreshRecords() {
  records.value = await idbGetAllRecords();
}

async function playRecord(id) {
  const rec = await idbGetRecord(id);
  if (!rec) return;

  // cleanup previous object URL
  if (playUrl.value) URL.revokeObjectURL(playUrl.value);

  playUrl.value = URL.createObjectURL(rec.blob);
}

async function downloadRecord(id) {
  const rec = await idbGetRecord(id);
  if (!rec) return;

  const url = URL.createObjectURL(rec.blob);
  const a = document.createElement("a");
  const ext = rec.mimeType.includes("mp4") ? "mp4" : "webm";
  a.href = url;
  a.download = `webcam-${new Date(rec.createdAt).toISOString().replaceAll(":", "-")}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function deleteRecord(id) {
  await idbDeleteRecord(id);
  await refreshRecords();
  // if the currently playing one is removed, just close player (simple approach)
  closePlayer();
}

function closePlayer() {
  if (playUrl.value) URL.revokeObjectURL(playUrl.value);
  playUrl.value = null;
}

/**
 * --- Misc ---
 */
function humanBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

onMounted(async () => {
  // Load existing records first
  await refreshRecords();

  // Init camera
  if (navigator.mediaDevices?.getUserMedia) {
    initCamera();
  } else {
    status.value = "getUserMedia non supporté par ce navigateur.";
  }
});

onBeforeUnmount(() => {
  // Stop recording if leaving
  try {
    if (recorder.value && recorder.value.state !== "inactive") recorder.value.stop();
  } catch {}

  closePlayer();
  stopStream();
});
</script>

<style scoped>
.recorder {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial;
}

.preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111;
  border-radius: 12px;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
  flex-wrap: wrap;
}

.controls button {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
}

.controls button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status {
  opacity: 0.75;
}

.list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  gap: 10px;
}

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 10px 12px;
}

.meta .title {
  font-weight: 600;
}

.meta .sub {
  font-size: 12px;
  opacity: 0.7;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.actions button {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
}

.player {
  margin-top: 16px;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 12px;
}

.playback {
  width: 100%;
  border-radius: 12px;
  background: #111;
}

.close {
  margin-top: 10px;
}
.empty {
  opacity: 0.7;
  font-size: 14px;
}
</style>
