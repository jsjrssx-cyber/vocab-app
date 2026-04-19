let currentWords = [];
let currentIndex = 0;
let reviewWords = [];
let reviewIndex = 0;
let dailyCount = 50;
let learnGeneration = 0;
let currentBook = 'zhongkao';
let currentJbyqUnit = null;

document.addEventListener('DOMContentLoaded', async () => {
  dailyCount = await getSetting('dailyCount', 50);
  const countInput = document.getElementById('setting-daily-count');
  if (countInput) countInput.value = dailyCount;
  currentBook = await getSelectedBook();
  currentJbyqUnit = await getSetting('jbyqUnit', null);
  updateBookButtons();
  initNavigation();
  initHome();
  initLearn();
  initReview();
  initWordList();
  initStats();
  initSettings();
  initHardReview();
  updateHome();
});

function updateBookButtons() {
  document.getElementById('btn-book-zhongkao').classList.toggle('active', currentBook === 'zhongkao');
  document.getElementById('btn-book-jbyq').classList.toggle('active', currentBook === 'jbyq');
  const unitSwitch = document.getElementById('jbyq-unit-switch');
  unitSwitch.style.display = currentBook === 'jbyq' ? 'flex' : 'none';
  document.getElementById('btn-unit-3').classList.toggle('active', currentJbyqUnit === '第三单元');
  document.getElementById('btn-unit-4').classList.toggle('active', currentJbyqUnit === '第四单元');
}

function getActiveWordData() {
  const allData = getAllWordData();
  let groups;
  if (currentBook === 'jbyq') groups = BOOK_GROUPS.jbyq;
  else groups = BOOK_GROUPS.zhongkao;
  const filtered = {};
  groups.forEach(key => {
    if (allData[key]) {
      if (currentBook === 'jbyq' && currentJbyqUnit) {
        const unitData = {};
        if (allData[key][currentJbyqUnit]) unitData[currentJbyqUnit] = allData[key][currentJbyqUnit];
        filtered[key] = unitData;
      } else {
        filtered[key] = allData[key];
      }
    }
  });
  return filtered;
}

function getActiveWordList() {
  const data = getActiveWordData();
  const list = [];
  for (const units of Object.values(data)) {
    for (const [unitName, words] of Object.entries(units)) {
      words.forEach(w => list.push({ ...w, unitKey: unitName }));
    }
  }
  return list;
}

// Navigation
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      showPage('page-' + page);
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (page === 'home') updateHome();
      if (page === 'stats') updateStats();
      if (page === 'wordlist') renderWordList();
    });
  });
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  const bottomNav = document.querySelector('.bottom-nav');
  const noNavPages = ['page-learn', 'page-review', 'page-unit-words', 'page-hard-words', 'page-hard-learn'];
  bottomNav.style.display = noNavPages.includes(pageId) ? 'none' : 'flex';
}

// Home
function initHome() {
  document.getElementById('btn-start-learn').addEventListener('click', startLearn);
  document.getElementById('card-review').addEventListener('click', showHardWordsPage);
  document.getElementById('btn-book-zhongkao').addEventListener('click', async () => {
    currentBook = 'zhongkao';
    await setSelectedBook(currentBook);
    updateBookButtons();
    updateHome();
  });
  document.getElementById('btn-book-jbyq').addEventListener('click', async () => {
    currentBook = 'jbyq';
    await setSelectedBook(currentBook);
    updateBookButtons();
    updateHome();
  });
  document.getElementById('btn-unit-3').addEventListener('click', async () => {
    currentJbyqUnit = '第三单元';
    await saveSetting('jbyqUnit', currentJbyqUnit);
    updateBookButtons();
    updateHome();
  });
  document.getElementById('btn-unit-4').addEventListener('click', async () => {
    currentJbyqUnit = '第四单元';
    await saveSetting('jbyqUnit', currentJbyqUnit);
    updateBookButtons();
    updateHome();
  });
}

