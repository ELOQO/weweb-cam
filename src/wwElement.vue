<template>
  <div class="player">
    <h4>Lecture</h4>
    <video v-if="playUrl" class="playback" :src="playUrl" controls playsinline></video>
    <div v-else class="empty">{{ status }}</div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";

const playUrl = ref(null);
const status = ref("Chargement...");

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

async function idbGetAllRecords() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function loadLatestRecord() {
  try {
    const all = await idbGetAllRecords();
    const rec = all[0];
    if (!rec) {
      status.value = "Aucune video enregistree.";
      return;
    }
    if (playUrl.value) URL.revokeObjectURL(playUrl.value);
    playUrl.value = URL.createObjectURL(rec.blob);
    status.value = "";
  } catch (e) {
    console.error(e);
    status.value = "Impossible de charger la video.";
  }
}

onMounted(loadLatestRecord);

onBeforeUnmount(() => {
  if (playUrl.value) URL.revokeObjectURL(playUrl.value);
});
</script>

<style scoped>
.player {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial;
}

.playback {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  background: #111;
}

.empty {
  margin-top: 8px;
  opacity: 0.7;
  font-size: 14px;
}
</style>
