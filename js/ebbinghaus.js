const EBBINGHAUS_INTERVALS = [
  1 * 24 * 60 * 60 * 1000,   // 1天
  2 * 24 * 60 * 60 * 1000,   // 2天
  4 * 24 * 60 * 60 * 1000,   // 4天
  7 * 24 * 60 * 60 * 1000,   // 7天
  15 * 24 * 60 * 60 * 1000,  // 15天
  30 * 24 * 60 * 60 * 1000,  // 30天
];

function createProgress(word, unitKey) {
  return {
    word,
    unitKey,
    stage: 0,
    lastReview: Date.now(),
    nextReview: Date.now() + EBBINGHAUS_INTERVALS[0],
    reviewCount: 0,
    correctCount: 0,
  };
}

function markCorrect(progress) {
  progress.stage = Math.min(progress.stage + 1, EBBINGHAUS_INTERVALS.length);
  progress.lastReview = Date.now();
  progress.nextReview = Date.now() + (EBBINGHAUS_INTERVALS[progress.stage] || EBBINGHAUS_INTERVALS[EBBINGHAUS_INTERVALS.length - 1]);
  progress.reviewCount++;
  progress.correctCount++;
  return progress;
}

function markWrong(progress) {
  progress.stage = Math.max(0, progress.stage - 1);
  progress.lastReview = Date.now();
  progress.nextReview = Date.now() + (EBBINGHAUS_INTERVALS[progress.stage] || EBBINGHAUS_INTERVALS[0]);
  progress.reviewCount++;
  return progress;
}

function isMastered(progress) {
  return progress.stage >= EBBINGHAUS_INTERVALS.length;
}