async function updateHome() {
  const allProgress = await getAllProgress();
  const activeWords = getActiveWordList();
  const learnedWords = new Set(allProgress.map(p => p.word));
  const newWords = activeWords.filter(w => !learnedWords.has(w.word)).slice(0, dailyCount);
  const dueWords = allProgress.filter(p => p.nextReview && p.nextReview <= Date.now() && p.stage < EBBINGHAUS_INTERVALS.length);
  const streak = await getStreak();
  const totalWords = activeWords.length;
  const learnedCount = allProgress.filter(p => activeWords.some(w => w.word === p.word)).length;

  document.getElementById('today-new').textContent = Math.min(newWords.length, dailyCount);
  const hardWords = await getAllHardWords();
  document.getElementById('today-review').textContent = hardWords.length;
  document.getElementById('streak-days').textContent = streak;
  document.getElementById('total-progress-text').textContent = `${learnedCount} / ${totalWords}`;
  document.getElementById('total-progress-fill').style.width = totalWords > 0 ? `${(learnedCount / totalWords * 100).toFixed(1)}%` : '0%';
}

const MS_PER_SYLLABLE = 500;
const TTS_URL = 'https://dict.youdao.com/dictvoice?audio=';
let _currentAudio = null;
let _durationCache = {};

function ttsUrl(word) {
  return TTS_URL + encodeURIComponent(word) + '&type=2';
}

function speakWord(word) {
  return new Promise(resolve => {
    if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
    const audio = new Audio(ttsUrl(word));
    _currentAudio = audio;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
    setTimeout(finish, 3000);
  });
}

function stopSpeech() {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function preloadAudio(word) {
  return new Promise(resolve => {
    const audio = new Audio(ttsUrl(word));
    const ready = () => {
      if (audio.duration && isFinite(audio.duration)) {
        _durationCache[word] = audio.duration * 1000;
      }
      resolve(audio);
    };
    audio.oncanplaythrough = ready;
    audio.onerror = ready;
    setTimeout(() => resolve(audio), 3000);
    audio.load();
  });
}

async function playWithHighlight(word, syllableSpans, gen, generation) {
  if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }

  const wordStr = word.word;
  const syllCount = (word.syllables || [wordStr]).length;
  const durationMs = _durationCache[wordStr] || (syllCount * MS_PER_SYLLABLE);
  const perSyllable = durationMs / syllCount;

  const audio = new Audio(ttsUrl(wordStr));
  _currentAudio = audio;
  audio.play().catch(() => {});

  for (let i = 0; i < syllCount; i++) {
    syllableSpans.forEach(s => s.classList.remove('active'));
    syllableSpans[i].classList.add('active');
    await delay(perSyllable);
    if (gen !== generation) return;
  }
  syllableSpans.forEach(s => s.classList.remove('active'));

  await new Promise(r => { audio.onended = r; setTimeout(r, 2000); });
}

// Learn Mode
function initLearn() {
  document.getElementById('btn-learn-back').addEventListener('click', () => {
    stopSpeech();
    learnGeneration++;
    showPage('page-home');
  });
  document.getElementById('btn-next-word').addEventListener('click', () => nextLearnWord(false));
  document.getElementById('btn-mark-hard').addEventListener('click', () => nextLearnWord(true));

  document.getElementById('meaning-area').addEventListener('click', (e) => {
    if (e.target.closest('.example')) return;
  });
}

async function startLearn() {
  const activeWords = getActiveWordList();
  const allProgress = await getAllProgress();
  const learnedWords = new Set(allProgress.map(p => p.word));
  currentWords = activeWords.filter(w => !learnedWords.has(w.word)).slice(0, dailyCount);
  if (currentWords.length === 0) {
    alert('今日新词已学完！请复习旧词或明天再来。');
    return;
  }
  currentIndex = 0;
  learnGeneration++;
  showPage('page-learn');
  showCurrentLearnWord();
}

