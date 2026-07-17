// Central Application Coordination & UI Logic for AstroPhysics Sandbox

import { PhysicsEngine, Body, GasParticle } from './physics.js';
import { CanvasRenderer } from './canvas.js';
import { audio } from './audio.js';
import { loadPreset } from './presets.js';

// Initialize Core Engines
const canvas = document.getElementById('spaceCanvas');
const engine = new PhysicsEngine();
const renderer = new CanvasRenderer(canvas, engine);

// State Variables
let isPaused = false;
let activeTool = 'select';
let selectedBody = null;
let lastSelectedBodyId = null;
let dragLaunch = null;
let isDraggingCamera = false;
let lastMouseX = 0;
let lastMouseY = 0;
let isApplyingForce = false;
let forceMouseWorld = { x: 0, y: 0 };
let isSprayingGas = false;
let sprayMouseWorld = { x: 0, y: 0 };
let fpsLastTime = performance.now();
let fpsFrames = 0;
let bodyCounter = 1000; // start unique IDs

// Options object passed to renderer
const renderOptions = {
  showTrails: true,
  showPrediction: true,
  showVectors: false,
  showGrid: false,
  showHeatMap: false,
  dragLaunch: null
};

// Setup viewport resize
function handleResize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', handleResize);
handleResize();

// Center camera initially
renderer.camera.x = 0;
renderer.camera.y = 0;

// Setup initial Preset (Solar System)
loadPreset(engine, 'solar', window.innerWidth, window.innerHeight);

// ----------------------------------------------------
// Physics Engine Event Handlers (Trigger sound/effects)
// ----------------------------------------------------
engine.onCollision = (heavier, lighter, relVel, type) => {
  if (type === 'merge') {
    // Spark particles
    renderer.spawnExplosionSparks(lighter.x, lighter.y, lighter.color, 15);
    // Accretion chime
    audio.playSpawn(heavier.mass);
  } else if (type === 'bounce') {
    audio.playCollision(lighter.mass * relVel);
    renderer.spawnExplosionSparks((lighter.x + heavier.x) / 2, (lighter.y + heavier.y) / 2, '#ffffff', 5);
  } else if (type === 'explode') {
    audio.playCollision((lighter.mass + heavier.mass) * relVel * 2);
    // Massive sparks
    renderer.spawnExplosionSparks(lighter.x, lighter.y, lighter.color, 35);
    renderer.spawnExplosionSparks(heavier.x, heavier.y, heavier.color, 35);
  }
};

engine.onAccretion = (bh, planet) => {
  audio.playBlackHoleAccretion();
  // Violet/pink accretion sparks sucked into singularity
  renderer.spawnExplosionSparks(planet.x, planet.y, '#ff007f', 20);
};

engine.onIgnition = (b) => {
  audio.playCollision(b.mass * 10);
  renderer.spawnExplosionSparks(b.x, b.y, '#ffd15c', 80);
};

// ----------------------------------------------------
// UI Logic & Tab Navigation
// ----------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Slider inputs binding
const GSlider = document.getElementById('gravConstant');
const GVal = document.getElementById('gravConstantVal');
GSlider.addEventListener('input', () => {
  engine.G = parseFloat(GSlider.value);
  GVal.textContent = engine.G.toFixed(2);
});

const speedSlider = document.getElementById('timeStep');
const speedVal = document.getElementById('timeStepVal');
speedSlider.addEventListener('input', () => {
  engine.timeStep = parseFloat(speedSlider.value);
  speedVal.textContent = engine.timeStep.toFixed(1) + 'x';
});

const softSlider = document.getElementById('softening');
const softVal = document.getElementById('softeningVal');
softSlider.addEventListener('input', () => {
  engine.softening = parseInt(softSlider.value);
  softVal.textContent = engine.softening;
});

const collisionSelect = document.getElementById('collisionType');
collisionSelect.addEventListener('change', () => {
  engine.collisionType = collisionSelect.value;
});

// Checkboxes binding
const trailsChk = document.getElementById('showTrails');
trailsChk.addEventListener('change', () => renderOptions.showTrails = trailsChk.checked);

const predChk = document.getElementById('showPrediction');
predChk.addEventListener('change', () => renderOptions.showPrediction = predChk.checked);

const vectChk = document.getElementById('showVectors');
vectChk.addEventListener('change', () => renderOptions.showVectors = vectChk.checked);

