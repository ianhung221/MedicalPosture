export function resizeOverlay(canvas, video) {
  const width = video.videoWidth || 1280; const height = video.videoHeight || 720;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export function drawPoseOverlay(canvas, video, landmarks, connections = []) {
  if (!canvas || !video) return;
  resizeOverlay(canvas, video);
  const context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
  if (!Array.isArray(landmarks)) return;
  context.lineWidth = Math.max(2, canvas.width / 500); context.strokeStyle = 'rgba(15, 165, 154, .88)';
  for (const connection of connections) {
    if (!ALGORITHM_KEYPOINT_SET.has(connection.start) || !ALGORITHM_KEYPOINT_SET.has(connection.end)) continue;
    const start = landmarks[connection.start]; const end = landmarks[connection.end];
    if (!start || !end || (start.visibility ?? 1) < 0.35 || (end.visibility ?? 1) < 0.35) continue;
    context.beginPath(); context.moveTo(start.x * canvas.width, start.y * canvas.height); context.lineTo(end.x * canvas.width, end.y * canvas.height); context.stroke();
  }
  ALGORITHM_KEYPOINT_INDICES.forEach((index) => { const point = landmarks[index]; if (!point || (point.visibility ?? 1) < 0.35) return; context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, Math.PI * 2); context.fillStyle = '#18c777'; context.fill(); context.strokeStyle = 'rgba(15, 85, 78, .75)'; context.stroke(); });
}

export function clearPoseOverlay(canvas) { const context = canvas?.getContext?.('2d'); if (context) context.clearRect(0, 0, canvas.width, canvas.height); }
// Algorithm keypoint visualization: only landmarks used by the current classifier.
export const ALGORITHM_KEYPOINT_INDICES = Object.freeze([0, 7, 8, 11, 12, 15, 16]);
const ALGORITHM_KEYPOINT_SET = new Set(ALGORITHM_KEYPOINT_INDICES);