async function showCurrentLearnWord() {
  const gen = learnGeneration;
  const word = currentWords[currentIndex];
  document.getElementById('learn-counter').textContent = `${currentIndex + 1} / ${currentWords.length}`;
  document.getElementById('btn-next-word').style.display = 'none';
  document.getElementById('btn-mark-hard').style.display = 'none';
  document.getElementById('meaning-area').style.display = 'none';
  document.getElementById('tap-hint').style.display = 'none';

  // 音标始终显示
  document.getElementById('word-phonetic-top').textContent = word.phonetic;

  // 单词始终完整显示，按音节分组用span包裹
  const fullEl = document.getElementById('word-full');
  fullEl.style.display = 'flex';
  fullEl.innerHTML = '';

  const syllableSpans = [];
  word.syllables.forEach((syl) => {
    const span = document.createElement('span');
    span.className = 'syllable-block';
    span.textContent = syl;
    fullEl.appendChild(span);
    syllableSpans.push(span);
  });

  await delay(200);
  if (gen !== learnGeneration) return;

  // 预加载音频并缓存时长
  await preloadAudio(word.word);
  if (gen !== learnGeneration) return;

  // 播放3遍，每遍带音节高亮
  for (let play = 0; play < 3; play++) {
    await playWithHighlight(word, syllableSpans, gen, learnGeneration);
    if (gen !== learnGeneration) return;
    if (play < 2) await delay(300);
    if (gen !== learnGeneration) return;
  }

  // 显示 Next 按钮 + 标记按钮 + 点击查看释义提示
  document.getElementById('btn-next-word').style.display = 'block';
  document.getElementById('btn-mark-hard').style.display = 'block';
  document.getElementById('tap-hint').style.display = 'block';

  // 清理旧监听器
  const tapHint = document.getElementById('tap-hint');
  const wordFull = document.getElementById('word-full');
  tapHint.replaceWith(tapHint.cloneNode(true));
  wordFull.replaceWith(wordFull.cloneNode(true));

  // 重新获取清理后的元素引用
  const newTapHint = document.getElementById('tap-hint');
  const newWordFull = document.getElementById('word-full');

  // 点击单词/提示 → 显示释义
  const tapHandler = () => {
    newTapHint.style.display = 'none';
    document.getElementById('word-meaning').textContent = word.meaning;
    document.getElementById('word-example').textContent = word.example || '';
    document.getElementById('meaning-area').style.display = 'block';
    newTapHint.removeEventListener('click', tapHandler);
    newWordFull.removeEventListener('click', tapHandler);
  };

  newTapHint.addEventListener('click', tapHandler);
  newWordFull.addEventListener('click', tapHandler);
}

async function nextLearnWord(markHard) {
  stopSpeech();
  learnGeneration++;
  const word = currentWords[currentIndex];
  const progress = createProgress(word.word, word.unitKey || '');
  await saveWordProgress(progress);

  if (markHard) {
    await addHardWord(word);
  }

  const stats = await getDailyStats();
  stats.learned++;
  await saveDailyStats(stats);

  currentIndex++;
  if (currentIndex < currentWords.length) {
    showCurrentLearnWord();
  } else {
    alert(`太棒了！今日 ${currentWords.length} 个新词已学完！`);
    showPage('page-home');
    updateHome();
  }
}

// Review Mode
function initReview() {
  document.getElementById('btn-review-back').addEventListener('click', () => {
    showPage('page-home');
  });
  document.getElementById('btn-review-next').addEventListener('click', nextReviewWord);
}

async function startReview() {
  reviewWords = await getWordsDueForReview();
  if (reviewWords.length === 0) {
    alert('暂无需要复习的单词！');
    return;
  }
  reviewIndex = 0;
  showPage('page-review');
  showCurrentReviewWord();
}

async function showCurrentReviewWord() {
  const progress = reviewWords[reviewIndex];
  const wordData = findWord(progress.word);
  if (!wordData) { reviewIndex++; if (reviewIndex < reviewWords.length) showCurrentReviewWord(); return; }

  document.getElementById('review-counter').textContent = `${reviewIndex + 1} / ${reviewWords.length}`;
  document.getElementById('review-word').textContent = wordData.word;
  document.getElementById('review-phonetic').textContent = wordData.phonetic;
  document.getElementById('btn-review-next').style.display = 'none';
  document.getElementById('review-result').style.display = 'none';

  const optionsEl = document.getElementById('review-options');
  optionsEl.innerHTML = '';

  const correctMeaning = wordData.meaning;
  const allMeanings = getAllWordList()
    .map(w => w.meaning)
    .filter(m => m !== correctMeaning);
  const shuffled = allMeanings.sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [...shuffled, correctMeaning].sort(() => Math.random() - 0.5);

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'review-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => handleReviewAnswer(btn, opt, correctMeaning, progress));
    optionsEl.appendChild(btn);
  });

  speakWord(wordData.word);
}

