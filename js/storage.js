const DB_NAME = 'VocabApp';
const DB_VERSION = 2;

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('wordProgress')) {
        const store = database.createObjectStore('wordProgress', { keyPath: 'word' });
        store.createIndex('nextReview', 'nextReview', { unique: false });
        store.createIndex('unitKey', 'unitKey', { unique: false });
      }
      if (!database.objectStoreNames.contains('dailyStats')) {
        database.createObjectStore('dailyStats', { keyPath: 'date' });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('hardWords')) {
        database.createObjectStore('hardWords', { keyPath: 'word' });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getWordProgress(word) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('wordProgress', 'readonly');
    const store = tx.objectStore('wordProgress');
    const req = store.get(word);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function addHardWord(wordData) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('hardWords', 'readwrite');
    const store = tx.objectStore('hardWords');
    const req = store.put({ word: wordData.word, phonetic: wordData.phonetic, meaning: wordData.meaning, addedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function removeHardWord(word) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('hardWords', 'readwrite');
    const store = tx.objectStore('hardWords');
    const req = store.delete(word);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllHardWords() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('hardWords', 'readonly');
    const store = tx.objectStore('hardWords');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getAllProgress() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('wordProgress', 'readonly');
    const store = tx.objectStore('wordProgress');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function saveWordProgress(progress) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('wordProgress', 'readwrite');
    const store = tx.objectStore('wordProgress');
    const req = store.put(progress);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getAllWordData() {
  const data = {};
  if (typeof WORDS_ZHONGKAO !== 'undefined') data['zk'] = WORDS_ZHONGKAO;
  if (typeof WORDS_JBYQ !== 'undefined') data['jbyq'] = WORDS_JBYQ;
  return data;
}

const BOOK_LABELS = {
  'zk': '中考考纲', 'jbyq': '基本要求'
};

const BOOK_GROUPS = {
  zhongkao: ['zk'],
  jbyq: ['jbyq']
};

async function getSelectedBook() {
  return await getSetting('selectedBook', 'zhongkao');
}

async function setSelectedBook(book) {
  await saveSetting('selectedBook', book);
}

function getAllWordList() {
  const allData = getAllWordData();
  const list = [];
  for (const units of Object.values(allData)) {
    for (const [unitName, words] of Object.entries(units)) {
      words.forEach(w => list.push({ ...w, unitKey: unitName }));
    }
  }
  return list;
}

function getWordsByUnit(unitKey) {
  const allData = getAllWordData();
  for (const units of Object.values(allData)) {
    if (units[unitKey]) return units[unitKey];
  }
  return null;
}

function findWord(wordStr) {
  const allData = getAllWordData();
  for (const units of Object.values(allData)) {
    for (const words of Object.values(units)) {
      const found = words.find(w => w.word === wordStr);
      if (found) return found;
    }
  }
  return null;
}

function findWordsByUnit(unitName) {
  const allData = getAllWordData();
  for (const units of Object.values(allData)) {
    if (units[unitName]) return units[unitName];
  }
  return null;
}

async function getWordsDueForReview() {
  const allProgress = await getAllProgress();
  const now = Date.now();
  return allProgress.filter(p => p.nextReview && p.nextReview <= now && p.stage < EBBINGHAUS_INTERVALS.length);
}

async function getNewWords(unitKey, count) {
  const allProgress = await getAllProgress();
  const learnedWords = new Set(allProgress.map(p => p.word));
  const unitWords = getWordsByUnit(unitKey);
  if (!unitWords) return [];
  return unitWords.filter(w => !learnedWords.has(w.word)).slice(0, count);
}

async function getAllNewWords(count) {
  const allProgress = await getAllProgress();
  const learnedWords = new Set(allProgress.map(p => p.word));
  const allWords = getAllWordList();
  return allWords.filter(w => !learnedWords.has(w.word)).slice(0, count);
}

async function getDailyStats() {
  const database = await openDB();
  const today = new Date().toISOString().split('T')[0];
  return new Promise((resolve, reject) => {
    const tx = database.transaction('dailyStats', 'readonly');
    const store = tx.objectStore('dailyStats');
    const req = store.get(today);
    req.onsuccess = () => resolve(req.result || { date: today, learned: 0, reviewed: 0, correct: 0, total: 0 });
    req.onerror = () => reject(req.error);
  });
}

async function saveDailyStats(stats) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('dailyStats', 'readwrite');
    const store = tx.objectStore('dailyStats');
    const req = store.put(stats);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getSetting(key, defaultValue) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get(key);
    req.onsuccess = () => {
      if (req.result) resolve(req.result.value);
      else resolve(defaultValue);
    };
    req.onerror = () => reject(req.error);
  });
}

async function saveSetting(key, value) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getStreak() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('dailyStats', 'readonly');
    const store = tx.objectStore('dailyStats');
    const req = store.getAll();
    req.onsuccess = () => {
      const stats = req.result || [];
      if (stats.length === 0) { resolve(0); return; }
      const dates = stats.filter(s => s.learned > 0 || s.reviewed > 0).map(s => s.date).sort().reverse();
      if (dates.length === 0) { resolve(0); return; }
      let streak = 0;
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (dates[0] !== today && dates[0] !== yesterday) { resolve(0); return; }
      let checkDate = new Date(dates[0]);
      for (let i = 0; i < 365; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (dates.includes(dateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      resolve(streak);
    };
    req.onerror = () => reject(req.error);
  });
}

async function resetAllData() {
  const database = await openDB();
  const storeNames = ['wordProgress', 'dailyStats', 'hardWords'];
  for (const name of storeNames) {
    await new Promise((resolve, reject) => {
      const tx = database.transaction(name, 'readwrite');
      const store = tx.objectStore(name);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
