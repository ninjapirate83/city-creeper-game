/* main.js — iPad-friendly Babylon.js “Block City” (chunked voxel mesh, dual joysticks, break/jump, creeper explosion)
   Assumes Babylon.js is loaded in index.html and there is a <canvas id="renderCanvas"></canvas>.
   If UI elements (buttons/joysticks/status) are missing, this file creates them.
*/

(() => {
  "use strict";

  /** ---------------------------
   *  DOM + iOS Safari hardening
   *  --------------------------- */
  const canvas = document.getElementById("renderCanvas");
  if (!canvas) throw new Error('Missing <canvas id="renderCanvas">');

  // Prevent page scrolling/zoom while playing
  document.documentElement.style.height = "100%";
  document.body.style.height = "100%";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";
  canvas.style.touchAction = "none";

  // iOS double-tap zoom prevention
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );

  /** ---------------------------
   *  Engine + Scene
   *  --------------------------- */
  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    disableWebGL2Support: false,
  });

  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.75, 0.87, 1.0, 1.0);
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.6, 0); // tuned for non-physics moveWithCollisions feel

  // Light
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.2), scene);
  hemi.intensity = 0.9;

  const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.4, -1, -0.3), scene);
  dir.position = new BABYLON.Vector3(40, 80, 40);
  dir.intensity = 0.6;

  /** ---------------------------
   *  UI creation (if missing)
   *  --------------------------- */
  const uiRoot =
    document.getElementById("uiRoot") ||
    (() => {
      const d = document.createElement("div");
      d.id = "uiRoot";
      d.style.position = "fixed";
      d.style.inset = "0";
      d.style.pointerEvents = "none";
      d.style.userSelect = "none";
      d.style.webkitUserSelect = "none";
      d.style.touchAction = "none";
      document.body.appendChild(d);
      return d;
    })();

  // Hide legacy static HUD controls from index.html to avoid touch overlap with virtual controls.
  const legacyHud = document.querySelector(".hud");
  if (legacyHud) legacyHud.style.display = "none";

  function makeButton(id, label, rightPx, bottomPx) {
    let b = document.getElementById(id);
    if (b) return b;
    b = document.createElement("button");
    b.id = id;
    b.textContent = label;
    b.style.position = "fixed";
    b.style.right = rightPx + "px";
    b.style.bottom = bottomPx + "px";
    b.style.width = "86px";
    b.style.height = "86px";
    b.style.borderRadius = "18px";
    b.style.border = "1px solid rgba(0,0,0,0.2)";
    b.style.background = "rgba(255,255,255,0.75)";
    b.style.backdropFilter = "blur(6px)";
    b.style.webkitBackdropFilter = "blur(6px)";
    b.style.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    b.style.color = "#111";
    b.style.pointerEvents = "auto";
    b.style.touchAction = "none";
    b.style.webkitTapHighlightColor = "transparent";
    b.style.boxShadow = "0 10px 25px rgba(0,0,0,0.15)";
    // prevent iOS zoom/scroll on buttons
    b.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    uiRoot.appendChild(b);
    return b;
  }

  function makeStatus() {
    let s = document.getElementById("status");
    if (s) return s;
    s = document.createElement("div");
    s.id = "status";
    s.style.position = "fixed";
    s.style.left = "12px";
    s.style.top = "10px";
    s.style.padding = "8px 10px";
    s.style.borderRadius = "12px";
    s.style.background = "rgba(255,255,255,0.65)";
    s.style.border = "1px solid rgba(0,0,0,0.12)";
    s.style.backdropFilter = "blur(6px)";
    s.style.webkitBackdropFilter = "blur(6px)";
    s.style.font = "500 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    s.style.color = "#111";
    s.style.pointerEvents = "none";
    uiRoot.appendChild(s);
    return s;
  }

  function makeJoystick(name, side /* 'left' | 'right' */) {
    const wrapId = `${name}JoyWrap`;
    let wrap = document.getElementById(wrapId);
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = wrapId;
    wrap.style.position = "fixed";
    wrap.style.bottom = "16px";
    wrap.style[side] = "16px";
    wrap.style.width = "160px";
    wrap.style.height = "160px";
    wrap.style.borderRadius = "28px";
    wrap.style.background = "rgba(255,255,255,0.10)";
    wrap.style.border = "1px solid rgba(255,255,255,0.20)";
    wrap.style.boxShadow = "0 10px 30px rgba(0,0,0,0.12)";
    wrap.style.pointerEvents = "auto";
    wrap.style.touchAction = "none";
    wrap.style.webkitTapHighlightColor = "transparent";

    const base = document.createElement("div");
    base.style.position = "absolute";
    base.style.inset = "12px";
    base.style.borderRadius = "22px";
    base.style.background = "rgba(255,255,255,0.12)";
    base.style.border = "1px solid rgba(255,255,255,0.18)";
    base.style.backdropFilter = "blur(4px)";
    base.style.webkitBackdropFilter = "blur(4px)";
    base.style.pointerEvents = "none";
    wrap.appendChild(base);

    const knob = document.createElement("div");
    knob.style.position = "absolute";
    knob.style.left = "50%";
    knob.style.top = "50%";
    knob.style.width = "64px";
    knob.style.height = "64px";
    knob.style.marginLeft = "-32px";
    knob.style.marginTop = "-32px";
    knob.style.borderRadius = "22px";
    knob.style.background = "rgba(255,255,255,0.65)";
    knob.style.border = "1px solid rgba(0,0,0,0.18)";
    knob.style.boxShadow = "0 10px 20px rgba(0,0,0,0.12)";
    knob.style.pointerEvents = "none";
    wrap.appendChild(knob);

    uiRoot.appendChild(wrap);
    return wrap;
  }

  const BUILD_VERSION = "v11";

  const statusEl = makeStatus();
  const buildVersionEl = document.getElementById("buildVersion");
  if (buildVersionEl) buildVersionEl.textContent = `Build ${BUILD_VERSION}`;

  // Keep action buttons above the right joystick so controls never overlap.
  const JOY_BOTTOM = 16;
  const JOY_SIZE = 160;
  const BTN_SIZE = 86;
  const BTN_GAP = 12;
  const jumpBtnBottom = JOY_BOTTOM + JOY_SIZE + BTN_GAP;
  const breakBtnBottom = jumpBtnBottom + BTN_SIZE + BTN_GAP;

  const breakBtn = makeButton("breakBtn", "Break", 16, breakBtnBottom);
  const jumpBtn = makeButton("jumpBtn", "Jump", 16, jumpBtnBottom);

  const leftJoyWrap = makeJoystick("left", "left");
  const rightJoyWrap = makeJoystick("right", "right");

  /** ---------------------------
   *  Stable joystick using Pointer Events
   *  --------------------------- */
  class VirtualJoystick {
    constructor(wrapEl) {
      this.wrapEl = wrapEl;
      this.knobEl = wrapEl.querySelector("div:last-child"); // knob
      this.active = false;
      this.pointerId = null;
      this.touchId = null;
      this.center = { x: 0, y: 0 };
      this.value = { x: 0, y: 0 };
      this.radius = 58; // pixels from center
      this._bind();
    }

    _bind() {
      const el = this.wrapEl;

      const getRectCenter = () => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };

      const setKnob = (vx, vy) => {
        // vx,vy in [-1,1]
        const px = vx * this.radius;
        const py = vy * this.radius;
        this.knobEl.style.transform = `translate(${px}px, ${py}px)`;
      };

      const onDown = (pointerId, clientX, clientY, e) => {
        if (e) e.preventDefault();
        this.active = true;
        this.pointerId = pointerId;
        this.center = getRectCenter();
        if (pointerId !== null && el.setPointerCapture) {
          el.setPointerCapture(pointerId);
        }
        onMove(pointerId, clientX, clientY, e);
      };

      const onMove = (pointerId, clientX, clientY, e) => {
        if (!this.active || pointerId !== this.pointerId) return;
        if (e) e.preventDefault();
        const dx = clientX - this.center.x;
        const dy = clientY - this.center.y;
        const len = Math.hypot(dx, dy);
        const max = this.radius;
        const cl = len > max ? max / len : 1;

        const nx = (dx * cl) / max;
        const ny = (dy * cl) / max;

        this.value.x = nx;
        this.value.y = ny;
        setKnob(nx, ny);
      };

      const onUp = (pointerId, e) => {
        if (!this.active || pointerId !== this.pointerId) return;
        if (e) e.preventDefault();
        this.active = false;
        this.pointerId = null;
        this.touchId = null;
        this.value.x = 0;
        this.value.y = 0;
        this.knobEl.style.transform = `translate(0px, 0px)`;
      };

      el.addEventListener(
        "pointerdown",
        (e) => {
          onDown(e.pointerId, e.clientX, e.clientY, e);
        },
        { passive: false }
      );
      el.addEventListener(
        "pointermove",
        (e) => {
          onMove(e.pointerId, e.clientX, e.clientY, e);
        },
        { passive: false }
      );
      el.addEventListener(
        "pointerup",
        (e) => {
          onUp(e.pointerId, e);
        },
        { passive: false }
      );
      el.addEventListener(
        "pointercancel",
        (e) => {
          onUp(e.pointerId, e);
        },
        { passive: false }
      );

      // Touch fallback for browsers where pointer events are inconsistent.
      el.addEventListener(
        "touchstart",
        (e) => {
          if (this.active || e.changedTouches.length === 0) return;
          const t = e.changedTouches[0];
          this.touchId = t.identifier;
          onDown(`touch-${t.identifier}`, t.clientX, t.clientY, e);
        },
        { passive: false }
      );
      el.addEventListener(
        "touchmove",
        (e) => {
          if (!this.active || this.touchId === null) return;
          for (const t of e.changedTouches) {
            if (t.identifier !== this.touchId) continue;
            onMove(`touch-${t.identifier}`, t.clientX, t.clientY, e);
            break;
          }
        },
        { passive: false }
      );
      el.addEventListener(
        "touchend",
        (e) => {
          if (!this.active || this.touchId === null) return;
          for (const t of e.changedTouches) {
            if (t.identifier !== this.touchId) continue;
            onUp(`touch-${t.identifier}`, e);
            break;
          }
        },
        { passive: false }
      );
      el.addEventListener(
        "touchcancel",
        (e) => {
          if (!this.active || this.touchId === null) return;
          for (const t of e.changedTouches) {
            if (t.identifier !== this.touchId) continue;
            onUp(`touch-${t.identifier}`, e);
            break;
          }
        },
        { passive: false }
      );

      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }

  const leftJoy = new VirtualJoystick(leftJoyWrap);
  const rightJoy = new VirtualJoystick(rightJoyWrap);

  /** ---------------------------
   *  Voxel + Chunk System
   *  --------------------------- */
  const CHUNK_SIZE = 16;
  const CHUNK_VOL = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

  const BLOCK = {
    AIR: 0,
    ROAD: 1,
    BUILDING: 2,
    CRATE: 3,
  };

  function idx(lx, ly, lz) {
    return lx + CHUNK_SIZE * (ly + CHUNK_SIZE * lz);
  }
  function floorDiv(n, d) {
    return Math.floor(n / d);
  }
  function mod(n, d) {
    return ((n % d) + d) % d;
  }
  function key(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
  }

  // Per-vertex colors
  const COLOR = {
    [BLOCK.ROAD]: new BABYLON.Color4(0.18, 0.18, 0.20, 1),
    [BLOCK.BUILDING]: new BABYLON.Color4(0.70, 0.74, 0.78, 1),
    [BLOCK.CRATE]: new BABYLON.Color4(0.58, 0.40, 0.22, 1),
  };

  const DIRS = [
    { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, // +X
    { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, -1] }, // -X
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, // +Y
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }, // -Y
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, // +Z
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }, // -Z
  ];

  class Chunk {
    constructor(world, cx, cy, cz) {
      this.world = world;
      this.cx = cx;
      this.cy = cy;
      this.cz = cz;
      this.blocks = new Uint8Array(CHUNK_VOL);
      this.mesh = null;
      this.dirty = true;
      this.inQueue = false;
    }

    getLocal(lx, ly, lz) {
      if (lx < 0 || ly < 0 || lz < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE || lz >= CHUNK_SIZE) return BLOCK.AIR;
      return this.blocks[idx(lx, ly, lz)];
    }

    setLocal(lx, ly, lz, v) {
      if (lx < 0 || ly < 0 || lz < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
      this.blocks[idx(lx, ly, lz)] = v;
    }

    worldOrigin() {
      return {
        x: this.cx * CHUNK_SIZE,
        y: this.cy * CHUNK_SIZE,
        z: this.cz * CHUNK_SIZE,
      };
    }

    rebuildMesh() {
      const scene = this.world.scene;
      const origin = this.worldOrigin();

      const positions = [];
      const normals = [];
      const indices = [];
      const colors = [];

      let vertCount = 0;

      const pushColor = (c) => {
        colors.push(c.r, c.g, c.b, c.a);
      };

      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const b = this.getLocal(lx, ly, lz);
            if (b === BLOCK.AIR) continue;

            const wx = origin.x + lx;
            const wy = origin.y + ly;
            const wz = origin.z + lz;

            for (let f = 0; f < 6; f++) {
              const d = DIRS[f];
              const nx = d.n[0],
                ny = d.n[1],
                nz = d.n[2];

              // Neighbor block in world coords
              const nb = this.world.getBlock(wx + nx, wy + ny, wz + nz);
              if (nb !== BLOCK.AIR) continue;

              // Face corners: p, p+u, p+u+v, p+v
              // For each axis-aligned face, base corner is at voxel position plus offset depending on normal
              const ox = wx + (nx === 1 ? 1 : 0);
              const oy = wy + (ny === 1 ? 1 : 0);
              const oz = wz + (nz === 1 ? 1 : 0);

              const ux = d.u[0],
                uy = d.u[1],
                uz = d.u[2];
              const vx = d.v[0],
                vy = d.v[1],
                vz = d.v[2];

              const p0 = [ox, oy, oz];
              const p1 = [ox + ux, oy + uy, oz + uz];
              const p2 = [ox + ux + vx, oy + uy + vy, oz + uz + vz];
              const p3 = [ox + vx, oy + vy, oz + vz];

              positions.push(...p0, ...p1, ...p2, ...p3);

              // Normals (same for all 4 verts)
              for (let i = 0; i < 4; i++) normals.push(nx, ny, nz);

              const c = COLOR[b] || new BABYLON.Color4(1, 1, 1, 1);
              // slight per-face variation to avoid flat look
              const shade = f === 2 ? 1.07 : f === 3 ? 0.92 : 1.0;
              const cc = new BABYLON.Color4(
                Math.min(1, c.r * shade),
                Math.min(1, c.g * shade),
                Math.min(1, c.b * shade),
                c.a
              );
              for (let i = 0; i < 4; i++) pushColor(cc);

              // Winding
              indices.push(vertCount + 0, vertCount + 1, vertCount + 2, vertCount + 0, vertCount + 2, vertCount + 3);
              vertCount += 4;
            }
          }
        }
      }

      // Create or update mesh
      if (!this.mesh) {
        this.mesh = new BABYLON.Mesh(`chunk_${this.cx}_${this.cy}_${this.cz}`, scene);
        this.mesh.checkCollisions = true;
        this.mesh.isPickable = true;
        this.mesh.metadata = { isChunk: true, cx: this.cx, cy: this.cy, cz: this.cz };

        const mat = new BABYLON.StandardMaterial(`mat_${this.cx}_${this.cy}_${this.cz}`, scene);
        mat.vertexColorEnabled = true;
        mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        mat.backFaceCulling = true;
        this.mesh.material = mat;
      } else {
        // wipe old geometry
        this.mesh.geometry?.dispose();
      }

      if (positions.length === 0) {
        // No faces -> keep an empty mesh to remain pickable? better disable pick + collisions
        this.mesh.isPickable = false;
        this.mesh.checkCollisions = false;
        this.mesh.setEnabled(false);
      } else {
        this.mesh.setEnabled(true);
        this.mesh.isPickable = true;
        this.mesh.checkCollisions = true;

        const vd = new BABYLON.VertexData();
        vd.positions = positions;
        vd.indices = indices;
        vd.normals = normals;
        vd.colors = colors;
        vd.applyToMesh(this.mesh, true);
      }

      this.dirty = false;
      this.inQueue = false;
    }
  }

  class VoxelWorld {
    constructor(scene) {
      this.scene = scene;
      this.chunks = new Map();
      this.dirtyQueue = [];
      this.dirtySet = new Set();
    }

    getChunk(cx, cy, cz, create = false) {
      const k = key(cx, cy, cz);
      let c = this.chunks.get(k);
      if (!c && create) {
        c = new Chunk(this, cx, cy, cz);
        this.chunks.set(k, c);
      }
      return c || null;
    }

    getBlock(x, y, z) {
      const cx = floorDiv(x, CHUNK_SIZE);
      const cy = floorDiv(y, CHUNK_SIZE);
      const cz = floorDiv(z, CHUNK_SIZE);
      const c = this.getChunk(cx, cy, cz, false);
      if (!c) return BLOCK.AIR;
      const lx = mod(x, CHUNK_SIZE);
      const ly = mod(y, CHUNK_SIZE);
      const lz = mod(z, CHUNK_SIZE);
      return c.getLocal(lx, ly, lz);
    }

    setBlock(x, y, z, v) {
      const cx = floorDiv(x, CHUNK_SIZE);
      const cy = floorDiv(y, CHUNK_SIZE);
      const cz = floorDiv(z, CHUNK_SIZE);
      const c = this.getChunk(cx, cy, cz, true);
      const lx = mod(x, CHUNK_SIZE);
      const ly = mod(y, CHUNK_SIZE);
      const lz = mod(z, CHUNK_SIZE);
      c.setLocal(lx, ly, lz, v);

      this.markDirty(cx, cy, cz);

      // If changed block on boundary, neighbor chunk face exposure changes too
      if (lx === 0) this.markDirty(cx - 1, cy, cz);
      if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cy, cz);
      if (ly === 0) this.markDirty(cx, cy - 1, cz);
      if (ly === CHUNK_SIZE - 1) this.markDirty(cx, cy + 1, cz);
      if (lz === 0) this.markDirty(cx, cy, cz - 1);
      if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cy, cz + 1);
    }

    markDirty(cx, cy, cz) {
      const c = this.getChunk(cx, cy, cz, false);
      if (!c) return;
      c.dirty = true;
      const k = key(cx, cy, cz);
      if (!this.dirtySet.has(k)) {
        this.dirtySet.add(k);
        c.inQueue = true;
        this.dirtyQueue.push(c);
      }
    }

    drainDirtyAll() {
      while (this.dirtyQueue.length) {
        const c = this.dirtyQueue.shift();
        const k = key(c.cx, c.cy, c.cz);
        this.dirtySet.delete(k);
        if (c.dirty) c.rebuildMesh();
      }
    }

    rebuildSome(maxPerFrame = 2) {
      let n = 0;
      while (n < maxPerFrame && this.dirtyQueue.length) {
        const c = this.dirtyQueue.shift();
        const k = key(c.cx, c.cy, c.cz);
        this.dirtySet.delete(k);
        if (c.dirty) c.rebuildMesh();
        n++;
      }
    }
  }

  const world = new VoxelWorld(scene);

  /** ---------------------------
   *  City generation (voxel data)
   *  --------------------------- */
  // City dimensions in blocks
  const CITY_HALF = 64; // extends [-CITY_HALF..CITY_HALF)
  const GROUND_Y = 0;

  // Ensure chunk existence in range (for startup mesh build)
  function ensureChunkRange(x0, x1, y0, y1, z0, z1) {
    const cx0 = floorDiv(x0, CHUNK_SIZE);
    const cx1 = floorDiv(x1, CHUNK_SIZE);
    const cy0 = floorDiv(y0, CHUNK_SIZE);
    const cy1 = floorDiv(y1, CHUNK_SIZE);
    const cz0 = floorDiv(z0, CHUNK_SIZE);
    const cz1 = floorDiv(z1, CHUNK_SIZE);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          world.getChunk(cx, cy, cz, true);
        }
      }
    }
  }

  // Pre-create chunks covering ground and building heights
  ensureChunkRange(-CITY_HALF, CITY_HALF - 1, 0, 32, -CITY_HALF, CITY_HALF - 1);

  // Ground/road layer
  for (let z = -CITY_HALF; z < CITY_HALF; z++) {
    for (let x = -CITY_HALF; x < CITY_HALF; x++) {
      // Simple road grid: thick main roads every 8 blocks, with intersections
      const ax = Math.abs(x);
      const az = Math.abs(z);
      const isRoad =
        (ax % 16 <= 2) || (az % 16 <= 2) || (ax <= 2) || (az <= 2); // plus central cross
      world.setBlock(x, GROUND_Y, z, isRoad ? BLOCK.ROAD : BLOCK.ROAD); // keep all as ROAD for collision base
    }
  }

  // Buildings on lots: grid spacing
  function rand01(seed) {
    // deterministic-ish hash
    const s = Math.sin(seed) * 10000;
    return s - Math.floor(s);
  }

  const lotStep = 8;
  for (let gz = -CITY_HALF + 4; gz < CITY_HALF - 4; gz += lotStep) {
    for (let gx = -CITY_HALF + 4; gx < CITY_HALF - 4; gx += lotStep) {
      // Skip road corridors
      const isRoadCorridor = (Math.abs(gx) % 16 <= 2) || (Math.abs(gz) % 16 <= 2) || (Math.abs(gx) <= 2) || (Math.abs(gz) <= 2);
      if (isRoadCorridor) continue;

      const seed = gx * 1337 + gz * 7331;
      const chance = rand01(seed);
      if (chance < 0.35) continue;

      const w = 3 + Math.floor(rand01(seed + 1) * 4); // 3..6
      const d = 3 + Math.floor(rand01(seed + 2) * 4);
      const h = 4 + Math.floor(rand01(seed + 3) * 14); // 4..17

      const x0 = gx - Math.floor(w / 2);
      const z0 = gz - Math.floor(d / 2);

      for (let y = 1; y <= h; y++) {
        for (let z = z0; z < z0 + d; z++) {
          for (let x = x0; x < x0 + w; x++) {
            world.setBlock(x, y, z, BLOCK.BUILDING);
          }
        }
      }
    }
  }

  // Scattered crates
  for (let i = 0; i < 220; i++) {
    const seed = i * 999;
    const x = Math.floor((rand01(seed + 1) * 2 - 1) * (CITY_HALF - 4));
    const z = Math.floor((rand01(seed + 2) * 2 - 1) * (CITY_HALF - 4));
    // avoid central roads a bit
    if ((Math.abs(x) % 16 <= 2) || (Math.abs(z) % 16 <= 2) || (Math.abs(x) <= 2) || (Math.abs(z) <= 2)) continue;
    world.setBlock(x, 1, z, BLOCK.CRATE);
    if (rand01(seed + 3) > 0.7) world.setBlock(x, 2, z, BLOCK.CRATE);
  }

  // Mark all chunks dirty once after generation, then build up-front
  for (const c of world.chunks.values()) {
    c.dirty = true;
    if (!c.inQueue) {
      c.inQueue = true;
      world.dirtyQueue.push(c);
      world.dirtySet.add(key(c.cx, c.cy, c.cz));
    }
  }
  world.drainDirtyAll(); // build everything up-front

  /** ---------------------------
   *  Player (invisible capsule collider)
   *  --------------------------- */
  const player = BABYLON.MeshBuilder.CreateCapsule(
    "player",
    { radius: 0.45, height: 1.7, tessellation: 8, subdivisions: 1 },
    scene
  );
  player.isVisible = false;
  player.checkCollisions = true;
  player.ellipsoid = new BABYLON.Vector3(0.45, 0.85, 0.45);
  player.ellipsoidOffset = new BABYLON.Vector3(0, 0.85, 0);
  player.position.set(0, 3, 10);

  // FollowCamera (no attachControl — no touch gestures)
  const camera = new BABYLON.FollowCamera("cam", new BABYLON.Vector3(0, 6, -12), scene);
  camera.lockedTarget = player;
  camera.radius = 10;
  camera.heightOffset = 4;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.08;
  camera.maxCameraSpeed = 12;
  scene.activeCamera = camera;

  // Smooth movement
  const move = {
    vel: new BABYLON.Vector3(0, 0, 0),
    wish: new BABYLON.Vector3(0, 0, 0),
    grounded: false,
    lastGroundedTime: 0,
    jumpRequested: false,
  };

  function nowSec() {
    return performance.now() / 1000;
  }

  // Button state
  const btnState = { breakPressed: false };

  function bindPressHold(btn, onDown, onUp) {
    const down = (e) => {
      e.preventDefault();
      onDown();
    };
    const up = (e) => {
      e.preventDefault();
      onUp();
    };
    btn.addEventListener("pointerdown", down, { passive: false });
    btn.addEventListener("pointerup", up, { passive: false });
    btn.addEventListener("pointercancel", up, { passive: false });
    btn.addEventListener("pointerleave", up, { passive: false });
    btn.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  bindPressHold(
    jumpBtn,
    () => {
      move.jumpRequested = true;
    },
    () => {}
  );

  bindPressHold(
    breakBtn,
    () => {
      btnState.breakPressed = true;
    },
    () => {
      btnState.breakPressed = false;
    }
  );

  /** ---------------------------
   *  Break action (raycast from screen center)
   *  --------------------------- */
  function breakTargetVoxel() {
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();
    const ray = scene.createPickingRay(w / 2, h / 2, BABYLON.Matrix.Identity(), camera);

    const hit = scene.pickWithRay(ray, (m) => !!m && m.isEnabled() && m.metadata && m.metadata.isChunk);
    if (!hit || !hit.hit || !hit.pickedPoint || !hit.getNormal()) return false;

    const n = hit.getNormal(true);
    const p = hit.pickedPoint;

    // Move slightly inside the hit block along -normal
    const inside = p.subtract(n.scale(0.02));
    const vx = Math.floor(inside.x);
    const vy = Math.floor(inside.y);
    const vz = Math.floor(inside.z);

    const cur = world.getBlock(vx, vy, vz);
    if (cur === BLOCK.AIR) return false;

    world.setBlock(vx, vy, vz, BLOCK.AIR);
    return true;
  }

  /** ---------------------------
   *  Creeper-like enemy
   *  --------------------------- */
  // Invisible collider for movement/collisions + separate blocky visuals.
  const creeper = BABYLON.MeshBuilder.CreateBox("creeper", { width: 0.85, height: 2.0, depth: 0.85 }, scene);
  creeper.position.set(8, 2, 8);
  creeper.checkCollisions = true;
  creeper.isPickable = false;
  creeper.visibility = 0;

  const creeperVisualRoot = new BABYLON.TransformNode("creeperVisualRoot", scene);
  creeperVisualRoot.parent = creeper;

  const creeperMat = new BABYLON.StandardMaterial("creeperMat", scene);
  creeperMat.diffuseColor = new BABYLON.Color3(0.2, 0.75, 0.25);
  creeperMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

  const creeperDarkMat = new BABYLON.StandardMaterial("creeperDarkMat", scene);
  creeperDarkMat.diffuseColor = new BABYLON.Color3(0.06, 0.12, 0.06);
  creeperDarkMat.specularColor = new BABYLON.Color3(0, 0, 0);

  const torso = BABYLON.MeshBuilder.CreateBox("creeperTorso", { width: 0.78, height: 1.2, depth: 0.62 }, scene);
  torso.parent = creeperVisualRoot;
  torso.position.set(0, 0.2, 0);
  torso.material = creeperMat;
  torso.isPickable = false;

  const head = BABYLON.MeshBuilder.CreateBox("creeperHead", { size: 0.82 }, scene);
  head.parent = creeperVisualRoot;
  head.position.set(0, 1.2, 0);
  head.material = creeperMat;
  head.isPickable = false;

  const footL = BABYLON.MeshBuilder.CreateBox("creeperFootL", { width: 0.32, height: 0.75, depth: 0.32 }, scene);
  footL.parent = creeperVisualRoot;
  footL.position.set(-0.2, -0.75, 0);
  footL.material = creeperMat;
  footL.isPickable = false;

  const footR = BABYLON.MeshBuilder.CreateBox("creeperFootR", { width: 0.32, height: 0.75, depth: 0.32 }, scene);
  footR.parent = creeperVisualRoot;
  footR.position.set(0.2, -0.75, 0);
  footR.material = creeperMat;
  footR.isPickable = false;

  // Blocky frowny face on the front of the head.
  const faceParts = [
    [-0.16, 1.32, 0.43, 0.12, 0.12, 0.04],
    [0.16, 1.32, 0.43, 0.12, 0.12, 0.04],
    [0.0, 1.05, 0.43, 0.14, 0.16, 0.04],
    [-0.1, 0.96, 0.43, 0.12, 0.08, 0.04],
    [0.1, 0.96, 0.43, 0.12, 0.08, 0.04],
  ];
  for (const [x, y, z, w, h, d] of faceParts) {
    const part = BABYLON.MeshBuilder.CreateBox("creeperFacePart", { width: w, height: h, depth: d }, scene);
    part.parent = creeperVisualRoot;
    part.position.set(x, y, z);
    part.material = creeperDarkMat;
    part.isPickable = false;
  }

  const creeperState = {
    dir: new BABYLON.Vector3(1, 0, 0),
    nextWanderAt: 0,
    fuse: 0,
    chasing: false,
  };

  // Camera shake
  const shake = { t: 0, amp: 0 };
  const camShakeOffset = new BABYLON.Vector3(0, 0, 0);

  function triggerShake(amplitude, duration) {
    shake.amp = Math.max(shake.amp, amplitude);
    shake.t = Math.max(shake.t, duration);
  }

  function explosionAt(pos, radius) {
    const cx = Math.floor(pos.x);
    const cy = Math.floor(pos.y);
    const cz = Math.floor(pos.z);
    const r2 = radius * radius;

    // Keep a small support pad under the player so creeper explosions never drop us.
    const supportY = Math.floor(player.position.y - 0.9);
    const supportX = Math.floor(player.position.x);
    const supportZ = Math.floor(player.position.z);

    const minX = cx - radius,
      maxX = cx + radius;
    const minY = cy - radius,
      maxY = cy + radius;
    const minZ = cz - radius,
      maxZ = cz + radius;

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - cx,
            dy = y - cy,
            dz = z - cz;
          if (dx * dx + dy * dy + dz * dz > r2) continue;

          // Preserve a 3x3 footing area directly beneath the player.
          const inPlayerPad =
            y === supportY && Math.abs(x - supportX) <= 1 && Math.abs(z - supportZ) <= 1;
          if (inPlayerPad) continue;

          if (world.getBlock(x, y, z) !== BLOCK.AIR) world.setBlock(x, y, z, BLOCK.AIR);
        }
      }
    }

    // Reassert support pad in case the area was already damaged by earlier blasts.
    for (let z = supportZ - 1; z <= supportZ + 1; z++) {
      for (let x = supportX - 1; x <= supportX + 1; x++) {
        world.setBlock(x, supportY, z, BLOCK.ROAD);
      }
    }

    // Keep vertical momentum from carrying us downward right after the blast.
    if (move.vel.y < 0) move.vel.y = 0;
    move.grounded = true;
    move.lastGroundedTime = nowSec();

    // small shake
    triggerShake(0.35, 0.25);
  }

  function respawnCreeper() {
    // pick a random city spot on ground
    for (let tries = 0; tries < 50; tries++) {
      const seed = Math.random() * 99999;
      const x = Math.floor((seed % 1) * 2 * CITY_HALF - CITY_HALF);
      const z = Math.floor((((seed * 1.37) % 1) * 2 * CITY_HALF) - CITY_HALF);
      const y = 2;

      // avoid roads center a bit
      if ((Math.abs(x) <= 4) || (Math.abs(z) <= 4)) continue;

      creeper.position.set(x, y, z);
      creeperState.fuse = 0;
      creeperState.nextWanderAt = 0;
      return;
    }
    creeper.position.set(10, 2, 10);
  }

  /** ---------------------------
   *  Movement + Camera look (right joystick)
   *  --------------------------- */
  let camYaw = 180; // degrees (FollowCamera rotationOffset)
  let camPitch = 4; // heightOffset baseline

  function updateCameraLook(dt) {
    const lookX = rightJoy.value.x;
    const lookY = rightJoy.value.y;

    // deadzone
    const dz = 0.08;
    const lx = Math.abs(lookX) < dz ? 0 : lookX;
    const ly = Math.abs(lookY) < dz ? 0 : lookY;

    // sensitivity tuned for iPad thumb
    camYaw += lx * 140 * dt;
    camPitch += -ly * 6.0 * dt;

    // clamp pitch (heightOffset)
    camPitch = Math.max(2.0, Math.min(7.5, camPitch));

    camera.rotationOffset = camYaw;
    camera.heightOffset = camPitch;
  }

  function cameraForwardXZ() {
    // Convert yaw to forward vector (world)
    const yawRad = (camYaw * Math.PI) / 180;
    // FollowCamera rotationOffset is degrees around Y; forward is opposite of camera-to-target vector
    // We'll define "forward" as facing where the camera looks (from player perspective).
    const fx = -Math.sin(yawRad);
    const fz = -Math.cos(yawRad);
    const v = new BABYLON.Vector3(fx, 0, fz);
    v.normalize();
    return v;
  }

  function cameraRightXZ() {
    const f = cameraForwardXZ();
    const r = new BABYLON.Vector3(f.z, 0, -f.x);
    r.normalize();
    return r;
  }

  function updatePlayer(dt) {
    // Determine grounded (simple: if vertical velocity ~0 and we collide down soon)
    // We'll use a short ray down from player to check if close to ground.
    const origin = player.position.add(new BABYLON.Vector3(0, 0.2, 0));
    const down = new BABYLON.Ray(origin, new BABYLON.Vector3(0, -1, 0), 0.35);
    const groundHit = scene.pickWithRay(down, (m) => m && m.metadata && m.metadata.isChunk && m.isEnabled());
    const isGrounded = !!(groundHit && groundHit.hit);

    move.grounded = isGrounded;
    if (isGrounded) move.lastGroundedTime = nowSec();

    // Wish direction from left joystick in camera space
    const inX = leftJoy.value.x;
    const inY = leftJoy.value.y;

    const deadzone = 0.12;
    const ax = Math.abs(inX) < deadzone ? 0 : inX;
    const ay = Math.abs(inY) < deadzone ? 0 : inY;

    const f = cameraForwardXZ();
    const r = cameraRightXZ();

    move.wish.copyFrom(f.scale(-ay)).addInPlace(r.scale(ax));
    const wishLen = move.wish.length();
    if (wishLen > 1e-3) move.wish.scaleInPlace(1 / Math.max(1, wishLen)); // normalize max 1

    const speed = 5.2; // blocks/sec
    const accel = 18.0;
    const friction = 12.0;

    // horizontal velocity
    const hv = new BABYLON.Vector3(move.vel.x, 0, move.vel.z);

    if (wishLen < 1e-3) {
      // friction
      const drop = friction * dt;
      const newLen = Math.max(0, hv.length() - drop);
      if (hv.length() > 1e-3) hv.scaleInPlace(newLen / hv.length());
    } else {
      // accelerate toward wish
      const desired = move.wish.scale(speed);
      const delta = desired.subtract(hv);
      const maxStep = accel * dt;
      const dlen = delta.length();
      if (dlen > maxStep) delta.scaleInPlace(maxStep / dlen);
      hv.addInPlace(delta);
    }

    move.vel.x = hv.x;
    move.vel.z = hv.z;

    // gravity
    const grav = -18.5;
    move.vel.y += grav * dt;

    // jump (with small coyote time)
    const coyote = 0.12;
    if (move.jumpRequested) {
      move.jumpRequested = false;
      if (move.grounded || nowSec() - move.lastGroundedTime <= coyote) {
        move.vel.y = 7.2;
      }
    }

    // Move with collisions
    const disp = move.vel.scale(dt);
    player.moveWithCollisions(disp);

    // If we hit ground, damp vertical velocity
    if (move.grounded && move.vel.y < 0) move.vel.y = -0.5;
  }

  /** ---------------------------
   *  Creeper AI update
   *  --------------------------- */
  function updateCreeper(dt) {
    const playerPos = player.position;
    const cPos = creeper.position;

    const toPlayer = playerPos.subtract(cPos);
    const dist = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z); // XZ distance

    const chaseRange = 14;
    const explodeRange = 2.1;
    const speedWander = 1.6;
    const speedChase = 2.6;

    const t = nowSec();
    creeperState.chasing = dist < chaseRange;

    if (!creeperState.chasing) {
      // wander
      if (t >= creeperState.nextWanderAt) {
        creeperState.nextWanderAt = t + 1.0 + Math.random() * 1.2;
        const ang = Math.random() * Math.PI * 2;
        creeperState.dir.set(Math.cos(ang), 0, Math.sin(ang));
      }
      const step = creeperState.dir.scale(speedWander * dt);
      creeper.moveWithCollisions(step);
      if (creeperState.dir.lengthSquared() > 1e-4) {
        creeperVisualRoot.rotation.y = Math.atan2(creeperState.dir.x, creeperState.dir.z);
      }
      creeperState.fuse = 0;
    } else {
      // chase
      const dir = new BABYLON.Vector3(toPlayer.x, 0, toPlayer.z);
      const len = dir.length();
      if (len > 1e-3) dir.scaleInPlace(1 / len);

      const step = dir.scale(speedChase * dt);
      creeper.moveWithCollisions(step);
      if (len > 1e-3) creeperVisualRoot.rotation.y = Math.atan2(dir.x, dir.z);

      // fuse/explosion
      if (dist < explodeRange) {
        creeperState.fuse += dt;
        // visual "about to explode" cue
        const pulse = 0.5 + 0.5 * Math.sin(creeperState.fuse * 18);
        creeperVisualRoot.scaling.setAll(1 + pulse * 0.08);

        if (creeperState.fuse >= 1.25) {
          // explode: remove voxels within radius
          const boomPos = creeper.position.clone();
          explosionAt(boomPos, 4);

          // reset creeper
          creeperVisualRoot.scaling.setAll(1);
          respawnCreeper();
        }
      } else {
        creeperState.fuse = Math.max(0, creeperState.fuse - dt * 0.8);
        creeperVisualRoot.scaling.setAll(1);
      }
    }

    // keep creeper near y=2-ish (soft)
    if (creeper.position.y < 1.5) creeper.position.y = 2;
    if (creeper.position.y > 6) creeper.position.y = 2;
  }

  /** ---------------------------
   *  Per-frame chunk rebuild throttle + camera shake
   *  --------------------------- */
  function applyCameraShake(dt) {
    if (shake.t <= 0) {
      camShakeOffset.set(0, 0, 0);
      return;
    }
    shake.t -= dt;
    const a = shake.amp * (shake.t / Math.max(1e-3, shake.t + dt)); // fade-ish

    camShakeOffset.set(
      (Math.random() * 2 - 1) * a,
      (Math.random() * 2 - 1) * a,
      (Math.random() * 2 - 1) * a
    );

    // FollowCamera updates its position internally; apply a small additive offset after update.
    camera.position.addInPlace(camShakeOffset);

    if (shake.t <= 0) {
      shake.amp = 0;
      camShakeOffset.set(0, 0, 0);
    }
  }

  /** ---------------------------
   *  Main loop
   *  --------------------------- */
  let lastT = performance.now();

  // Break cooldown to avoid removing too many blocks per second by holding
  let breakCooldown = 0;

  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    updateCameraLook(dt);
    updatePlayer(dt);
    updateCreeper(dt);

    // Hold-to-break with cooldown
    breakCooldown -= dt;
    if (btnState.breakPressed && breakCooldown <= 0) {
      const did = breakTargetVoxel();
      if (did) breakCooldown = 0.12;
      else breakCooldown = 0.06;
    }

    // Rebuild only when needed
    if (world.dirtyQueue.length) world.rebuildSome(2);

    applyCameraShake(dt);

    // Status
    statusEl.textContent = `Chunks: ${world.chunks.size} | Dirty: ${world.dirtyQueue.length} | Pos: ${player.position.x.toFixed(
      1
    )}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}`;
  });

  engine.runRenderLoop(() => scene.render());

  window.addEventListener("resize", () => engine.resize());

  // Extra iPad Safari: stop elastic scrolling if any touch slips outside UI
  document.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  // Optional: expose a quick debug helper
  window.__blockCity = { scene, world, player, creeper };
})();