const gridChk = document.getElementById('showGrid');
gridChk.addEventListener('change', () => renderOptions.showGrid = gridChk.checked);

const heatChk = document.getElementById('showHeatMap');
heatChk.addEventListener('change', () => renderOptions.showHeatMap = heatChk.checked);

// Pause / Clear
const pauseBtn = document.getElementById('pauseBtn');
pauseBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
  pauseBtn.classList.toggle('active', isPaused);
});

const clearBtn = document.getElementById('clearBtn');
clearBtn.addEventListener('click', () => {
  engine.clear();
  selectedBody = null;
  document.getElementById('inspectorPanel').classList.add('closed');
});

// ----------------------------------------------------
// Chemical Composer Syncing
// ----------------------------------------------------
const chemSliders = {
  rock: document.getElementById('chemRock'),
  metal: document.getElementById('chemMetal'),
  ice: document.getElementById('chemIce'),
  gas: document.getElementById('chemGas')
};
const chemValues = {
  rock: document.getElementById('chemRockVal'),
  metal: document.getElementById('chemMetalVal'),
  ice: document.getElementById('chemIceVal'),
  gas: document.getElementById('chemGasVal')
};

// Locks slider values to sum up to 100% proportionally
function solveChemSliders(changedKey) {
  const currentVal = parseInt(chemSliders[changedKey].value);
  chemValues[changedKey].textContent = `${currentVal}%`;

  const keys = ['rock', 'metal', 'ice', 'gas'];
  const otherKeys = keys.filter(k => k !== changedKey);
  
  const sumOther = otherKeys.reduce((acc, k) => acc + parseInt(chemSliders[k].value), 0);
  const targetOtherSum = 100 - currentVal;

  if (sumOther > 0) {
    let checkSum = 0;
    otherKeys.forEach(k => {
      const share = Math.round((parseInt(chemSliders[k].value) / sumOther) * targetOtherSum);
      chemSliders[k].value = share;
      chemValues[k].textContent = `${share}%`;
      checkSum += share;
    });

    // Resolve rounding differences on the first other slider
    const diff = targetOtherSum - checkSum;
    if (diff !== 0) {
      const adjustKey = otherKeys[0];
      const newVal = Math.max(0, parseInt(chemSliders[adjustKey].value) + diff);
      chemSliders[adjustKey].value = newVal;
      chemValues[adjustKey].textContent = `${newVal}%`;
    }
  } else {
    // Distribute remainder equally if everything else was zero
    const share = Math.round(targetOtherSum / 3);
    otherKeys.forEach(k => {
      chemSliders[k].value = share;
      chemValues[k].textContent = `${share}%`;
    });
  }
}

Object.keys(chemSliders).forEach(key => {
  chemSliders[key].addEventListener('input', () => solveChemSliders(key));
});

// Creator Preset profile mappings
const spawnTypeSelect = document.getElementById('spawnType');
const spawnMassSlider = document.getElementById('spawnMass');
const spawnMassVal = document.getElementById('spawnMassVal');
const spawnRadiusSlider = document.getElementById('spawnRadius');
const spawnRadiusVal = document.getElementById('spawnRadiusVal');

spawnMassSlider.addEventListener('input', () => spawnMassVal.textContent = spawnMassSlider.value);
spawnRadiusSlider.addEventListener('input', () => spawnRadiusVal.textContent = spawnRadiusSlider.value);

