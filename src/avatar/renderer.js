// Procedural SHODAN avatar: the portrait is drawn on canvas so the jaw, eyes, head and glitch
// effects can be animated from the voice. Shared by the main stage and the floating window.
export const FACE = Object.freeze({
  eyes: [[0.36, 0.475], [0.635, 0.475]],
  eyeRadius: [0.044, 0.021],
  upperLipTop: 0.718,
  seam: 0.758,
  lipBottom: 0.805,
  chinBottom: 0.915,
  neckAnchor: 0.958,
  mouthHalfWidth: 0.095,
  jawHalfWidth: 0.17,
  maxJaw: 0.032,
  pivot: [0.5, 0.86],
});

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Column boundaries: dense around the mouth, coarser toward the cheeks.
const COLUMNS = (() => {
  const columns = [];
  for (let u = 0.33; u < 0.4 - 1e-9; u += 0.01) columns.push(u);
  for (let u = 0.4; u < 0.6 - 1e-9; u += 0.005) columns.push(u);
  for (let u = 0.6; u <= 0.67 + 1e-9; u += 0.01) columns.push(u);
  return columns.map((u) => Math.round(u * 1000) / 1000);
})();
const UPPER_ROWS = [FACE.upperLipTop, 0.738, FACE.seam];
const LOWER_ROWS = [FACE.seam, 0.773, 0.789, FACE.lipBottom, FACE.chinBottom, FACE.neckAnchor];

const spriteCache = new WeakMap();

