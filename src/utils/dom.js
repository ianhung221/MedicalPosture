/** 避免重複撰寫 querySelector；找不到元素時明確失敗。 */
export function select(selector, parent = document) {
  const element = parent.querySelector(selector);
  if (!element) throw new Error(`找不到元素：${selector}`);
  return element;
}
