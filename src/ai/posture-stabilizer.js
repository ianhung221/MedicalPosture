export function createPostureStabilizer({ windowSize = 15, initialState = 'GOOD' } = {}) {
  let history = []; let stableState = initialState;
  return {
    push(state) { history.push(state); if (history.length > windowSize) history.shift(); const counts = new Map(); history.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1)); const max = Math.max(...counts.values()); const tied = [...counts].filter(([, count]) => count === max).map(([value]) => value); stableState = tied.includes(stableState) ? stableState : tied[0]; return stableState; },
    reset(nextState = initialState) { history = []; stableState = nextState; }, getSnapshot() { return { stableState, history: [...history] }; },
  };
}