function makeCanvas(width, height, doc = document) {
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function buildSprites(image) {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const base = makeCanvas(width, height);
  const context = base.getContext('2d');
  // Pre-bake the original CSS look (contrast/saturation, 90% opacity over the stage colour).
  context.fillStyle = '#030906';
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 0.9;
  if ('filter' in context) context.filter = 'contrast(1.1) saturate(0.8)';
  context.drawImage(image, 0, 0);
  if ('filter' in context) context.filter = 'none';
  context.globalAlpha = 1;
  const tint = (color) => {
    const canvas = makeCanvas(Math.round(width / 2), Math.round(height / 2));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  };
  return { base, red: tint('#ff2a3c'), cyan: tint('#18f0ff'), width, height };
}

export function createAvatarRenderer({ image, reducedMotion = () => false, random = Math.random } = {}) {
  let sprites = null;
  const s = {
    last: 0,
    open: 0, wide: 0, round: 0, teeth: 0, energy: 0, prevEnergy: 0,
    nod: 0, nodVel: 0, hx: 0, hy: 0, rot: 0, scale: 1,
    joltX: 0, joltY: 0, joltUntil: 0,
    blinkStart: -1, nextBlink: 1.5 + random() * 3, pendingDouble: false, closure: 0,
    gaze: [0, 0], gazeTarget: [0, 0], nextSaccade: 0,
    burstUntil: 0, burstStrength: 0, wasCue: false, wasStutter: false,
    flashOn: false, flashes: [],
    particles: Array.from({ length: 36 }, () => ({ x: random(), y: random(), speed: 0.015 + random() * 0.045, size: random() * 2 + 1 })),
  };

  function ready() {
    if (sprites) return true;
    if (!image?.complete || !image.naturalWidth) return false;
    sprites = spriteCache.get(image);
    if (!sprites) {
      try {
        sprites = buildSprites(image);
        spriteCache.set(image, sprites);
      } catch {
        sprites = null;
      }
    }
    return !!sprites;
  }

  function canFlash(now) {
    s.flashes = s.flashes.filter((time) => now - time < 1);
    if (s.flashes.length >= 3) return false;
    s.flashes.push(now);
    return true;
  }

  function jolt(now, magnitude) {
    s.joltX = (random() - 0.5) * magnitude;
    s.joltY = (random() - 0.5) * magnitude * 0.5;
    s.joltUntil = now + 0.05 + random() * 0.04;
  }

  function startBurst(now, duration, strength) {
    const current = now < s.burstUntil ? s.burstStrength : 0;
    s.burstStrength = Math.max(current, strength);
    s.burstUntil = Math.max(s.burstUntil, now + duration);
  }

  function updateMouth(input, dt) {
    const v = input.active ? input.visemes : null;
    let target;
    if (v) target = v;
    else if (input.active) {
      const level = clamp01(input.level ?? 0);
      target = { open: level, wide: 0, round: 0, teeth: 0, energy: level };
    } else target = { open: 0, wide: 0, round: 0, teeth: 0, energy: 0 };
    const follow = (key, attack, release) => {
      const goal = clamp01(target[key] ?? 0);
      s[key] += (goal - s[key]) * (1 - Math.exp(-dt / (goal > s[key] ? attack : release)));
    };
    s.prevEnergy = s.energy;
    follow('open', 0.022, 0.055);
    follow('wide', 0.05, 0.08);
    follow('round', 0.05, 0.08);
    follow('teeth', 0.03, 0.06);
    follow('energy', 0.03, 0.12);
  }

  function updateHead(input, dt, now, motion) {
    if (!motion) {
      s.hx = 0; s.hy = 0; s.rot = 0; s.scale = 1; s.nod = 0; s.nodVel = 0;
      return;
    }
    // Syllable onsets kick a damped spring: small nods that follow the speech rhythm.
    s.nodVel += Math.max(0, s.energy - s.prevEnergy) * 9;
    s.nodVel += (-55 * s.nod - 9 * s.nodVel) * dt;
    s.nod = Math.max(-0.6, Math.min(1.2, s.nod + s.nodVel * dt));
    s.hx = Math.sin(now * 0.21) * 0.0035 + Math.sin(now * 0.13 + 1.3) * 0.0025;
    s.hy = Math.sin(now * 0.17 + 0.5) * 0.0025 + s.nod * 0.012;
    s.rot = Math.sin(now * 0.11 + 2) * 0.005 + s.nod * 0.006 + (input.active ? Math.sin(now * 1.7) * 0.0015 : 0);
    s.scale = 1 + 0.004 * Math.sin(now * 0.07) + s.energy * 0.004;
    if (input.mood === 'wrath' && input.active) {
      s.hx += (random() - 0.5) * 0.0016;
      s.hy += (random() - 0.5) * 0.0012;
    }
    if (now < s.joltUntil) {
      s.hx += s.joltX;
      s.hy += s.joltY;
    }
  }

  function updateEyes(input, dt, now) {
    if (s.blinkStart < 0 && now >= s.nextBlink) s.blinkStart = now;
    s.closure = 0;
    if (s.blinkStart >= 0) {
      const progress = (now - s.blinkStart) / 0.16;
      if (progress >= 1) {
        s.blinkStart = -1;
        if (s.pendingDouble) {
          s.pendingDouble = false;
          s.nextBlink = now + 0.1;
        } else {
          s.nextBlink = now + 2.6 + random() * 4.5;
          s.pendingDouble = random() < 0.18;
        }
      } else s.closure = Math.sin(Math.PI * progress);
    }
    let tx;
    let ty;
    if (input.pointer) {
      tx = Math.max(-1, Math.min(1, input.pointer.x));
      ty = Math.max(-1, Math.min(1, input.pointer.y));
    } else {
      if (now >= s.nextSaccade) {
        s.gazeTarget = [(random() * 2 - 1) * 0.6, (random() * 2 - 1) * 0.3];
        s.nextSaccade = now + 1.2 + random() * 3;
      }
      [tx, ty] = s.gazeTarget;
    }
    const k = Math.min(1, dt * 14);
    s.gaze[0] += (tx - s.gaze[0]) * k;
    s.gaze[1] += (ty - s.gaze[1]) * k;
  }

  function updateGlitch(input, now, dt, fx, voice) {
    const cueRise = !!input.cue && !s.wasCue;
    const stutterRise = !!input.stutter && !s.wasStutter;
    s.wasCue = !!input.cue;
    s.wasStutter = !!input.stutter;
    if (!input.cue) s.flashOn = false;
    if (fx <= 0) return 0;
    if (cueRise) {
      startBurst(now, 0.28, 1);
      jolt(now, 0.012);
      s.flashOn = canFlash(now);
    }
    if (stutterRise) {
      startBurst(now, 0.12, 0.6);
      jolt(now, 0.006);
    }
    const rate = (input.active ? 0.5 : 0.12) * fx * (0.35 + voice) * 1.6;
    if (random() < dt * rate) startBurst(now, 0.06 + random() * 0.14, 0.35 + random() * 0.4);
    const burst = now < s.burstUntil ? s.burstStrength : 0;
    return Math.max(burst, input.cue ? 0.55 : 0) * fx;
  }

  // Maps a source point (image fractions) to its displaced position for the current mouth shape.
  function makeWarp() {
    const jaw = FACE.maxJaw * Math.min(1, s.open * 1.25);
    const half = FACE.mouthHalfWidth * (1 - 0.3 * s.round) * (1 + 0.08 * s.wide);
    const spread = 0.07 * s.wide - 0.1 * s.round;
    const lip = (u) => smoothstep(0, 1, (half - Math.abs(u - 0.5)) / (half * 0.55));
    const chin = (u) => smoothstep(0, 1, (FACE.jawHalfWidth - Math.abs(u - 0.5)) / 0.07);
    const band = (v) => smoothstep(FACE.upperLipTop, 0.745, v) * (1 - smoothstep(0.78, FACE.lipBottom, v));
    const falloff = (u) => 1 - smoothstep(0.11, FACE.jawHalfWidth, Math.abs(u - 0.5));
    const x = (u, v) => u + (u - 0.5) * spread * band(v) * falloff(u);
    // upper: true for the upper lip side of the seam.
    const y = (u, v, upper) => {
      if (upper) return v - 0.16 * jaw * lip(u) * smoothstep(FACE.upperLipTop, FACE.seam, v);
      const rigid = jaw * 0.85 * chin(u);
      if (v <= FACE.lipBottom) return v + jaw * lip(u) + (rigid - jaw * lip(u)) * smoothstep(FACE.seam, FACE.lipBottom, v);
      if (v <= FACE.chinBottom) return v + rigid;
      return v + rigid * (1 - smoothstep(FACE.chinBottom, FACE.neckAnchor, v));
    };
    return { jaw, lip, x, y };
  }

  function drawCells(ctx, rows, upper, warp, rect) {
    const { base, width, height } = sprites;
    const { ix, iy, iw, ih } = rect;
    for (let r = 0; r < rows.length - 1; r++) {
      const v0 = rows[r];
      const v1 = rows[r + 1];
      const vm = (v0 + v1) / 2;
      for (let c = 0; c < COLUMNS.length - 1; c++) {
        const u0 = COLUMNS[c];
        const u1 = COLUMNS[c + 1];
        const uc = (u0 + u1) / 2;
        const dx0 = ix + warp.x(u0, vm) * iw;
        const dx1 = ix + warp.x(u1, vm) * iw;
        const dy0 = iy + warp.y(uc, v0, upper) * ih;
        const dy1 = iy + warp.y(uc, v1, upper) * ih;
        if (dx1 - dx0 <= 0 || dy1 - dy0 <= 0) continue;
        ctx.drawImage(base, u0 * width, v0 * height, (u1 - u0) * width, (v1 - v0) * height, dx0, dy0, dx1 - dx0 + 0.6, dy1 - dy0 + 0.6);
      }
    }
  }

  function drawMouth(ctx, rect) {
    const warp = makeWarp();
    const { ix, iy, iw, ih } = rect;
    if (warp.jaw * ih < 0.35) return;
    const top = [];
    const bottom = [];
    for (const u of COLUMNS) {
      if (warp.lip(u) <= 0.001) continue;
      top.push([ix + warp.x(u, FACE.seam) * iw, iy + warp.y(u, FACE.seam, true) * ih]);
      bottom.push([ix + warp.x(u, FACE.seam) * iw, iy + warp.y(u, FACE.seam, false) * ih]);
    }
    if (top.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const [px, py] of top) ctx.lineTo(px, py);
      for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
      ctx.closePath();
      const cx = ix + iw * 0.5;
      const cy = iy + ih * (FACE.seam + warp.jaw * 0.4);
      const gradient = ctx.createLinearGradient(0, iy + ih * (FACE.seam - warp.jaw * 0.2), 0, iy + ih * (FACE.seam + warp.jaw));
      gradient.addColorStop(0, '#000300');
      gradient.addColorStop(1, '#03100a');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.clip();
      // Inner data-light and luminous digital teeth.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, iw * 0.07);
      glow.addColorStop(0, `rgba(80,255,140,${0.08 + s.energy * 0.16})`);
      glow.addColorStop(1, 'rgba(80,255,140,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - iw * 0.1, cy - ih * 0.05, iw * 0.2, ih * 0.1);
      const toothW = iw * 0.011;
      const gap = iw * 0.0022;
      const upperAlpha = 0.1 + 0.28 * clamp01(s.open * 1.4);
      const lowerAlpha = 0.45 * s.teeth;
      const toothH = Math.min(ih * 0.0055, warp.jaw * ih * 0.38);
      for (let x = cx - iw * 0.072; x < cx + iw * 0.072; x += toothW + gap) {
        const u = (x - ix) / iw;
        const lipAmount = warp.lip(u);
        if (lipAmount < 0.25) continue;
        const yTop = iy + warp.y(u, FACE.seam, true) * ih;
        const yBottom = iy + warp.y(u, FACE.seam, false) * ih;
        ctx.fillStyle = `rgba(176,255,196,${upperAlpha * lipAmount})`;
        ctx.fillRect(x, yTop, toothW, toothH);
        if (lowerAlpha > 0.02) {
          ctx.fillStyle = `rgba(150,240,176,${lowerAlpha * lipAmount})`;
          ctx.fillRect(x, yBottom - toothH * 0.8, toothW, toothH * 0.8);
        }
      }
      ctx.restore();
    }
    drawCells(ctx, UPPER_ROWS, true, warp, rect);
    drawCells(ctx, LOWER_ROWS, false, warp, rect);
    if (bottom.length > 1) {
      ctx.save();
      ctx.lineWidth = Math.max(1, iw * 0.0016);
      ctx.strokeStyle = 'rgba(122,205,132,0.45)';
      ctx.beginPath();
      bottom.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(122,205,132,0.22)';
      ctx.beginPath();
      top.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawEyes(ctx, rect, input, cue) {
    const { ix, iy, iw, ih } = rect;
    const glow = Math.min(0.75, 0.2 + s.energy * 0.22 + (cue ? 0.35 : 0) + (input.mood === 'wrath' ? 0.08 : 0));
    for (const [ex, ey] of FACE.eyes) {
      const x = ix + iw * (ex + s.gaze[0] * 0.004);
      const y = iy + ih * (ey + s.gaze[1] * 0.003);
      const r = iw * (cue ? 0.035 : 0.022 + s.energy * 0.004);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(160,255,171,${glow * (1 - s.closure)})`);
      gradient.addColorStop(1, 'rgba(70,255,132,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = `rgba(225,255,228,${0.45 * (1 - s.closure)})`;
      ctx.fillRect(x - iw * 0.0018, y - iw * 0.0018, iw * 0.0036, iw * 0.0036);
      if (s.closure > 0.02) {
        // Digital eyelid: a dark shutter with a bright scan edge.
        const cx = ix + iw * ex;
        const cy = iy + ih * ey;
        const rx = iw * FACE.eyeRadius[0];
        const ry = ih * FACE.eyeRadius[1];
        const lid = cy - ry + 2 * ry * s.closure;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = 'rgba(5,13,8,0.94)';
        ctx.fillRect(cx - rx, cy - ry, rx * 2, lid - (cy - ry));
        ctx.fillStyle = `rgba(165,255,175,${0.55 * s.closure})`;
        ctx.fillRect(cx - rx, lid - 0.75, rx * 2, 1.5);
        ctx.restore();
      }
    }
  }

  function drawPortraitGlitch(ctx, rect, level, cue, w) {
    const { base, red, cyan, width, height } = sprites;
    const { ix, iy, iw, ih } = rect;
    if (level > 0.15) {
      const offset = iw * 0.008 * level * (0.6 + random() * 0.8);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.24 * level;
      ctx.drawImage(red, ix - offset, iy, iw, ih);
      ctx.drawImage(cyan, ix + offset, iy + offset * 0.25, iw, ih);
      ctx.restore();
    }
    const tears = Math.round(level * (cue ? 7 : 5));
    for (let n = 0; n < tears; n++) {
      const sy = random() * height;
      const sh = 4 + random() * height * 0.035;
      ctx.save();
      ctx.globalAlpha = 0.35 + random() * 0.45;
      ctx.drawImage(base, 0, sy, width, sh, ix + (random() - 0.5) * w * (cue ? 0.22 : 0.08) * level, iy + (sy / height) * ih, iw, (sh / height) * ih);
      ctx.restore();
    }
    if (level > 0.3 && random() < 0.5) {
      for (let n = 0; n < 1 + Math.floor(random() * 3); n++) {
        const bw = width * (0.05 + random() * 0.2);
        const bh = height * (0.01 + random() * 0.04);
        const bx = width * (0.2 + random() * 0.6) - bw / 2;
        const by = height * (0.2 + random() * 0.65);
        const shift = (random() - 0.5) * iw * 0.06;
        ctx.drawImage(base, bx, by, bw, bh, ix + (bx / width) * iw + shift, iy + (by / height) * ih, (bw / width) * iw, (bh / height) * ih);
      }
    }
    if (level > 0.5 && random() < 0.35) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.45;
      const shift = (random() < 0.5 ? -1 : 1) * iw * (0.015 + random() * 0.02);
      for (const [ex, ey] of FACE.eyes) {
        const sw = width * 0.09;
        const sh = height * 0.045;
        const sx = width * ex - sw / 2;
        const sy = height * ey - sh / 2;
        ctx.drawImage(base, sx, sy, sw, sh, ix + (sx / width) * iw + shift, iy + (sy / height) * ih, (sw / width) * iw, (sh / height) * ih);
      }
      ctx.restore();
    }
  }

  function drawMicroTear(ctx, rect, w, active) {
    const { base, width, height } = sprites;
    const { ix, iy, iw, ih } = rect;
    for (let n = 0; n < (active ? 2 : 1); n++) {
      const sy = random() * height;
      const sh = 4 + random() * height * 0.035;
      ctx.save();
      ctx.globalAlpha = 0.35 + random() * 0.45;
      ctx.drawImage(base, 0, sy, width, sh, ix + (random() - 0.5) * w * 0.05, iy + (sy / height) * ih, iw, (sh / height) * ih);
      ctx.restore();
    }
  }

  function drawHud(ctx, w, h, now, input, motion, rect, power) {
    const phase = now;
    const active = !!input.active;
    ctx.save();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(141,255,126,0.17)';
    for (let side = 0; side < 2; side++) {
      const edge = side ? w : 0;
      const center = side ? w * 0.84 : w * 0.16;
      for (let i = 0; i < 7; i++) {
        const x = edge + ((center - edge) * i) / 6;
        ctx.beginPath();
        ctx.moveTo(edge, h * 0.12);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const v = (i / 9 + phase * 0.11 * motion) % 1;
        const y = h * (0.14 + 0.86 * v * v);
        const span = Math.abs(center - edge) * v;
        ctx.beginPath();
        ctx.moveTo(edge, y);
        ctx.lineTo(side ? edge - span : edge + span, y);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (rect && motion) {
      const { ix, iy, iw, ih } = rect;
      ctx.save();
      ctx.lineWidth = Math.max(0.6, iw * 0.001);
      ctx.strokeStyle = 'rgba(154,255,159,.18)';
      ctx.setLineDash([iw * 0.012, iw * 0.018]);
      ctx.lineDashOffset = -phase * 8;
      ctx.beginPath();
      ctx.arc(ix + iw * 0.5, iy + ih * 0.48, iw * 0.31, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = 'rgba(156,255,127,.55)';
    for (const p of s.particles) {
      const y = ((p.y + phase * p.speed * motion) % 1) * h;
      const x = p.x * w;
      if (x > w * 0.2 && x < w * 0.8) continue;
      ctx.globalAlpha = 0.25 + (0.2 + 0.2 * Math.sin(phase * 4 + p.y * 20));
      ctx.fillRect(x, y, p.size, p.size * (active ? 3 : 1));
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(157,255,133,.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.48, Math.min(w, h) * 0.36, phase * 0.16 * motion, Math.PI * 1.6 + phase * 0.16 * motion);
    ctx.stroke();
    ctx.restore();
    if (motion) {
      const y = (phase * (active ? 65 : 28)) % h;
      const gradient = ctx.createLinearGradient(0, y - 12, 0, y + 4);
      gradient.addColorStop(0, 'rgba(159,255,123,0)');
      gradient.addColorStop(1, `rgba(159,255,123,${active ? 0.2 : 0.09})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y - 12, w, 16);
      if (random() < (active ? 0.4 : 0.1) * (0.3 + power)) {
        for (let i = 0; i < (active ? 5 : 2); i++) {
          ctx.fillStyle = `rgba(180,255,143,${random() * 0.28})`;
          ctx.fillRect(random() * w, random() * h, random() * w * 0.1 + 2, 1 + random() * 3);
        }
      }
    }
  }

  function drawMiniHud(ctx, w, h, now) {
    ctx.save();
    ctx.strokeStyle = 'rgba(140,255,150,.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = ((i / 7 + now * 0.08) % 1) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w * 0.13, y);
      ctx.moveTo(w * 0.87, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFlash(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(122,255,164,.07)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 10; i++) {
      const y = random() * h;
      ctx.fillStyle = `rgba(${i % 3 ? 120 : 235},255,${i % 2 ? 174 : 238},${0.1 + random() * 0.22})`;
      ctx.fillRect(random() * w * 0.4, y, random() * w * 0.55 + 8, 1 + random() * h * 0.014);
    }
    ctx.restore();
  }

  /**
   * input: { now, active, visemes, level, cue, stutter, voiceGlitch (0-1), visual (0-1), mood, pointer }
   * options: { fit: 'cover' | 'contain', hud: 'full' | 'mini' }
   */
  function draw(ctx, w, h, input = {}, { fit = 'cover', hud = 'full' } = {}) {
    const now = input.now ?? performance.now() / 1000;
    const dt = s.last ? Math.min(0.1, Math.max(0, now - s.last)) : 1 / 60;
    s.last = now;
    const motion = reducedMotion() ? 0 : 1;
    const visual = clamp01(input.visual ?? 0.6);
    const voice = clamp01(input.voiceGlitch ?? 0.5);
    const fx = motion * visual;
    ctx.clearRect(0, 0, w, h);
    updateMouth(input, dt);
    updateHead(input, dt, now, motion);
    updateEyes(input, dt, now);
    const level = updateGlitch(input, now, dt, fx, voice);
    let rect = null;
    if (ready()) {
      const overscan = fit === 'cover' && motion ? 1.03 : 1;
      const scale = (fit === 'contain' ? Math.min(w / sprites.width, h / sprites.height) : Math.max(w / sprites.width, h / sprites.height)) * overscan;
      const iw = sprites.width * scale;
      const ih = sprites.height * scale;
      rect = { ix: (w - iw) / 2, iy: (h - ih) / 2, iw, ih };
      ctx.save();
      const px = rect.ix + iw * FACE.pivot[0];
      const py = rect.iy + ih * FACE.pivot[1];
      ctx.translate(px + s.hx * iw, py + s.hy * ih);
      ctx.rotate(s.rot);
      ctx.scale(s.scale, s.scale);
      ctx.translate(-px, -py);
      ctx.drawImage(sprites.base, rect.ix, rect.iy, iw, ih);
      drawMouth(ctx, rect);
      drawEyes(ctx, rect, input, !!input.cue && fx > 0);
      if (level > 0) drawPortraitGlitch(ctx, rect, level, !!input.cue, w);
      else if (fx > 0 && random() < dt * 60 * (input.active ? 0.05 : 0.025) * (0.35 + voice) * visual * 1.6) drawMicroTear(ctx, rect, w, input.active);
      ctx.restore();
    }
    if (s.flashOn && fx > 0) drawFlash(ctx, w, h);
    if (hud === 'full') drawHud(ctx, w, h, now, input, motion, rect, voice);
    else drawMiniHud(ctx, w, h, now);
    return { ready: !!rect, mouth: s.open, glitch: level > 0 || (s.flashOn && fx > 0) };
  }

  return { ready, draw, state: s };
}