spawnTypeSelect.addEventListener('change', () => {
  const profile = spawnTypeSelect.value;
  switch (profile) {
    case 'rocky':
      spawnMassSlider.value = 100;
      spawnRadiusSlider.value = 11;
      chemSliders.rock.value = 75;
      chemSliders.metal.value = 25;
      chemSliders.ice.value = 0;
      chemSliders.gas.value = 0;
      break;
    case 'iron':
      spawnMassSlider.value = 220;
      spawnRadiusSlider.value = 10;
      chemSliders.rock.value = 15;
      chemSliders.metal.value = 85;
      chemSliders.ice.value = 0;
      chemSliders.gas.value = 0;
      break;
    case 'ice':
      spawnMassSlider.value = 50;
      spawnRadiusSlider.value = 9;
      chemSliders.rock.value = 25;
      chemSliders.metal.value = 5;
      chemSliders.ice.value = 70;
      chemSliders.gas.value = 0;
      break;
    case 'gas':
      spawnMassSlider.value = 600;
      spawnRadiusSlider.value = 22;
      chemSliders.rock.value = 5;
      chemSliders.metal.value = 5;
      chemSliders.ice.value = 10;
      chemSliders.gas.value = 80;
      break;
    case 'star':
      spawnMassSlider.value = 2000;
      spawnRadiusSlider.value = 35;
      chemSliders.rock.value = 0;
      chemSliders.metal.value = 0;
      chemSliders.ice.value = 0;
      chemSliders.gas.value = 100;
      break;
    case 'blackhole':
      spawnMassSlider.value = 4000;
      spawnRadiusSlider.value = 16;
      chemSliders.rock.value = 25;
      chemSliders.metal.value = 25;
      chemSliders.ice.value = 25;
      chemSliders.gas.value = 25;
      break;
  }
  
  // Sync sliders text readouts
  spawnMassVal.textContent = spawnMassSlider.value;
  spawnRadiusVal.textContent = spawnRadiusSlider.value;
  Object.keys(chemSliders).forEach(k => chemValues[k].textContent = `${chemSliders[k].value}%`);
});

// ----------------------------------------------------
// Cosmic Presets Loader
// ----------------------------------------------------
const presetButtons = document.querySelectorAll('.preset-btn');
presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    loadPreset(engine, btn.dataset.preset, window.innerWidth, window.innerHeight);
    selectedBody = null;
    document.getElementById('inspectorPanel').classList.add('closed');
    // Soft sound FX confirmation
    audio.playSpawn(1500);
  });
});

// ----------------------------------------------------
// Toolbar Action Selector
// ----------------------------------------------------
const toolButtons = document.querySelectorAll('.tool-btn');
toolButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    toolButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;

    // Reset action state variables
    isApplyingForce = false;
    audio.stopThrust();
    isSprayingGas = false;
    dragLaunch = null;
    renderOptions.dragLaunch = null;
  });
});

// Welcome dismissing
const welcomeOverlay = document.getElementById('welcomeOverlay');
const welcomeDismiss = document.getElementById('welcomeDismiss');
welcomeDismiss.addEventListener('click', () => {
  welcomeOverlay.classList.add('dismissed');
  // Initialize synth background drone
  audio.toggleMute();
  updateSoundButton();
});

// Sound toggler button
const soundToggle = document.getElementById('soundToggle');
soundToggle.addEventListener('click', () => {
  audio.toggleMute();
  updateSoundButton();
});

function updateSoundButton() {
  if (audio.isMuted) {
    soundToggle.classList.add('muted');
    soundToggle.querySelector('.icon').textContent = '🔇';
    soundToggle.querySelector('.text').textContent = 'Muted';
  } else {
    soundToggle.classList.remove('muted');
    soundToggle.querySelector('.icon').textContent = '🔊';
    soundToggle.querySelector('.text').textContent = 'Cosmic Synth';
  }
}

// ----------------------------------------------------
// Inspector Updating & Editable Fields
// ----------------------------------------------------
const inspectorPanel = document.getElementById('inspectorPanel');
const closeInspectorBtn = document.getElementById('closeInspectorBtn');
closeInspectorBtn.addEventListener('click', () => {
  selectedBody = null;
  inspectorPanel.classList.add('closed');
});

const inspectNameInput = document.getElementById('inspectName');
const inspectMassInput = document.getElementById('inspectMass');
const inspectRadiusInput = document.getElementById('inspectRadius');
const inspectFixedChk = document.getElementById('inspectFixed');

inspectNameInput.addEventListener('change', () => {
  if (selectedBody) selectedBody.name = inspectNameInput.value;
});
inspectMassInput.addEventListener('change', () => {
  if (selectedBody) {
    selectedBody.mass = Math.max(0.1, parseFloat(inspectMassInput.value));
    selectedBody.updateRadiusFromMass();
    selectedBody.color = selectedBody.calculateColor();
  }
});
inspectRadiusInput.addEventListener('change', () => {
  if (selectedBody) {
    selectedBody.radius = Math.max(1, parseFloat(inspectRadiusInput.value));
  }
});
inspectFixedChk.addEventListener('change', () => {
  if (selectedBody) selectedBody.isFixed = inspectFixedChk.checked;
});

