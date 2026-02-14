const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

const statusEl = document.getElementById("status");
const breakBtn = document.getElementById("breakBtn");
const jumpBtn = document.getElementById("jumpBtn");

// Prevent iOS double-tap zoom (especially on buttons)
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
function chunkKey(cx, cy, cz) {
  return `${cx},${cy},${cz}`;
}

class Chunk {
  constructor(scene, cx, cy, cz) {
    this.scene = scene;
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOL); // all AIR
    this.mesh = null;
  }
  get(lx, ly, lz) {
    if (lx < 0 || ly < 0 || lz < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE || lz >= CHUNK_SIZE) return BLOCK.AIR;
    return this.blocks[idx(lx, ly, lz)];
  }
  set(lx, ly, lz, v) {
    if (lx < 0 || ly < 0 || lz < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
    this.blocks[idx(lx, ly, lz)] = v;
  }
  origin() {
    return new BABYLON.Vector3(this.cx * CHUNK_SIZE, this.cy * CHUNK_SIZE, this.cz * CHUNK_SIZE);
  }
}

class VoxelWorld {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.dirtyQueue = new Set(); // chunk keys

    this.mat = new BABYLON.StandardMaterial("chunkMat", scene);
    this.mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    this.mat.backFaceCulling = true;
  }

  getChunk(cx, cy, cz, create = false) {
    const key = chunkKey(cx, cy, cz);
    let c = this.chunks.get(key);
    if (!c && create) {
      c = new Chunk(this.scene, cx, cy, cz);
      this.chunks.set(key, c);
      this.dirtyQueue.add(key);
    }
    return c;
  }

  getBlock(wx, wy, wz) {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cy = floorDiv(wy, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.getChunk(cx, cy, cz, false);
    if (!c) return BLOCK.AIR;
    const lx = mod(wx, CHUNK_SIZE);
    const ly = mod(wy, CHUNK_SIZE);
    const lz = mod(wz, CHUNK_SIZE);
    return c.get(lx, ly, lz);
  }

  setBlock(wx, wy, wz, v) {
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cy = floorDiv(wy, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const c = this.getChunk(cx, cy, cz, true);
    const lx = mod(wx, CHUNK_SIZE);
    const ly = mod(wy, CHUNK_SIZE);
    const lz = mod(wz, CHUNK_SIZE);

    c.set(lx, ly, lz, v);
    this.markDirty(cx, cy, cz);

    // Boundary neighbors dirty
    if (lx === 0) this.markDirty(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cy, cz);
    if (ly === 0) this.markDirty(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.markDirty(cx, cy + 1, cz);
    if (lz === 0) this.markDirty(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cy, cz + 1);
  }

  markDirty(cx, cy, cz) {
    const key = chunkKey(cx, cy, cz);
    if (this.chunks.has(key)) this.dirtyQueue.add(key);
  }

  rebuildSome(maxPerFrame = 2) {
    let built = 0;
    for (const key of this.dirtyQueue) {
      const c = this.chunks.get(key);
      if (c) this.buildChunkMesh(c);
      this.dirtyQueue.delete(key);
      built++;
      if (built >= maxPerFrame) break;
    }
  }

  buildChunkMesh(chunk) {
    if (chunk.mesh) {
      chunk.mesh.dispose();
      chunk.mesh = null;
    }

    const positions = [];
    const normals = [];
    const indices = [];
    const uvs = [];
    const colors = [];

    const origin = chunk.origin();

    const faces = [
      { n: [1, 0, 0],  v: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] }, // +X
      { n: [-1,0,0],  v: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] }, // -X
      { n: [0, 1, 0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] }, // +Y
      { n: [0,-1,0],  v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] }, // -Y
      { n: [0, 0, 1], v: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] }, // +Z
      { n: [0, 0,-1], v: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }, // -Z
    ];

    function blockColor(bt) {
      if (bt === BLOCK.ROAD) return [0.10, 0.10, 0.12, 1];
      if (bt === BLOCK.BUILDING) return [0.35, 0.38, 0.42, 1];
      if (bt === BLOCK.CRATE) return [0.45, 0.30, 0.18, 1];
      return [1, 1, 1, 1];
    }

    let vertCount = 0;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const bt = chunk.get(lx, ly, lz);
          if (bt === BLOCK.AIR) continue;

          const wx = origin.x + lx;
          const wy = origin.y + ly;
          const wz = origin.z + lz;

          const col = blockColor(bt);

          for (let f = 0; f < faces.length; f++) {
            const face = faces[f];
            const nx = face.n[0], ny = face.n[1], nz = face.n[2];

            const nb = this.getBlock(wx + nx, wy + ny, wz + nz);
            if (nb !== BLOCK.AIR) continue;

            for (let i = 0; i < 4; i++) {
              const cv = face.v[i];
              positions.push(wx + cv[0], wy + cv[1], wz + cv[2]);
              normals.push(nx, ny, nz);
              uvs.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
              colors.push(col[0], col[1], col[2], col[3]);
            }

            indices.push(
              vertCount + 0, vertCount + 1, vertCount + 2,
              vertCount + 0, vertCount + 2, vertCount + 3
            );
            vertCount += 4;
          }
        }
      }
    }

    if (indices.length === 0) return;

    const mesh = new BABYLON.Mesh(`chunk_${chunk.cx}_${chunk.cy}_${chunk.cz}`, this.scene);
    mesh.material = this.mat;
    mesh.checkCollisions = true;

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.indices = indices;
    vd.uvs = uvs;
    vd.colors = colors;
    vd.applyToMesh(mesh, true);

    chunk.mesh = mesh;
  }
}

