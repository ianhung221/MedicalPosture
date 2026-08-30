function average(values, key) { return values.reduce((total, value) => total + value[key], 0) / values.length; }
export function createLandmarkSmoother({ indices, windowSize = 20 } = {}) {
  if (!Array.isArray(indices) || !indices.length) throw new TypeError('indices 必須是非空陣列');
  if (!Number.isInteger(windowSize) || windowSize < 1) throw new TypeError('windowSize 必須是正整數');
  const histories = new Map(indices.map((index) => [index, []]));
  return {
    push(landmarks) {
      if (!Array.isArray(landmarks)) return null;
      if (indices.some((index) => !landmarks[index] || !Number.isFinite(landmarks[index].x) || !Number.isFinite(landmarks[index].y))) return null;
      const smoothed = {};
      for (const index of indices) {
        const point = landmarks[index];
        const history = histories.get(index); history.push({ x: point.x, y: point.y });
        if (history.length > windowSize) history.shift();
        smoothed[index] = { ...point, x: average(history, 'x'), y: average(history, 'y') };
      }
      return smoothed;
    },
    reset() { histories.forEach((history) => history.splice(0)); },
    size(index = indices[0]) { return histories.get(index)?.length || 0; },
  };
}
