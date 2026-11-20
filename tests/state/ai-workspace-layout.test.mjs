import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI workspace preserves aligned video and canvas and places mobile controls before media', async () => {
  const css = await readFile(new URL('../../src/styles/pages.css', import.meta.url), 'utf8');
  assert.match(css, /\.ai-camera-stage video,\s*\.ai-camera-stage canvas\s*\{ transform: scaleX\(-1\)/);
  assert.match(css, /\.ai-camera-stage video,[\s\S]*?object-fit: contain/);
  assert.match(css, /\.detection-visual--ai \.ai-camera-stage \{ aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.live-status-panel \.session-controls \{ order: 2/);
  assert.match(css, /:has\(\.ai-live-visual\) \.live-status-panel \{ order: -1/);
});
