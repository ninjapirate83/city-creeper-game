const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

const statusEl = document.getElementById("status");
const breakBtn = document.getElementById("breakBtn");
const jumpBtn = document.getElementById("jumpBtn");

const worldMeshes = new Set();

function makeScene() {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.08, 1);

  // Light
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0.2, 1, 0.2), scene);
  hemi.intensity = 0.9;

  const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.4, -1, 0.2), scene);
  dir.position = new BABYLON.Vector3(40, 80, -40);
  dir.intensity = 0.6;

  // Ground (street plane)
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 220, height: 220 }, scene);
  const gmat = new BABYLON.StandardMaterial("gmat", scene);
  gmat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.14);
  ground.material = gmat;
  ground.checkCollisions = true;

  // Player (invisible collider capsule)
  const player = BABYLON.MeshBuilder.CreateCapsule("player", { height: 2.0, radius: 0.45 }, scene);
  player.isVisible = false;
  player.position = new BABYLON.Vector3(0, 2, 0);
  player.checkCollisions = true;

  // Camera (third-person follow)
  const camera = new BABYLON.FollowCamera("cam", new BABYLON.Vector3(0, 6, -10), scene, player);
  camera.radius = 10;
  camera.heightOffset = 3.2;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 10;
  camera.attachControl(canvas, true);

  // Simple gravity + collisions
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.45, 0);
  player.ellipsoid = new BABYLON.Vector3(0.45, 0.9, 0.45);
  player.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);

  // City generator: blocks as buildings + street grid
  const buildingMat = new BABYLON.StandardMaterial("bmat", scene);
  buildingMat.diffuseColor = new BABYLON.Color3(0.35, 0.38, 0.42);

  const accentMat = new BABYLON.StandardMaterial("amat", scene);
  accentMat.diffuseColor = new BABYLON.Color3(0.25, 0.30, 0.34);

  function addBox(name, x, y, z, w, h, d, mat) {
    const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    b.position = new BABYLON.Vector3(x, y + h / 2, z);
    b.material = mat;
    b.checkCollisions = true;
    b.metadata = { breakable: true };
    worldMeshes.add(b);
    return b;
  }

  // Make simple “city blocks”
  const spacing = 18;
  const half = 4;
  for (let ix = -half; ix <= half; ix++) {
    for (let iz = -half; iz <= half; iz++) {
      // leave some “streets”
      if (ix === 0 || iz === 0) continue;
      const baseX = ix * spacing;
      const baseZ = iz * spacing;

      const bw = 8 + Math.random() * 6;
      const bd = 8 + Math.random() * 6;
      const bh = 6 + Math.random() * 18;

      addBox(`b_${ix}_${iz}`, baseX, 0, baseZ, bw, bh, bd, Math.random() > 0.4 ? buildingMat : accentMat);
    }
  }

  // “Props” to break (crates)
  const crateMat = new BABYLON.StandardMaterial("crate", scene);
  crateMat.diffuseColor = new BABYLON.Color3(0.45, 0.30, 0.18);

  for (let i = 0; i < 50; i++) {
    const x = (Math.random() - 0.5) * 180;
    const z = (Math.random() - 0.5) * 180;
    const c = BABYLON.MeshBuilder.CreateBox(`crate_${i}`, { size: 2 }, scene);
    c.position = new BABYLON.Vector3(x, 1, z);
    c.material = crateMat;
    c.checkCollisions = true;
    c.metadata = { breakable: true };
    worldMeshes.add(c);
  }

  // Creeper-like enemy (only monster)
  const creeper = BABYLON.MeshBuilder.CreateBox("creeper", { size: 1.6 }, scene);
  creeper.position = new BABYLON.Vector3(20, 1.0, 20);
  creeper.checkCollisions = true;

  const cmat = new BABYLON.StandardMaterial("cmat", scene);
  cmat.diffuseColor = new BABYLON.Color3(0.10, 0.70, 0.25);
  creeper.material = cmat;

  // Simple AI: wander, then chase when close
  let creeperTarget = new BABYLON.Vector3(0, 0, 0);
  let nextWanderAt = 0;
  let explodeCooldown = 0;

  function pickWanderTarget() {
    creeperTarget = new BABYLON.Vector3(
      (Math.random() - 0.5) * 160,
      0,
      (Math.random() - 0.5) * 160
    );
  }
  pickWanderTarget();

  // Touch joystick input
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
    stick.style.top  = `${35 + sy}px`;

    moveX = sx / max;
    moveZ = sy / max;
  }

  pad.addEventListener("pointerdown", (e) => {
    touching = true;
    updatePadGeometry();
    setStick(e.clientX - padCenter.x, e.clientY - padCenter.y);
  });
  pad.addEventListener("pointermove", (e) => {
    if (!touching) return;
    setStick(e.clientX - padCenter.x, e.clientY - padCenter.y);
  });
  pad.addEventListener("pointerup", () => {
    touching = false;
    stick.style.left = `35px`;
    stick.style.top  = `35px`;
    moveX = 0; moveZ = 0;
  });
  pad.addEventListener("pointercancel", () => {
    touching = false;
    stick.style.left = `35px`;
    stick.style.top  = `35px`;
    moveX = 0; moveZ = 0;
  });

  // Jump
  let yVelocity = 0;
  let onGround = false;

  function tryJump() {
    if (onGround) yVelocity = 0.22;
  }
  jumpBtn.addEventListener("click", tryJump);

  // Break (raycast from camera to remove breakable mesh)
  function tryBreak() {
    const ray = scene.createPickingRay(
      scene.getEngine().getRenderWidth() / 2,
      scene.getEngine().getRenderHeight() / 2,
      BABYLON.Matrix.Identity(),
      camera
    );
    const hit = scene.pickWithRay(ray, (m) => m && m.metadata && m.metadata.breakable);
    if (hit && hit.pickedMesh) {
      const m = hit.pickedMesh;
      worldMeshes.delete(m);
      m.dispose();
    }
  }
  breakBtn.addEventListener("click", tryBreak);

  // Explosion effect: remove nearby breakables, shake camera
  function explodeAt(pos) {
    const radius = 10;
    for (const m of Array.from(worldMeshes)) {
      if (!m || m.isDisposed()) continue;
      const d = BABYLON.Vector3.Distance(m.position, pos);
      if (d < radius) {
        worldMeshes.delete(m);
        m.dispose();
      }
    }
    // quick camera shake
    const original = camera.radius;
    camera.radius = original + 2;
    setTimeout(() => (camera.radius = original), 150);
  }

  // Main loop
  scene.onBeforeRenderObservable.add(() => {
    const dt = engine.getDeltaTime() / 1000;

    // Player movement relative to camera forward/right on XZ plane
    const forward = camera.getForwardRay().direction;
    const f = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
    const r = new BABYLON.Vector3(f.z, 0, -f.x).normalize();

    const speed = 10; // units/sec
    const desired = r.scale(moveX).add(f.scale(moveZ));
    const move = desired.scale(speed * dt);

    // gravity + basic jump
    yVelocity += scene.gravity.y * dt;
    const vertical = new BABYLON.Vector3(0, yVelocity, 0);

    // move with collisions
    player.moveWithCollisions(move.add(vertical));

    // crude ground check
    onGround = Math.abs(yVelocity) < 0.02 && player.position.y <= 2.01;
    if (onGround) {
      yVelocity = 0;
      player.position.y = Math.max(player.position.y, 2);
    }

    // Creeper behavior
    const distToPlayer = BABYLON.Vector3.Distance(creeper.position, player.position);

    // Cooldowns
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

    // “Explosion” when close (player cannot die)
    if (distToPlayer < 3.0 && explodeCooldown <= 0) {
      explodeCooldown = 3.0;
      explodeAt(creeper.position.clone());
      // knock creeper back a bit so it doesn't chain-explode
      creeper.position.addInPlace(new BABYLON.Vector3(6, 0, 6));
    }

    statusEl.textContent = `Blocks: ${worldMeshes.size} | Creeper dist: ${distToPlayer.toFixed(1)}`;
  });

  // Helpful: prevent page scroll while playing
  document.body.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  statusEl.textContent = "Running";
  return scene;
}

const scene = makeScene();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
