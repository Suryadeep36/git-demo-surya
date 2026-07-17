// Physics Engine for AstroPhysics Sandbox
// Implements RK4 integration, 2D Gravity, Collisions, and Chemical Alchemy

export class Body {
  constructor(id, name, x, y, vx, vy, mass, radius, composition = null) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.mass = mass;
    this.radius = radius;
    this.isFixed = false;
    this.isBlackHole = false;
    this.isStar = false;
    this.isDestroyed = false;

    // Composition proportions: rock, metal, ice, gas (should sum to 1)
    if (composition) {
      this.composition = { ...composition };
    } else {
      this.composition = { rock: 0.7, metal: 0.3, ice: 0.0, gas: 0.0 };
    }
    this.normalizeComposition();

    // Visual characteristics
    this.color = this.calculateColor();
    this.trail = [];
    this.maxTrailLength = 300;

    // Thermodynamic properties
    this.temperature = 0; // Surface Temperature in Kelvin
    this.coreTemp = 0;    // Core Temperature in Kelvin
    this.density = this.calculateDensity();

    // Accumulators for force overlays
    this.fx = 0;
    this.fy = 0;
  }

  normalizeComposition() {
    const sum = this.composition.rock + this.composition.metal + this.composition.ice + this.composition.gas;
    if (sum > 0) {
      this.composition.rock /= sum;
      this.composition.metal /= sum;
      this.composition.ice /= sum;
      this.composition.gas /= sum;
    } else {
      this.composition.rock = 1.0;
    }
    this.density = this.calculateDensity();
  }

  calculateDensity() {
    // Arbitrary density coefficients for sim units
    // Rock = 3.0, Metal = 7.8, Ice = 1.0, Gas = 0.2
    return (
      this.composition.rock * 3.0 +
      this.composition.metal * 7.8 +
      this.composition.ice * 1.0 +
      this.composition.gas * 0.15
    );
  }

  updateRadiusFromMass() {
    if (this.isBlackHole) {
      // Event horizon radius scales linearly with mass (Schwarzschild-like)
      this.radius = Math.max(4, Math.pow(this.mass, 0.45) * 0.4);
      return;
    }
    
    // Volume = 4/3 * pi * r^3 => Radius proportional to (Mass / Density)^(1/3)
    // Map with a logarithmic scaling to keep UI readable, or semi-volumetric
    const baseRadius = Math.cbrt((3 * this.mass) / (4 * Math.PI * this.density));
    
    // Scale for visual balance
    if (this.isStar) {
      this.radius = Math.max(16, baseRadius * 1.6);
    } else {
      this.radius = Math.max(2, baseRadius * 1.2);
    }
  }

  calculateColor() {
    if (this.isBlackHole) return '#000000';
    if (this.isStar) {
      // Color depends on stellar mass (temperature representation)
      if (this.mass > 3000) return '#c2d6ff'; // Hot Blue star
      if (this.mass > 1500) return '#ffffff'; // Medium White star
      if (this.mass > 800) return '#ffe3a8';  // Yellow star
      return '#ff7e47'; // Red dwarf
    }

    // Blend planet colors based on elements
    // Rock = brown/grey, Metal = reddish-gold/grey, Ice = cyan, Gas = purple/orange
    const r = Math.floor(
      this.composition.rock * 150 +
      this.composition.metal * 200 +
      this.composition.ice * 100 +
      this.composition.gas * 200
    );
    const g = Math.floor(
      this.composition.rock * 120 +
      this.composition.metal * 130 +
      this.composition.ice * 210 +
      this.composition.gas * 100
    );
    const b = Math.floor(
      this.composition.rock * 100 +
      this.composition.metal * 130 +
      this.composition.ice * 255 +
      this.composition.gas * 255
    );
    
    return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
  }

  addTrailPoint() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }
  }

  clearTrail() {
    this.trail = [];
  }
}