async function handleReviewAnswer(btn, selected, correct, progress) {
  const options = document.querySelectorAll('.review-option');
  options.forEach(opt => {
    opt.style.pointerEvents = 'none';
    if (opt.textContent === correct) opt.classList.add('correct');
  });

  const resultEl = document.getElementById('review-result');
  resultEl.style.display = 'block';

  if (selected === correct) {
    btn.classList.add('correct');
    resultEl.textContent = '回答正确！';
    resultEl.className = 'review-result correct-text';
    markCorrect(progress);
  } else {
    btn.classList.add('wrong');
    resultEl.textContent = `正确答案：${correct}`;
    resultEl.className = 'review-result wrong-text';
    markWrong(progress);
  }

  await saveWordProgress(progress);
  const stats = await getDailyStats();
  stats.reviewed++;
  stats.total++;
  if (selected === correct) stats.correct++;
  await saveDailyStats(stats);

  if (selected === correct) {
    // 答对：显示正确特效后自动跳下一个
    await delay(800);
    nextReviewWord();
  } else {
    // 答错：停留让用户记住正确答案
    document.getElementById('btn-review-next').style.display = 'block';
  }
}

async function nextReviewWord() {
  reviewIndex++;
  if (reviewIndex < reviewWords.length) {
    showCurrentReviewWord();
  } else {
    alert(`复习完成！共复习 ${reviewWords.length} 个单词。`);
    showPage('page-home');
    updateHome();
  }
}

// Hard Words
let hardLearnWords = [];
let hardLearnIndex = 0;
let hardLearnGen = 0;

function initHardReview() {
  document.getElementById('btn-hard-words-back').addEventListener('click', () => {
    showPage('page-home');
    updateHome();
  });
  document.getElementById('btn-hard-learn-back').addEventListener('click', () => {
    stopSpeech();
    hardLearnGen++;
    showPage('page-hard-words');
    renderHardWordsList();
  });
  document.getElementById('btn-hard-next').addEventListener('click', () => nextHardLearnWord(false));
  document.getElementById('btn-hard-got-it').addEventListener('click', () => nextHardLearnWord(true));
}

async function showHardWordsPage() {
  const hardWords = await getAllHardWords();
  if (hardWords.length === 0) {
    alert('没有未掌握的单词！');
    return;
  }
  renderHardWordsList();
  showPage('page-hard-words');
}

async function renderHardWordsList() {
  const hardWords = await getAllHardWords();
  const listEl = document.getElementById('hard-words-list');
  listEl.innerHTML = '';

  hardWords.forEach((hw, idx) => {
    const wordData = findWord(hw.word);
    const displayWord = wordData || hw;
    const item = document.createElement('div');
    item.className = 'word-item';
    item.innerHTML = `
      <div class="word-item-left">
        <div class="word-item-word">${displayWord.word}</div>
        <div class="word-item-phonetic">${displayWord.phonetic || ''}</div>
      </div>
      <div class="word-item-meaning">${displayWord.meaning}</div>
    `;
    item.addEventListener('click', () => {
      hardLearnWords = hardWords.map(h => findWord(h.word) || h);
      hardLearnIndex = idx;
      hardLearnGen++;
      showPage('page-hard-learn');
      showCurrentHardLearnWord();
    });
    listEl.appendChild(item);
  });
}