// Inspector Actions
const spawnMoonBtn = document.getElementById('spawnMoonBtn');
spawnMoonBtn.addEventListener('click', () => {
  if (!selectedBody) return;
  
  const b = selectedBody;
  const dist = b.radius * 2.2 + 10;
  const moonMass = Math.max(1.0, b.mass * 0.02);
  const moonRadius = Math.max(2.0, Math.pow(moonMass, 0.35) * 1.5);
  
  // Calculate relative stable circular orbital velocity: v = sqrt(G * M_parent / d)
  const orbSpeed = Math.sqrt((engine.G * b.mass) / dist);
  
  // Spawn horizontally shifted, moving vertically relative to parent speed
  const mX = b.x + dist;
  const mY = b.y;
  const mVx = b.vx;
  const mVy = b.vy + orbSpeed;

  const moon = new Body(
    bodyCounter++, 
    `${b.name} Moon`, 
    mX, mY, mVx, mVy, 
    moonMass, moonRadius,
    { rock: 0.9, metal: 0.1, ice: 0.0, gas: 0.0 }
  );
  moon.updateRadiusFromMass();
  moon.color = moon.calculateColor();
  
  engine.addBody(moon);
  audio.playSpawn(moonMass);
});

const vaporizeBtn = document.getElementById('vaporizeBtn');
vaporizeBtn.addEventListener('click', () => {
  if (!selectedBody) return;
  engine.vaporizeBody(selectedBody);
  audio.playCollision(selectedBody.mass * 50);
  selectedBody = null;
  inspectorPanel.classList.add('closed');
});

function updateInspectorUI() {
  if (!selectedBody || selectedBody.isDestroyed) {
    selectedBody = null;
    inspectorPanel.classList.add('closed');
    return;
  }

  const b = selectedBody;
  
  // Only update inputs if they are not active inputs (user typing/focused)
  if (document.activeElement !== inspectNameInput) inspectNameInput.value = b.name;
  if (document.activeElement !== inspectMassInput) inspectMassInput.value = b.mass.toFixed(1);
  if (document.activeElement !== inspectRadiusInput) inspectRadiusInput.value = b.radius.toFixed(1);
  inspectFixedChk.checked = b.isFixed;

  // Sync telemetry text fields
  document.getElementById('telVx').textContent = b.vx.toFixed(2);
  document.getElementById('telVy').textContent = b.vy.toFixed(2);
  
  const vSq = b.vx * b.vx + b.vy * b.vy;
  const ke = 0.5 * b.mass * vSq;
  document.getElementById('telKe').textContent = ke.toFixed(1);
  document.getElementById('telTemp').textContent = `${b.temperature} K`;
  document.getElementById('telCoreTemp').textContent = `${b.coreTemp} K`;

  // Dynamic potential energy estimation relative to all other bodies
  let pe = 0;
  engine.bodies.forEach(other => {
    if (other === b || other.isDestroyed) return;
    const dist = Math.hypot(other.x - b.x, other.y - b.y);
    if (dist > 0) pe -= (engine.G * b.mass * other.mass) / dist;
  });
  document.getElementById('telPe').textContent = pe.toFixed(1);

  // Blend composition display bars
  document.getElementById('barRock').style.width = `${b.composition.rock * 100}%`;
  document.getElementById('txtRock').textContent = `${Math.round(b.composition.rock * 100)}%`;

  document.getElementById('barMetal').style.width = `${b.composition.metal * 100}%`;
  document.getElementById('txtMetal').textContent = `${Math.round(b.composition.metal * 100)}%`;

  document.getElementById('barIce').style.width = `${b.composition.ice * 100}%`;
  document.getElementById('txtIce').textContent = `${Math.round(b.composition.ice * 100)}%`;

  document.getElementById('barGas').style.width = `${b.composition.gas * 100}%`;
  document.getElementById('txtGas').textContent = `${Math.round(b.composition.gas * 100)}%`;
}

// ----------------------------------------------------
// Canvas Mouse & Touch Interactions
// ----------------------------------------------------
function findBodyAtWorld(wX, wY) {
  let clicked = null;
  let minDist = Infinity;

  engine.bodies.forEach(b => {
    if (b.isDestroyed) return;
    const dist = Math.hypot(b.x - wX, b.y - wY);
    // Give minimum clickable pad index of 15px
    const clickPad = Math.max(15, b.radius);
    if (dist < clickPad && dist < minDist) {
      minDist = dist;
      clicked = b;
    }
  });
  return clicked;
}