/** ---------------------------
 *  Scene
 *  --------------------------- */
function makeScene() {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.08, 1);

  // Light
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.2), scene);
  hemi.intensity = 0.9;

  const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.4, -1, 0.2), scene);
  dir.position = new BABYLON.Vector3(40, 80, -40);
  dir.intensity = 0.6;

  // Invisible ground collider
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 260, height: 260 }, scene);
  ground.isVisible = false;
  ground.checkCollisions = true;

  // Player collider
  const player = BABYLON.MeshBuilder.CreateCapsule("player", { height: 2.0, radius: 0.45 }, scene);
  player.isVisible = false;
  player.position = new BABYLON.Vector3(0, 3, 0);
  player.checkCollisions = true;

  // Camera (disable touch controls by NOT attaching to canvas)
  const camera = new BABYLON.FollowCamera("cam", new BABYLON.Vector3(0, 6, -10), scene, player);
  camera.radius = 10;
  camera.heightOffset = 3.2;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 10;

  // Keep camera above horizon / stable
  camera.lowerRotationLimit = BABYLON.Tools.ToRadians(5);
  camera.upperRotationLimit = BABYLON.Tools.ToRadians(55);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 12;

  // Gravity + collisions
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.45, 0);
  player.ellipsoid = new BABYLON.Vector3(0.45, 0.9, 0.45);
  player.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);

  // Voxel world
  const vox = new VoxelWorld(scene);

  function fillBox(x0, y0, z0, x1, y1, z1, type) {
    for (let z = z0; z < z1; z++) {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) vox.setBlock(x, y, z, type);
      }
    }
  }

  // Roads
  for (let z = -120; z < 120; z++) {
    for (let x = -120; x < 120; x++) {
      vox.setBlock(x, 0, z, BLOCK.ROAD);
    }
  }

  // Buildings
  const spacing = 18;
  const half = 4;
  for (let ix = -half; ix <= half; ix++) {
    for (let iz = -half; iz <= half; iz++) {
      if (ix === 0 || iz === 0) continue;

      const baseX = ix * spacing;
      const baseZ = iz * spacing;

      const bw = Math.floor(8 + Math.random() * 6);
      const bd = Math.floor(8 + Math.random() * 6);
      const bh = Math.floor(6 + Math.random() * 18);

      fillBox(baseX, 1, baseZ, baseX + bw, 1 + bh, baseZ + bd, BLOCK.BUILDING);
    }
  }

  // Crates
  for (let i = 0; i < 50; i++) {
    const x = Math.floor((Math.random() - 0.5) * 180);
    const z = Math.floor((Math.random() - 0.5) * 180);
    vox.setBlock(x, 1, z, BLOCK.CRATE);
  }

  // Build ALL initial chunks now (one-time) so joystick is smooth
  while (vox.dirtyQueue.size > 0) {
    vox.rebuildSome(50);
  }

  // Creeper mesh
  const creeper = BABYLON.MeshBuilder.CreateBox("creeper", { size: 1.6 }, scene);
  creeper.position = new BABYLON.Vector3(20, 1.0, 20);
  creeper.checkCollisions = true;

  const cmat = new BABYLON.StandardMaterial("cmat", scene);
  cmat.diffuseColor = new BABYLON.Color3(0.10, 0.70, 0.25);
  creeper.material = cmat;

  // Creeper AI
  let creeperTarget = new BABYLON.Vector3(0, 0, 0);
  let nextWanderAt = 0;
  let explodeCooldown = 0;

  function pickWanderTarget() {
    creeperTarget = new BABYLON.Vector3((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 160);
  }
  pickWanderTarget();

  // Touch joystick input (improved for iPad)
  const pad = document.getElementById("pad");
  const stick = document.getElementById("stick");

  let moveX = 0, moveZ = 0; // [-1..1]
  let touching = false;
  let padRect = null;
  let padCenter = { x: 0, y: 0 };

  function updatePadGeometry() {
    padRect = pad.getBoundingClientRect();
    padCenter = { x: padRect.left + padRect.width / 2, y: padRect.top + padRect.height / 2 };
  }
  window.addEventListener("resize", updatePadGeometry);
  updatePadGeometry();

  function setStick(dx, dy) {
    const max = 45;
    const mag = Math.hypot(dx, dy);
    const clamp = mag > max ? max / mag : 1;
    const sx = dx * clamp;
    const sy = dy * clamp;

    stick.style.left = `${35 + sx}px`;
    stick.style.top = `${35 + sy}px`;

    moveX = sx / max;
    moveZ = sy / max;
  }

  pad.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      touching = true;
      updatePadGeometry();
      setStick(e.clientX - padCenter.x, e.clientY - padCenter.y);
    },
    { passive: false }
  );

  pad.addEventListener(
    "pointermove",
    (e) => {
      if (!touching) return;
      e.preventDefault();
      setStick(e.clientX - padCenter.x, e.clientY - padCenter.y);
    },
    { passive: false }
  );

  function endPad() {
    touching = false;
    stick.style.left = `35px`;
    stick.style.top = `35px`;
    moveX = 0;
    moveZ = 0;
  }
  pad.addEventListener("pointerup", endPad);
  pad.addEventListener("pointercancel", endPad);

  // Jump
  let yVelocity = 0;
  let onGround = false;

  function tryJump(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (onGround) yVelocity = 0.22;
  }
  jumpBtn.addEventListener("click", tryJump);
  jumpBtn.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

  // Break voxel
  function tryBreak(e) {
    if (e && e.preventDefault) e.preventDefault();

    const pick = scene.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);
    if (!pick || !pick.hit || !pick.pickedPoint) return;
    if (!pick.pickedMesh || typeof pick.pickedMesh.name !== "string" || !pick.pickedMesh.name.startsWith("chunk_")) return;

    const n = pick.getNormal(true);
    if (!n) return;

    const p = pick.pickedPoint;
    const eps = 0.01;

    const wx = Math.floor(p.x - n.x * eps);
    const wy = Math.floor(p.y - n.y * eps);
    const wz = Math.floor(p.z - n.z * eps);

    if (vox.getBlock(wx, wy, wz) !== BLOCK.AIR) {
      vox.setBlock(wx, wy, wz, BLOCK.AIR);
    }
  }
  breakBtn.addEventListener("click", tryBreak);
  breakBtn.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });

  // Explosion: delete voxels around point, shake camera
  function explodeAt(pos) {
    const radius = 10;
    const r2 = radius * radius;

    const minX = Math.floor(pos.x - radius);
    const maxX = Math.floor(pos.x + radius);
    const minY = Math.floor(pos.y - radius);
    const maxY = Math.floor(pos.y + radius);
    const minZ = Math.floor(pos.z - radius);
    const maxZ = Math.floor(pos.z + radius);

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = (x + 0.5) - pos.x;
          const dy = (y + 0.5) - pos.y;
          const dz = (z + 0.5) - pos.z;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            if (vox.getBlock(x, y, z) !== BLOCK.AIR) vox.setBlock(x, y, z, BLOCK.AIR);
          }
        }
      }
    }

    const original = camera.radius;
    camera.radius = original + 2;
    setTimeout(() => (camera.radius = original), 150);
  }

  // Main loop
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;

    // Only rebuild during gameplay when there are edits/explosions
    if (vox.dirtyQueue.size > 0) vox.rebuildSome(2);

    // Player movement relative to camera forward/right on XZ
    const forward = camera.getForwardRay().direction;
    const f = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
    const r = new BABYLON.Vector3(f.z, 0, -f.x).normalize();

    const speed = 10;
    const desired = r.scale(moveX).add(f.scale(moveZ));
    const move = desired.scale(speed * dt);

    yVelocity += scene.gravity.y * dt;
    const vertical = new BABYLON.Vector3(0, yVelocity, 0);

    player.moveWithCollisions(move.add(vertical));

    onGround = Math.abs(yVelocity) < 0.02 && player.position.y <= 2.01;
    if (onGround) {
      yVelocity = 0;
      player.position.y = Math.max(player.position.y, 2);
    }

    const distToPlayer = BABYLON.Vector3.Distance(creeper.position, player.position);
    explodeCooldown = Math.max(0, explodeCooldown - dt);

    let target;
    if (distToPlayer < 28) {
      target = player.position.clone();
    } else {
      if (performance.now() > nextWanderAt) {
        pickWanderTarget();
        nextWanderAt = performance.now() + 2500 + Math.random() * 2500;
      }
      target = creeperTarget;
    }

    const dirToTarget = target.subtract(creeper.position);
    dirToTarget.y = 0;
    const len = dirToTarget.length();
    if (len > 0.01) {
      const creeperSpeed = distToPlayer < 28 ? 6 : 3;
      const step = dirToTarget.normalize().scale(creeperSpeed * dt);
      creeper.moveWithCollisions(step);
    }

    if (distToPlayer < 3.0 && explodeCooldown <= 0) {
      explodeCooldown = 3.0;
      explodeAt(creeper.position.clone());
      creeper.position.addInPlace(new BABYLON.Vector3(6, 0, 6));
    }

    statusEl.textContent = `Chunks: ${vox.chunks.size} | Dirty: ${vox.dirtyQueue.size} | Creeper: ${distToPlayer.toFixed(1)}`;
  });

  // Prevent scrolling while interacting
  document.body.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  statusEl.textContent = "Running";
  return scene;
}

const scene = makeScene();
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