async function showCurrentHardLearnWord() {
  const gen = hardLearnGen;
  const word = hardLearnWords[hardLearnIndex];

  document.getElementById('hard-learn-counter').textContent = `${hardLearnIndex + 1} / ${hardLearnWords.length}`;
  document.getElementById('btn-hard-next').style.display = 'none';
  document.getElementById('btn-hard-got-it').style.display = 'none';
  document.getElementById('hard-meaning-area').style.display = 'none';
  document.getElementById('hard-tap-hint').style.display = 'none';

  document.getElementById('hard-phonetic-top').textContent = word.phonetic || '';

  const fullEl = document.getElementById('hard-word-full');
  fullEl.style.display = 'flex';
  fullEl.innerHTML = '';

  const syllableSpans = (word.syllables || [word.word]).map(syl => {
    const span = document.createElement('span');
    span.className = 'syllable-block';
    span.textContent = syl;
    fullEl.appendChild(span);
    return span;
  });

  await delay(200);
  if (gen !== hardLearnGen) return;

  // 预加载音频并缓存时长
  await preloadAudio(word.word);
  if (gen !== hardLearnGen) return;

  // 播放3遍，每遍带音节高亮
  for (let play = 0; play < 3; play++) {
    await playWithHighlight(word, syllableSpans, gen, hardLearnGen);
    if (gen !== hardLearnGen) return;
    if (play < 2) await delay(300);
    if (gen !== hardLearnGen) return;
  }

  document.getElementById('btn-hard-next').style.display = 'block';
  document.getElementById('btn-hard-got-it').style.display = 'block';
  document.getElementById('hard-tap-hint').style.display = 'block';

  const tapHint = document.getElementById('hard-tap-hint');
  const wordFull = document.getElementById('hard-word-full');
  tapHint.replaceWith(tapHint.cloneNode(true));
  wordFull.replaceWith(wordFull.cloneNode(true));

  const newTapHint = document.getElementById('hard-tap-hint');
  const newWordFull = document.getElementById('hard-word-full');

  const tapHandler = () => {
    newTapHint.style.display = 'none';
    document.getElementById('hard-meaning').textContent = word.meaning;
    document.getElementById('hard-example').textContent = word.example || '';
    document.getElementById('hard-meaning-area').style.display = 'block';
    newTapHint.removeEventListener('click', tapHandler);
    newWordFull.removeEventListener('click', tapHandler);
  };
  newTapHint.addEventListener('click', tapHandler);
  newWordFull.addEventListener('click', tapHandler);
}

async function nextHardLearnWord(mastered) {
  stopSpeech();
  hardLearnGen++;
  const word = hardLearnWords[hardLearnIndex];
  if (mastered) {
    await removeHardWord(word.word);
  }
  hardLearnIndex++;
  if (hardLearnIndex < hardLearnWords.length) {
    showCurrentHardLearnWord();
  } else {
    alert('未掌握单词复习完毕！');
    showPage('page-home');
    updateHome();
  }
}

// Word List
function initWordList() {
  document.getElementById('btn-unit-back').addEventListener('click', () => {
    showPage('page-wordlist');
  });
}

function renderWordList() {
  const listEl = document.getElementById('unit-list');
  listEl.innerHTML = '';

  const gradeNames = {
    '7a': '七年级上册', '7b': '七年级下册',
    '8a': '八年级上册', '8b': '八年级下册',
    '9': '九年级全一册', 'zk': '中考考纲',
    'jbyq': '基本要求'
  };

  const allData = getActiveWordData();

  Object.entries(allData).forEach(([gradeKey, units]) => {
    const group = document.createElement('div');
    group.className = 'unit-group';
    group.innerHTML = `<div class="unit-group-title">${gradeNames[gradeKey] || gradeKey}</div>`;

    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'unit-cards';

    Object.entries(units).forEach(([unitName, words]) => {
      const card = document.createElement('div');
      card.className = 'unit-card';
      card.innerHTML = `
        <div class="unit-card-title">${unitName}</div>
        <div class="unit-card-info">${words.length} 词</div>
        <div class="unit-progress-bar"><div class="unit-progress-fill" style="width:0%"></div></div>
      `;
      card.addEventListener('click', () => showUnitWords(gradeKey, unitName, words));
      cardsDiv.appendChild(card);
    });

    group.appendChild(cardsDiv);
    listEl.appendChild(group);
  });

  updateUnitProgress();
}

