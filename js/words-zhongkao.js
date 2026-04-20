// 中考考纲词汇 — 合并 A-F / G-O / P-Z（加前缀避免分组名覆盖）
const WORDS_ZHONGKAO = {};
for (const [k, v] of Object.entries(WORDS_ZK_AF)) WORDS_ZHONGKAO['A-F ' + k] = v;
for (const [k, v] of Object.entries(WORDS_ZK_GO)) WORDS_ZHONGKAO['G-O ' + k] = v;
for (const [k, v] of Object.entries(WORDS_ZK_PZ)) WORDS_ZHONGKAO['P-Z ' + k] = v;
for (const [k, v] of Object.entries(WORDS_ZK_PHRASES)) WORDS_ZHONGKAO['词组 ' + k] = v;
