import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadRelativeGuideGeometry, deriveHeadVisualMetrics, deriveGuideScreenLayout, placeGuideLabels } from '../../src/imu/imu-spatial-guides.js';

const metrics = deriveHeadVisualMetrics({min:{x:-1.519,y:-.757,z:-.729},max:{x:1.519,y:1.443,z:.729}});
test('outer shell has shared midpoints, crown clearance, forward-only yaw and scale-relative geometry', () => {
  const g = createHeadRelativeGuideGeometry(metrics);
  for (const axis of ['pitch','roll','yaw']) assert.deepEqual(g[axis].positive.points[0],g[axis].negative.points[0]);
  assert.ok(g.roll.positive.points[0][1] > metrics.headBottom + metrics.headHeight);
  assert.ok(g.pitch.positive.points[0][0] < metrics.pivot.x - metrics.headWidth / 2);
  assert.ok(g.yaw.positive.points[0][2] > metrics.pivot.z + metrics.headDepth / 2);
  for (const half of Object.values(g.yaw)) for (const p of half.points) assert.ok(p[2] > metrics.pivot.z);
  const scaled = Object.fromEntries(Object.entries(metrics).map(([key,value]) => [key, typeof value==='number' ? value*2 : Object.fromEntries(Object.entries(value).map(([a,v])=>[a,v*2]))]));
  const twice = createHeadRelativeGuideGeometry(scaled);
  for (const axis of ['pitch','roll','yaw']) for (const direction of ['positive','negative']) {
    assert.deepEqual(twice[axis][direction].points,g[axis][direction].points.map(p=>p.map(v=>v*2)));
  }
});
test('base includes both entire halves with one move; emphasis does not replace the base', () => {
  const layout = deriveGuideScreenLayout(390,480);
  for (const guide of Object.values(layout.guides)) {
    assert.equal((guide.basePath.match(/M /g)||[]).length,1);
    assert.equal((guide.basePath.match(/L /g)||[]).length,48);
    assert.equal((guide.positivePath.match(/L /g)||[]).length,24);
    assert.equal((guide.negativePath.match(/L /g)||[]).length,24);
  }
});
test('label candidates avoid head, strokes, arrow tips and each other when nearby space exists', () => {
  const hull=[{x:120,y:100},{x:260,y:100},{x:260,y:300},{x:120,y:300}];
  const guides={
    pitch:{anchor:{x:120,y:210}, samples:[{x:120,y:210}],ends:[{x:110,y:210}]},
    roll:{anchor:{x:190,y:100},samples:[{x:190,y:100}],ends:[]},
    yaw:{anchor:{x:260,y:210},samples:[{x:260,y:210}],ends:[{x:270,y:210}]},
  };
  const labels=placeGuideLabels(guides,390,480,hull);
  assert.ok(labels.pitch.x < 90);
  assert.ok(labels.roll.y < 80);
  assert.ok(labels.yaw.x > 290);
  const previous={guides:Object.fromEntries(Object.entries(labels).map(([axis,label])=>[axis,{label}]))};
  assert.deepEqual(placeGuideLabels(guides,390,480,hull,previous),labels);
  const moved=Object.fromEntries(Object.entries(guides).map(([axis,g])=>[axis,{...g,anchor:{x:g.anchor.x+.1,y:g.anchor.y+.1}}]));
  const next=placeGuideLabels(moved,390,480,hull,previous);
  for (const axis of Object.keys(labels)) {
    assert.equal(next[axis].candidate,labels[axis].candidate);
    assert.ok(Math.hypot(next[axis].x-labels[axis].x,next[axis].y-labels[axis].y)<1);
  }
});