async function updateUnitProgress() {
  const allProgress = await getAllProgress();
  const progressMap = {};
  allProgress.forEach(p => { progressMap[p.word] = p; });

  document.querySelectorAll('.unit-card').forEach(card => {
    const title = card.querySelector('.unit-card-title').textContent;
    const unitWords = findWordsByUnit(title);
    if (!unitWords) return;
    const learned = unitWords.filter(w => progressMap[w.word]).length;
    const pct = (learned / unitWords.length * 100).toFixed(0);
    card.querySelector('.unit-progress-fill').style.width = pct + '%';
    card.querySelector('.unit-card-info').textContent = `${learned}/${unitWords.length} 词`;
  });
}

async function showUnitWords(gradeKey, unitName, words) {
  document.getElementById('unit-title').textContent = unitName;
  const listEl = document.getElementById('unit-words-list');
  listEl.innerHTML = '';

  const allProgress = await getAllProgress();
  const progressMap = {};
  allProgress.forEach(p => { progressMap[p.word] = p; });

  words.forEach(w => {
    const progress = progressMap[w.word];
    let statusText = '未学';
    let statusClass = 'new';
    if (progress) {
      if (isMastered(progress)) { statusText = '已掌握'; statusClass = 'mastered'; }
      else { statusText = '学习中'; statusClass = 'learning'; }
    }

    const item = document.createElement('div');
    item.className = 'word-item';
    item.innerHTML = `
      <div class="word-item-left">
        <div class="word-item-word">${w.word}</div>
        <div class="word-item-phonetic">${w.phonetic}</div>
      </div>
      <div class="word-item-meaning">${w.meaning}</div>
      <span class="word-item-status ${statusClass}">${statusText}</span>
    `;
    item.addEventListener('click', () => {
      speakWord(w.word);
    });
    listEl.appendChild(item);
  });

  showPage('page-unit-words');
}

// Stats
function initStats() {}

async function updateStats() {
  const allProgress = await getAllProgress();
  const mastered = allProgress.filter(p => isMastered(p)).length;
  const totalReviews = allProgress.reduce((s, p) => s + (p.reviewCount || 0), 0);
  const totalCorrect = allProgress.reduce((s, p) => s + (p.correctCount || 0), 0);
  const accuracy = totalReviews > 0 ? Math.round(totalCorrect / totalReviews * 100) : 0;
  const streak = await getStreak();
  const stats = await getDailyStats();

  const totalDays = await getTotalDays();

  document.getElementById('stats-total').textContent = allProgress.length;
  document.getElementById('stats-mastered').textContent = mastered;
  document.getElementById('stats-accuracy').textContent = accuracy + '%';
  document.getElementById('stats-today-learned').textContent = stats.learned + ' 词';
  document.getElementById('stats-today-reviewed').textContent = stats.reviewed + ' 词';
  document.getElementById('stats-streak').textContent = streak + ' 天';
  document.getElementById('stats-total-days').textContent = totalDays + ' 天';
}

async function getTotalDays() {
  const allProgress = await getAllProgress();
  if (allProgress.length === 0) return 0;
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('dailyStats', 'readonly');
    const store = tx.objectStore('dailyStats');
    const req = store.getAll();
    req.onsuccess = () => {
      const stats = (req.result || []).filter(s => s.learned > 0 || s.reviewed > 0);
      resolve(stats.length);
    };
    req.onerror = () => reject(req.error);
  });
}

// Settings
function initSettings() {
  document.getElementById('setting-daily-count').addEventListener('change', async (e) => {
    const val = parseInt(e.target.value);
    if (val > 0) {
      dailyCount = val;
      await saveSetting('dailyCount', dailyCount);
    }
  });
  document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('确定要重置所有学习数据吗？')) return;
    if (!confirm('再次确认：所有学习进度、复习记录、未掌握标记将被清空，此操作不可撤销。确定吗？')) return;
    await resetAllData();
    alert('学习数据已重置。');
    updateHome();
  });
}

// Word helper functions defined in storage.js:
// findWord, findWordsByUnit, getAllWordList, getWordsByUnit, getAllWordData

// Service Worker Registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