canvas.addEventListener('mousedown', (e) => {
  // Prevent context menus on right click
  if (e.button === 2) {
    isDraggingCamera = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    return;
  }

  const world = renderer.toWorld(e.clientX, e.clientY);

  if (activeTool === 'select') {
    const clicked = findBodyAtWorld(world.x, world.y);
    if (clicked) {
      selectedBody = clicked;
      lastSelectedBodyId = clicked.id;
      inspectorPanel.classList.remove('closed');
      
      // Allow throwing planet around if dragging select
      isDraggingCamera = false;
    } else {
      // Clicked void, start drag pan
      isDraggingCamera = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  } 
  
  else if (activeTool === 'launch') {
    // Read Spawner configuration properties
    const mass = parseFloat(spawnMassSlider.value);
    const radius = parseFloat(spawnRadiusSlider.value);
    const type = spawnTypeSelect.value;
    const isBH = type === 'blackhole';
    const isS = type === 'star';

    const composition = {
      rock: parseInt(chemSliders.rock.value) / 100,
      metal: parseInt(chemSliders.metal.value) / 100,
      ice: parseInt(chemSliders.ice.value) / 100,
      gas: parseInt(chemSliders.gas.value) / 100
    };

    dragLaunch = {
      x: world.x,
      y: world.y,
      endX: world.x,
      endY: world.y,
      vx: 0,
      vy: 0,
      mass: mass,
      radius: radius,
      isStar: isS,
      isBlackHole: isBH,
      composition: composition
    };
    renderOptions.dragLaunch = dragLaunch;
  } 
  
  else if (activeTool === 'thruster') {
    isApplyingForce = true;
    forceMouseWorld = world;
    audio.startThrust();
  } 
  
  else if (activeTool === 'spray') {
    isSprayingGas = true;
    sprayMouseWorld = world;
  } 
  
  else if (activeTool === 'blackhole') {
    const bh = new Body(bodyCounter++, "Singularity", world.x, world.y, 0, 0, 1800, 12);
    bh.isBlackHole = true;
    bh.updateRadiusFromMass();
    engine.addBody(bh);
    audio.playBlackHoleAccretion();
  } 
  
  else if (activeTool === 'destroy') {
    const clicked = findBodyAtWorld(world.x, world.y);
    if (clicked) {
      engine.vaporizeBody(clicked);
      audio.playCollision(clicked.mass * 30);
    }
  }
});

canvas.addEventListener('mousemove', (e) => {
  const world = renderer.toWorld(e.clientX, e.clientY);

  if (isDraggingCamera) {
    const dx = (e.clientX - lastMouseX) / renderer.camera.zoom;
    const dy = (e.clientY - lastMouseY) / renderer.camera.zoom;
    renderer.camera.x -= dx;
    renderer.camera.y -= dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  } 
  
  else if (dragLaunch) {
    dragLaunch.endX = world.x;
    dragLaunch.endY = world.y;
    
    // Slingshot velocity proportional to pull vector (drag away = fling forward)
    const scale = 0.08;
    dragLaunch.vx = (dragLaunch.x - dragLaunch.endX) * scale;
    dragLaunch.vy = (dragLaunch.y - dragLaunch.endY) * scale;
  } 
  
  else if (isApplyingForce) {
    forceMouseWorld = world;
    applyForceField(world);
  } 
  
  else if (isSprayingGas) {
    sprayMouseWorld = world;
    spawnSprayParticles(world);
  }
});

window.addEventListener('mouseup', () => {
  isDraggingCamera = false;

  if (dragLaunch) {
    // Launch Custom Planet
    const type = spawnTypeSelect.value;
    let name = type.charAt(0).toUpperCase() + type.slice(1);
    
    // Add unique label
    name = `${name} ${bodyCounter - 999}`;

    const spawned = new Body(
      bodyCounter++, name,
      dragLaunch.x, dragLaunch.y,
      dragLaunch.vx, dragLaunch.vy,
      dragLaunch.mass, dragLaunch.radius,
      dragLaunch.composition
    );
    
    spawned.isBlackHole = dragLaunch.isBlackHole;
    spawned.isStar = dragLaunch.isStar;
    spawned.updateRadiusFromMass();
    spawned.color = spawned.calculateColor();

    engine.addBody(spawned);
    audio.playSpawn(dragLaunch.mass);

    // clear drag state
    dragLaunch = null;
    renderOptions.dragLaunch = null;
  }

  if (isApplyingForce) {
    isApplyingForce = false;
    audio.stopThrust();
  }

  if (isSprayingGas) {
    isSprayingGas = false;
  }
});

// Apply continuous vacuum suction/repulsion towards cursor
function applyForceField(world) {
  engine.bodies.forEach(b => {
    if (b.isFixed || b.isDestroyed) return;
    const dx = world.x - b.x;
    const dy = world.y - b.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist > 10) {
      const forceMultiplier = 12.0;
      // attractive force: F = M * a => scale acceleration
      const ax = (dx / dist) * forceMultiplier;
      const ay = (dy / dist) * forceMultiplier;
      
      b.vx += ax * 0.05;
      b.vy += ay * 0.05;

      // Show action visual smoke
      if (Math.random() < 0.12) {
        const visualX = b.x + (Math.random() - 0.5) * b.radius;
        const visualY = b.y + (Math.random() - 0.5) * b.radius;
        renderer.visParticles.push({
          x: visualX,
          y: visualY,
          vx: b.vx - ax * 0.2,
          vy: b.vy - ay * 0.2,
          size: 1.5,
          color: '#00f0ff',
          alpha: 0.6,
          decay: 0.04
        });
      }
    }
  });
}