// Lightweight particle structures
export class GasParticle {
  constructor(x, y, vx, vy, element = 'ice') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.element = element; // 'ice' (water vapor) or 'gas' (hydrogen)
    this.life = 1.0; // Fades out
    this.decay = 0.002 + Math.random() * 0.003;
    this.isDestroyed = false;
  }
}

export class PhysicsEngine {
  constructor() {
    this.bodies = [];
    this.gasParticles = [];
    
    // Core parameters (sim scaling)
    this.G = 1.0;
    this.timeStep = 1.0;
    this.softening = 15; // Avoids infinities near division by zero
    this.collisionType = 'merge'; // 'merge', 'bounce', 'explode', 'none'
    
    // Cosmic boundary wrapping/destroy boundary
    this.boundaryRadius = 10000;
  }

  addBody(body) {
    this.bodies.push(body);
  }

  clear() {
    this.bodies = [];
    this.gasParticles = [];
  }

  // Master update step
  update(dtMultiplier) {
    const dt = this.timeStep * dtMultiplier;
    if (dt <= 0) return;

    // 1. Solve thermodynamics
    this.solveThermodynamics();

    // 2. Perform RK4 Position/Velocity Update
    this.integrateRK4(dt);

    // 3. Resolve Collisions
    this.resolveCollisions();

    // 4. Update gas particle kinematics
    this.updateGasParticles(dt);

    // 5. Trail records & boundary cleanup
    this.bodies.forEach(body => {
      if (!body.isFixed && !body.isDestroyed) {
        body.addTrailPoint();
      }
      
      // Cleanup distant wanderers
      const distSq = body.x * body.x + body.y * body.y;
      if (distSq > this.boundaryRadius * this.boundaryRadius) {
        body.isDestroyed = true;
      }
    });

    this.bodies = this.bodies.filter(b => !b.isDestroyed);
  }

  // Calculate derivatives for RK4
  // Returns accelerations [ax1, ay1, ax2, ay2...] for a given set of coordinates
  getDerivatives(positions, velocities) {
    const N = this.bodies.length;
    const ax = new Float64Array(N);
    const ay = new Float64Array(N);

    // We accumulated forces to display them visually, reset it here for physics calculations
    const gSoftSq = this.softening * this.softening;

    for (let i = 0; i < N; i++) {
      const b1 = this.bodies[i];
      if (b1.isFixed) continue;

      let netAx = 0;
      let netAy = 0;

      const px1 = positions[i * 2];
      const py1 = positions[i * 2 + 1];

      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const b2 = this.bodies[j];
        
        const px2 = positions[j * 2];
        const py2 = positions[j * 2 + 1];

        const dx = px2 - px1;
        const dy = py2 - py1;
        const distSq = dx * dx + dy * dy;

        // Newton's law: a = G * m2 * r_dir / (distSq + softeningSq)^1.5
        const forceDist = Math.pow(distSq + gSoftSq, 1.5);
        if (forceDist > 0) {
          const factor = (this.G * b2.mass) / forceDist;
          netAx += dx * factor;
          netAy += dy * factor;
        }
      }
      ax[i] = netAx;
      ay[i] = netAy;
    }

