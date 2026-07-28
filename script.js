/* =========================================
   BITTENSOR CANVAS — E8-INSPIRED NETWORK
   script.js
   ========================================= */

'use strict';

// ── Hamburger menu ────────────────────────────────────────────────────────────
(function initMenu() {
  const btn       = document.getElementById('hamburger-btn');
  const menu      = document.getElementById('mobile-menu');
  const iconOpen  = document.getElementById('hamburger-icon');
  const iconClose = document.getElementById('close-icon');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    menu.setAttribute('aria-hidden', String(!isOpen));
    btn.setAttribute('aria-expanded', String(isOpen));
    iconOpen.style.display  = isOpen ? 'none'  : 'block';
    iconClose.style.display = isOpen ? 'block' : 'none';
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  menu.querySelectorAll('.mobile-nav-link').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      iconOpen.style.display  = 'block';
      iconClose.style.display = 'none';
      document.body.style.overflow = '';
    });
  });
})();

// ── Canvas ────────────────────────────────────────────────────────────────────
(function initCanvas() {
  const canvas = document.getElementById('bittensor-canvas');
  const ctx    = canvas.getContext('2d');

  // ── Resize handling ─────────────────────────────────────────────────────────
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR    = Math.min(window.devicePixelRatio || 1, 2);
    W      = window.innerWidth;
    H      = window.innerHeight;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(DPR, DPR);
    rebuildGraph();
  }

  window.addEventListener('resize', resize, { passive: true });

  // ── Graph parameters ────────────────────────────────────────────────────────
  const NODE_COUNT_BASE = 180;   // target node count
  const LINK_DIST_RATIO = 0.22;  // max link length as fraction of shortest side
  const NODE_RADIUS     = 1.6;
  const SPEED           = 0.18;  // overall motion speed
  const ROTATE_SPEED    = 0.00028; // rotation per frame
  const COLOR_BG        = '#ffffff';
  const COLOR_NODE      = '#111111';
  const COLOR_LINE_MAX  = 'rgba(17,17,17,0.18)';

  // ── 3-D node cloud ──────────────────────────────────────────────────────────
  const nodes = [];
  const links = [];

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  // Fibonacci sphere — evenly distributes points on a sphere surface
  function fibonacciSphere(n, radius) {
    const pts = [];
    const phi = Math.PI * (Math.sqrt(5) - 1); // golden angle
    for (let i = 0; i < n; i++) {
      const y     = 1 - (i / (n - 1)) * 2;
      const r     = Math.sqrt(1 - y * y);
      const theta = phi * i;
      pts.push({
        ox: Math.cos(theta) * r * radius,
        oy: y               *     radius,
        oz: Math.sin(theta) * r * radius,
      });
    }
    return pts;
  }

  // ── Mouse interaction ───────────────────────────────────────────────────────
  let mouseX = 0, mouseY = 0, mouseActive = false;

  canvas.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseActive = true;
  }, { passive: true });

  canvas.addEventListener('mouseleave', () => { mouseActive = false; }, { passive: true });

  // ── Build / rebuild graph ───────────────────────────────────────────────────
  let linkDist = 0;

  function rebuildGraph() {
    nodes.length = 0;
    links.length = 0;

    const shortest = Math.min(W, H);
    linkDist       = shortest * LINK_DIST_RATIO;

    // Sphere radius: ~40% of shortest side
    const sphereR  = shortest * 0.40;

    // Core sphere nodes
    const spherePts = fibonacciSphere(Math.round(NODE_COUNT_BASE * 0.7), sphereR);
    spherePts.forEach(p => {
      nodes.push({
        ox: p.ox, oy: p.oy, oz: p.oz,   // original 3-D position
        // drift velocity
        vx: randRange(-0.3, 0.3),
        vy: randRange(-0.3, 0.3),
        vz: randRange(-0.3, 0.3),
        // current rotated position (filled each frame)
        x: 0, y: 0, z: 0,
        // screen position
        sx: 0, sy: 0,
        onSphere: true,
      });
    });

    // Inner cluster nodes (slightly random, inside sphere)
    const inner = NODE_COUNT_BASE - spherePts.length;
    for (let i = 0; i < inner; i++) {
      const r     = randRange(0, sphereR * 0.55);
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(randRange(-1, 1));
      nodes.push({
        ox: r * Math.sin(phi) * Math.cos(theta),
        oy: r * Math.sin(phi) * Math.sin(theta),
        oz: r * Math.cos(phi),
        vx: randRange(-0.2, 0.2),
        vy: randRange(-0.2, 0.2),
        vz: randRange(-0.2, 0.2),
        x: 0, y: 0, z: 0,
        sx: 0, sy: 0,
        onSphere: false,
      });
    }
  }

  // ── 3-D rotation matrices (X and Y axis) ────────────────────────────────────
  let rotX = 0.0, rotY = 0.0;

  // Mouse-driven tilt — lazy follow
  let targetRotX = 0, targetRotY = 0;

  function applyRotation(ox, oy, oz) {
    // Rotate around Y
    let x =  ox * Math.cos(rotY) + oz * Math.sin(rotY);
    let y =  oy;
    let z = -ox * Math.sin(rotY) + oz * Math.cos(rotY);
    // Rotate around X
    const y2 =  y * Math.cos(rotX) - z * Math.sin(rotX);
    const z2 =  y * Math.sin(rotX) + z * Math.cos(rotX);
    return { x, y: y2, z: z2 };
  }

  // ── Perspective projection ───────────────────────────────────────────────────
  const FOV = 900;  // focal length in px — higher = less perspective distortion

  function project(x, y, z, cx, cy) {
    const scale = FOV / (FOV + z);
    return {
      sx: cx + x * scale,
      sy: cy + y * scale,
      scale,
    };
  }

  // ── Draw one frame ──────────────────────────────────────────────────────────
  let frameId;
  let lastTime = 0;

  function draw(ts) {
    frameId = requestAnimationFrame(draw);

    const dt = Math.min((ts - lastTime) / 16.67, 3); // ~1 at 60fps, cap at 3
    lastTime = ts;

    // ── clear ────────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;

    // ── auto-rotate + mouse tilt ─────────────────────────────────────────────
    rotY += ROTATE_SPEED * dt;

    if (mouseActive) {
      targetRotX = ((mouseY / H) - 0.5) *  0.35;
      targetRotY = rotY + ((mouseX / W) - 0.5) * 0.35;
    }
    rotX += (targetRotX - rotX) * 0.03 * dt;
    if (mouseActive) {
      rotY += (targetRotY - rotY) * 0.015 * dt;
    }

    // ── update node positions + project ─────────────────────────────────────
    nodes.forEach(n => {
      // Gentle drift (very slow)
      n.ox += n.vx * SPEED * 0.01 * dt;
      n.oy += n.vy * SPEED * 0.01 * dt;
      n.oz += n.vz * SPEED * 0.01 * dt;

      // Soft spring back toward original shell
      const dist = Math.sqrt(n.ox * n.ox + n.oy * n.oy + n.oz * n.oz);
      const targetR = Math.min(W, H) * (n.onSphere ? 0.40 : 0.22);
      if (dist > 0) {
        const f = (dist - targetR) * 0.002 * dt;
        n.ox -= (n.ox / dist) * f;
        n.oy -= (n.oy / dist) * f;
        n.oz -= (n.oz / dist) * f;
      }

      const rot = applyRotation(n.ox, n.oy, n.oz);
      n.x = rot.x; n.y = rot.y; n.z = rot.z;
      const proj = project(rot.x, rot.y, rot.z, cx, cy);
      n.sx = proj.sx; n.sy = proj.sy; n.scale = proj.scale;
    });

    // ── draw edges ───────────────────────────────────────────────────────────
    const linkDistSq = linkDist * linkDist;

    // We only compare pairs → O(n²) but n is small enough at 180
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.sx - b.sx;
        const dy = a.sy - b.sy;
        const dSq = dx * dx + dy * dy;
        if (dSq > linkDistSq) continue;

        const proximity = 1 - Math.sqrt(dSq) / linkDist;
        // depth factor: nodes closer to viewer are more opaque
        const depthFactor = Math.max(0, Math.min(1, (a.z + b.z) / (2 * Math.min(W, H) * 0.4) + 0.5));
        const alpha = proximity * 0.22 * (0.5 + depthFactor * 0.5);

        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = `rgba(17,17,17,${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.6 * Math.min(a.scale, b.scale);
        ctx.stroke();
      }
    }

    // ── draw nodes ───────────────────────────────────────────────────────────
    nodes.forEach(n => {
      const depthFactor = Math.max(0, Math.min(1, n.z / (Math.min(W, H) * 0.4) + 0.5));
      const alpha = 0.35 + depthFactor * 0.65;
      const r = NODE_RADIUS * n.scale * (0.5 + depthFactor * 0.5);

      ctx.beginPath();
      ctx.arc(n.sx, n.sy, Math.max(0.4, r), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(17,17,17,${alpha.toFixed(3)})`;
      ctx.fill();
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  resize();
  frameId = requestAnimationFrame(draw);

})();