// Spray volatile chemical clouds
function spawnSprayParticles(world) {
  const count = 3;
  const isHydrogen = spawnTypeSelect.value === 'gas' || spawnTypeSelect.value === 'star';
  const chemType = isHydrogen ? 'gas' : 'ice';

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2.5;
    
    // spray radial offset velocity
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    engine.gasParticles.push(new GasParticle(
      world.x + Math.cos(angle) * 10,
      world.y + Math.sin(angle) * 10,
      vx, vy,
      chemType
    ));
  }
}

// Zoom-to-cursor event handler
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  
  const zoomFactor = 1.08;
  const oldZoom = renderer.camera.zoom;
  
  // Mouse position in world coordinates before zoom change
  const worldPos = renderer.toWorld(e.clientX, e.clientY);

  if (e.deltaY < 0) {
    renderer.camera.zoom = Math.min(renderer.camera.maxZoom, renderer.camera.zoom * zoomFactor);
  } else {
    renderer.camera.zoom = Math.max(renderer.camera.minZoom, renderer.camera.zoom / zoomFactor);
  }

  // Shift camera so mouse cursor world coordinates align perfectly after zoom
  renderer.camera.x = worldPos.x - (e.clientX - canvas.width / (2 * (window.devicePixelRatio || 1))) / renderer.camera.zoom;
  renderer.camera.y = worldPos.y - (e.clientY - canvas.height / (2 * (window.devicePixelRatio || 1))) / renderer.camera.zoom;
});

// Prevent Context Menus
window.addEventListener('contextmenu', e => e.preventDefault());

// ----------------------------------------------------
// Simulation Main Loop
// ----------------------------------------------------
function loop() {
  // Solve FPS
  const now = performance.now();
  fpsFrames++;
  if (now > fpsLastTime + 1000) {
    document.getElementById('fpsVal').textContent = fpsFrames;
    fpsFrames = 0;
    fpsLastTime = now;
  }

  // Update physics step (if not paused)
  if (!isPaused) {
    // Break steps down into sub-steps (physics iterations) for RK4 stability
    const subSteps = 3;
    for (let step = 0; step < subSteps; step++) {
      engine.update(0.0166 / subSteps); // assume 60fps baseline dt = 0.0166
    }
  }

  // Sync simulation stats
  document.getElementById('bodiesVal').textContent = engine.bodies.length;
  
  const totalEnergy = engine.calculateTotalEnergy();
  document.getElementById('energyVal').textContent = totalEnergy.toFixed(1);

  // Continuous overlays handlers (thrust force spray visual trigger)
  if (isApplyingForce) {
    applyForceField(forceMouseWorld);
  }
  if (isSprayingGas) {
    spawnSprayParticles(sprayMouseWorld);
  }

  // Render graphics frame
  renderer.draw(renderOptions);

  // Sync inspector panel if open
  if (selectedBody) {
    updateInspectorUI();
  }

  requestAnimationFrame(loop);
}

// Launch Loop!
requestAnimationFrame(loop);