    return { ax, ay };
  }

  // Runge-Kutta 4th Order Integrator
  integrateRK4(dt) {
    const N = this.bodies.length;
    if (N === 0) return;

    // Setup state vectors
    // Index mapping: index * 2 for x, index * 2 + 1 for y
    const pos0 = new Float64Array(N * 2);
    const vel0 = new Float64Array(N * 2);

    for (let i = 0; i < N; i++) {
      const b = this.bodies[i];
      pos0[i * 2] = b.x;
      pos0[i * 2 + 1] = b.y;
      vel0[i * 2] = b.vx;
      vel0[i * 2 + 1] = b.vy;
    }

    // k1 derivatives
    const k1 = this.getDerivatives(pos0, vel0);

    // Prepare k2 state (pos + 0.5 * dt * vel0, vel + 0.5 * dt * k1_accel)
    const pos1 = new Float64Array(N * 2);
    const vel1 = new Float64Array(N * 2);
    for (let i = 0; i < N; i++) {
      if (this.bodies[i].isFixed) continue;
      pos1[i * 2] = pos0[i * 2] + 0.5 * dt * vel0[i * 2];
      pos1[i * 2 + 1] = pos0[i * 2 + 1] + 0.5 * dt * vel0[i * 2 + 1];
      
      vel1[i * 2] = vel0[i * 2] + 0.5 * dt * k1.ax[i];
      vel1[i * 2 + 1] = vel0[i * 2 + 1] + 0.5 * dt * k1.ay[i];
    }
    const k2 = this.getDerivatives(pos1, vel1);

    // Prepare k3 state
    const pos2 = new Float64Array(N * 2);
    const vel2 = new Float64Array(N * 2);
    for (let i = 0; i < N; i++) {
      if (this.bodies[i].isFixed) continue;
      pos2[i * 2] = pos0[i * 2] + 0.5 * dt * vel1[i * 2];
      pos2[i * 2 + 1] = pos0[i * 2 + 1] + 0.5 * dt * vel1[i * 2 + 1];
      
      vel2[i * 2] = vel0[i * 2] + 0.5 * dt * k2.ax[i];
      vel2[i * 2 + 1] = vel0[i * 2 + 1] + 0.5 * dt * k2.ay[i];
    }
    const k3 = this.getDerivatives(pos2, vel2);

    // Prepare k4 state
    const pos3 = new Float64Array(N * 2);
    const vel3 = new Float64Array(N * 2);
    for (let i = 0; i < N; i++) {
      if (this.bodies[i].isFixed) continue;
      pos3[i * 2] = pos0[i * 2] + dt * vel2[i * 2];
      pos3[i * 2 + 1] = pos0[i * 2 + 1] + dt * vel2[i * 2 + 1];
      
      vel3[i * 2] = vel0[i * 2] + dt * k3.ax[i];
      vel3[i * 2 + 1] = vel0[i * 2 + 1] + dt * k3.ay[i];
    }
    const k4 = this.getDerivatives(pos3, vel3);

    // Update positions and velocities
    for (let i = 0; i < N; i++) {
      const b = this.bodies[i];
      if (b.isFixed) continue;

      // New positions: x_new = x + dt/6 * (v0 + 2*v1 + 2*v2 + v3)
      b.x += (dt / 6) * (vel0[i * 2] + 2 * vel1[i * 2] + 2 * vel2[i * 2] + vel3[i * 2]);
      b.y += (dt / 6) * (vel0[i * 2 + 1] + 2 * vel1[i * 2 + 1] + 2 * vel2[i * 2 + 1] + vel3[i * 2 + 1]);

      // New velocities: v_new = v + dt/6 * (k1 + 2*k2 + 2*k3 + k4)
      const axTotal = (k1.ax[i] + 2 * k2.ax[i] + 2 * k3.ax[i] + k4.ax[i]) / 6;
      const ayTotal = (k1.ay[i] + 2 * k2.ay[i] + 2 * k3.ay[i] + k4.ay[i]) / 6;

      b.vx += axTotal * dt;
      b.vy += ayTotal * dt;

      // Keep record of force vector for overlays (a = F/m => F = m*a)
      b.fx = b.mass * axTotal;
      b.fy = b.mass * ayTotal;
    }
  }

  // Predict future orbit path of a specific body (used for vector previews)
  predictOrbit(bodyToPredict, steps = 150, dt = 1.0) {
    if (this.bodies.length === 0) return [];

    // Clone all bodies so we simulate in a sandbox state
    const clones = this.bodies.map(b => {
      const clone = new Body(b.id, b.name, b.x, b.y, b.vx, b.vy, b.mass, b.radius, b.composition);
      clone.isFixed = b.isFixed;
      clone.isBlackHole = b.isBlackHole;
      return clone;
    });

    // Create the prediction body clone
    const pClone = new Body(
      bodyToPredict.id, bodyToPredict.name,
      bodyToPredict.x, bodyToPredict.y,
      bodyToPredict.vx, bodyToPredict.vy,
      bodyToPredict.mass, bodyToPredict.radius,
      bodyToPredict.composition
    );
    pClone.isFixed = bodyToPredict.isFixed;
    pClone.isBlackHole = bodyToPredict.isBlackHole;

    // Insert prediction target if it's new
    let targetIndex = clones.findIndex(b => b.id === pClone.id);
    if (targetIndex === -1) {
      clones.push(pClone);
      targetIndex = clones.length - 1;
    } else {
      clones[targetIndex] = pClone;
    }

    const path = [];
    const N = clones.length;
    const gSoftSq = this.softening * this.softening;

    // Run simple Euler step forward for fast visualization path
    for (let s = 0; s < steps; s++) {
      // Calculate accelerations for all clones
      const ax = new Float64Array(N);
      const ay = new Float64Array(N);

      for (let i = 0; i < N; i++) {
        const b1 = clones[i];
        if (b1.isFixed) continue;
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          const b2 = clones[j];
          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const distSq = dx * dx + dy * dy;
          const distCube = Math.pow(distSq + gSoftSq, 1.5);
          if (distCube > 0) {
            const factor = (this.G * b2.mass) / distCube;
            ax[i] += dx * factor;
            ay[i] += dy * factor;
          }
        }
      }

      // Update positions of all clones
      for (let i = 0; i < N; i++) {
        const b = clones[i];
        if (b.isFixed) continue;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx += ax[i] * dt;
        b.vy += ay[i] * dt;
      }

      // Record target coordinates
      path.push({ x: pClone.x, y: pClone.y });
    }

    return path;
  }

  // Solve surface and core temperatures based on distance to stars
  solveThermodynamics() {
    const stars = this.bodies.filter(b => b.isStar && !b.isDestroyed);
    
    this.bodies.forEach(b => {
      if (b.isDestroyed) return;

      // Core Temperature rises with mass (pressure ignition)
      // Rocky core retains more heat, Ice vents core heat
      const coreDensityMultiplier = b.composition.rock * 2.0 + b.composition.metal * 3.0 - b.composition.ice * 1.5;
      b.coreTemp = Math.round(Math.max(3, b.mass * 1.5 * Math.max(0.1, coreDensityMultiplier)));

      if (b.isStar) {
        // Fusion core ignition heats surface
        b.temperature = Math.round(1500 + b.mass * 1.2);
        return;
      }

      if (b.isBlackHole) {
        b.temperature = 3; // Hawking radiation limit
        b.coreTemp = 0;
        return;
      }

      // Calculate received stellar irradiance
      // Irradiance I = Sum (Luminosity_s / d_s^2)
      let stellarRadiation = 0;
      stars.forEach(star => {
        const dx = star.x - b.x;
        const dy = star.y - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0) {
          // Luminosity maps directly to mass^2 in sim logic
          const luminosity = star.mass * 30;
          stellarRadiation += luminosity / (distSq + 2500); // add threshold
        }
      });

      // Surface temperature calculations (Stefan-Boltzmann simplification)
      // Base space temperature is ~3 Kelvin
      const baseTemp = 3;
      let equilibriumTemp = baseTemp + Math.pow(stellarRadiation * 800000, 0.25);

      // Greenhouse effect (Gas atmospheres retain solar heat)
      const greenhouseCoeff = b.composition.gas * 1.8;
      b.temperature = Math.round(equilibriumTemp * (1.0 + greenhouseCoeff));

      // Trigger sublimation (Ice turns to gas tail)
      // Ice melts at 273 Kelvin (approximate)
      if (b.temperature > 250 && b.composition.ice > 0.01) {
        const meltAmount = Math.min(b.composition.ice, 0.0008 * (b.temperature / 273));
        b.composition.ice -= meltAmount;
        b.composition.gas += meltAmount * 0.8; // some escapes as gas atmosphere
        b.normalizeComposition();

        // Release cometary water vapor tails!
        if (Math.random() < 0.25 && stars.length > 0) {
          // Push particles away from nearest star (solar winds)
          const primaryStar = stars[0];
          const sDx = b.x - primaryStar.x;
          const sDy = b.y - primaryStar.y;
          const len = Math.hypot(sDx, sDy);
          if (len > 0) {
            const windVx = (sDx / len) * (4.0 + Math.random() * 2) + b.vx;
            const windVy = (sDy / len) * (4.0 + Math.random() * 2) + b.vy;
            this.gasParticles.push(new GasParticle(b.x, b.y, windVx, windVy, 'ice'));
          }
        }
      }

      // Planetary ablation: Hot gas giants close to stars lose atmosphere
      if (b.temperature > 800 && b.composition.gas > 0.1 && stars.length > 0) {
        const gasLoss = 0.0003 * (b.temperature / 800);
        b.composition.gas = Math.max(0, b.composition.gas - gasLoss);
        b.normalizeComposition();

        if (Math.random() < 0.15) {
          const primaryStar = stars[0];
          const sDx = b.x - primaryStar.x;
          const sDy = b.y - primaryStar.y;
          const len = Math.hypot(sDx, sDy);
          if (len > 0) {
            const windVx = (sDx / len) * 3 + b.vx + (Math.random() - 0.5);
            const windVy = (sDy / len) * 3 + b.vy + (Math.random() - 0.5);
            this.gasParticles.push(new GasParticle(b.x, b.y, windVx, windVy, 'gas'));
          }
        }
      }

      // Alchemy: Star ignition trigger
      // If mass accumulates enough Hydrogen gas, ignite nuclear fusion!
      if (b.mass >= 900 && b.composition.gas > 0.35) {
        b.isStar = true;
        b.name = b.name.includes("Star") ? b.name : b.name + " (Ignited Star)";
        b.updateRadiusFromMass();
        b.color = b.calculateColor();
        // Play ignition chime!
        if (this.onIgnition) this.onIgnition(b);
      }
    });
  }

  // Resolve overlaps and impacts
  resolveCollisions() {
    const N = this.bodies.length;
    for (let i = 0; i < N; i++) {
      const b1 = this.bodies[i];
      if (b1.isDestroyed) continue;

      for (let j = i + 1; j < N; j++) {
        const b2 = this.bodies[j];
        if (b2.isDestroyed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.hypot(dx, dy);
        const touchDist = b1.radius + b2.radius;

        if (dist < touchDist) {
          this.handleCollision(b1, b2, dx, dy, dist, touchDist);
        }
      }
    }
  }

  handleCollision(b1, b2, dx, dy, dist, touchDist) {
    if (this.collisionType === 'none') return;

    // Handle Black Hole accretion (swallowing event)
    if (b1.isBlackHole || b2.isBlackHole) {
      const bh = b1.isBlackHole ? b1 : b2;
      const planet = b1.isBlackHole ? b2 : b1;
      
      this.accreteBodies(bh, planet);
      if (this.onAccretion) this.onAccretion(bh, planet);
      return;
    }

    // Calculate relative velocity
    const rvx = b2.vx - b1.vx;
    const rvy = b2.vy - b1.vy;
    const relVel = Math.hypot(rvx, rvy);

    // Merge/Accretion behavior
    if (this.collisionType === 'merge') {
      const heavier = b1.mass >= b2.mass ? b1 : b2;
      const lighter = b1.mass >= b2.mass ? b2 : b1;
      this.accreteBodies(heavier, lighter);
      if (this.onCollision) this.onCollision(heavier, lighter, relVel, 'merge');
      return;
    }

    // Explode/Vaporize behavior (High speed destruction)
    if (this.collisionType === 'explode') {
      const collisionEnergy = 0.5 * (b1.mass * b2.mass / (b1.mass + b2.mass)) * relVel * relVel;
      
      // If it's a soft collision, maybe just merge or bounce, otherwise obliterate!
      if (collisionEnergy > 1500) {
        this.vaporizeBody(b1);
        this.vaporizeBody(b2);
        if (this.onCollision) this.onCollision(b1, b2, relVel, 'explode');
        return;
      }
    }

    // Elastic Bounce Behavior
    if (this.collisionType === 'bounce' || this.collisionType === 'explode') {
      // Normal vector
      const nx = dx / dist;
      const ny = dy / dist;

      // Normal velocity
      const velNormal = rvx * nx + rvy * ny;

      // Do not resolve if velocities are already separating
      if (velNormal > 0) return;

      // Elasticity factor
      const restitution = 0.65;

      // Impulse scalar
      const impulse = -(1 + restitution) * velNormal / (1 / b1.mass + 1 / b2.mass);

      // Apply impulse vectors
      if (!b1.isFixed) {
        b1.vx -= (impulse / b1.mass) * nx;
        b1.vy -= (impulse / b1.mass) * ny;
      }
      if (!b2.isFixed) {
        b2.vx += (impulse / b2.mass) * nx;
        b2.vy += (impulse / b2.mass) * ny;
      }

      // Positional correction (resolve overlaps)
      const percent = 0.4; // penetration correction index
      const slop = 0.02; // penetration allowance
      const penetration = touchDist - dist;
      const correction = Math.max(0, penetration - slop) / (1 / b1.mass + 1 / b2.mass) * percent;
      
      const cx = correction * nx;
      const cy = correction * ny;

      if (!b1.isFixed) {
        b1.x -= cx / b1.mass;
        b1.y -= cy / b1.mass;
      }
      if (!b2.isFixed) {
        b2.x += cx / b2.mass;
        b2.y += cy / b2.mass;
      }

      if (this.onCollision) this.onCollision(b1, b2, relVel, 'bounce');
    }
  }

  // Merge planet2 into planet1 (Accretion)
  accreteBodies(heavier, lighter) {
    lighter.isDestroyed = true;

    // Conserve momentum (Center of Mass math)
    if (!heavier.isFixed) {
      const totalMass = heavier.mass + lighter.mass;
      heavier.vx = (heavier.mass * heavier.vx + lighter.mass * lighter.vx) / totalMass;
      heavier.vy = (heavier.mass * heavier.vy + lighter.mass * lighter.vy) / totalMass;
      
      // Update coordinates to center of mass position
      heavier.x = (heavier.mass * heavier.x + lighter.mass * lighter.x) / totalMass;
      heavier.y = (heavier.mass * heavier.y + lighter.mass * lighter.y) / totalMass;
    }

    // Merge compositions
    const totalMass = heavier.mass + lighter.mass;
    
    // Weighted chemical profile blending
    heavier.composition.rock = (heavier.mass * heavier.composition.rock + lighter.mass * lighter.composition.rock) / totalMass;
    heavier.composition.metal = (heavier.mass * heavier.composition.metal + lighter.mass * lighter.composition.metal) / totalMass;
    heavier.composition.ice = (heavier.mass * heavier.composition.ice + lighter.mass * lighter.composition.ice) / totalMass;
    heavier.composition.gas = (heavier.mass * heavier.composition.gas + lighter.mass * lighter.composition.gas) / totalMass;

    heavier.mass = totalMass;
    heavier.normalizeComposition();
    heavier.updateRadiusFromMass();
    heavier.color = heavier.calculateColor();

    // Trigger visual rings if gas giant absorbs rock/metal
    if (heavier.composition.gas > 0.4 && (lighter.composition.rock > 0.5 || lighter.composition.metal > 0.5)) {
      heavier.hasRings = true;
    }
  }

  // Splinter body into dozens of tiny fragments/gas clouds
  vaporizeBody(body) {
    body.isDestroyed = true;
    
    // Spawn gas/ice particles matching chemical structure
    const particleCount = Math.min(80, Math.floor(body.mass / 3) + 10);
    const step = (Math.PI * 2) / particleCount;

    for (let i = 0; i < particleCount; i++) {
      const angle = i * step + Math.random() * 0.2;
      const speed = 1.5 + Math.random() * 4.0;
      
      // Speed radial vectors
      const pVx = body.vx + Math.cos(angle) * speed;
      const pVy = body.vy + Math.sin(angle) * speed;
      
      const element = (Math.random() < body.composition.gas + body.composition.ice) ? 'gas' : 'ice';
      
      // Spawn offset from center
      const offsetRadius = body.radius * Math.random();
      const pX = body.x + Math.cos(angle) * offsetRadius;
      const pY = body.y + Math.sin(angle) * offsetRadius;
      
      this.gasParticles.push(new GasParticle(pX, pY, pVx, pVy, element));
    }
  }

  // Update gas particles under gravity and decay
  updateGasParticles(dt) {
    const N = this.bodies.length;
    const gSoftSq = this.softening * this.softening;

    this.gasParticles.forEach(p => {
      // Affected by gravity of major bodies
      let ax = 0;
      let ay = 0;

      for (let i = 0; i < N; i++) {
        const body = this.bodies[i];
        if (body.isDestroyed) continue;

        const dx = body.x - p.x;
        const dy = body.y - p.y;
        const distSq = dx * dx + dy * dy;

        // If particle falls inside a planet, absorb it!
        if (distSq < body.radius * body.radius) {
          p.isDestroyed = true;
          this.absorbGasParticle(body, p);
          break;
        }

        const distCube = Math.pow(distSq + gSoftSq, 1.5);
        if (distCube > 0) {
          const factor = (this.G * body.mass) / distCube;
          ax += dx * factor;
          ay += dy * factor;
        }
      }

      if (!p.isDestroyed) {
        // Kinematics
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx += ax * dt;
        p.vy += ay * dt;

        // Friction/drag on particles
        p.vx *= 0.995;
        p.vy *= 0.995;

        // Lifetime decay
        p.life -= p.decay * dt;
        if (p.life <= 0) {
          p.isDestroyed = true;
        }
      }
    });

    // Keep active particles
    this.gasParticles = this.gasParticles.filter(p => !p.isDestroyed);
  }

  // Absorb single gas particle chemical composition into body
  absorbGasParticle(body, p) {
    const increment = 1.0; // small mass change
    const oldMass = body.mass;
    const newMass = oldMass + increment;

    // Blend chemical ratios
    const chemType = p.element === 'gas' ? 'gas' : 'ice';
    
    // Add elemental mass percentage
    body.composition[chemType] = (body.composition[chemType] * oldMass + increment) / newMass;
    
    // Scaledown other element ratios
    const elements = ['rock', 'metal', 'ice', 'gas'];
    elements.forEach(el => {
      if (el !== chemType) {
        body.composition[el] = (body.composition[el] * oldMass) / newMass;
      }
    });

    body.mass = newMass;
    body.normalizeComposition();
    body.updateRadiusFromMass();
    body.color = body.calculateColor();
  }

  // Calculate total kinetic & potential energy of system (for UI stats readout)
  calculateTotalEnergy() {
    const N = this.bodies.length;
    let kinetic = 0;
    let potential = 0;
    const gSoftSq = this.softening * this.softening;

    for (let i = 0; i < N; i++) {
      const b1 = this.bodies[i];
      if (b1.isDestroyed) continue;

      // K.E = 0.5 * m * v^2
      const vSq = b1.vx * b1.vx + b1.vy * b1.vy;
      kinetic += 0.5 * b1.mass * vSq;

      // P.E = -G * m1 * m2 / r
      for (let j = i + 1; j < N; j++) {
        const b2 = this.bodies[j];
        if (b2.isDestroyed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const r = Math.sqrt(dx * dx + dy * dy + gSoftSq);
        if (r > 0) {
          potential -= (this.G * b1.mass * b2.mass) / r;
        }
      }
    }

    return kinetic + potential;
  }
}
