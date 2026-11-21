/* 等级只由 meta.questionTotalAdded 推导；不另外存等级或进度。 */
const TITLES = ['起点', '破题新星', '探路者', '勤思者', '推演者', '精进者', '融会贯通', '举一反三', '知行合一'];

export function levelOf(total) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  return count === 0 ? 0 : 1 + Math.floor((count - 1) / 3);
}

export function levelInfo(total) {
  const count = Math.max(0, Math.floor(Number(total) || 0));
  const level = levelOf(count);
  const target = level === 0 ? 1 : 3;
  const progress = level === 0 ? 0 : (count - 1) % 3;
  return {
    count, level, title: TITLES[Math.min(level, TITLES.length - 1)],
    progress, target, remaining: target - progress,
  };
}
