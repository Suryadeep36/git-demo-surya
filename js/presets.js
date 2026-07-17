// Celestial Presets for AstroPhysics Sandbox
// Math formulas are applied to create stable circular orbits around barycenters

import { Body } from './physics.js';

export function loadPreset(engine, presetName, width, height) {
  engine.clear();
  
  const cx = width / 2;
  const cy = height / 2;
  let bodyId = 0;

  switch (presetName) {
    case 'solar': {
      // 1. Central Massive Sun
      const sun = new Body(
        bodyId++, "Sun", cx, cy, 0, 0, 
        3000, 42, 
        { rock: 0.0, metal: 0.0, ice: 0.1, gas: 0.9 }
      );
      sun.isStar = true;
      sun.isFixed = true;
      sun.updateRadiusFromMass();
      sun.color = sun.calculateColor();
      engine.addBody(sun);

      // Planet circular orbital speed calculation: v = sqrt(G * M_sun / r)
      const spawnPlanet = (name, dist, mass, size, composition, angle = Math.random() * Math.PI * 2, hasRings = false) => {
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        
        // Orbital speed
        const vSpeed = Math.sqrt((engine.G * sun.mass) / dist);
        // Perpendicular vector for clockwise orbit
        const vx = -Math.sin(angle) * vSpeed;
        const vy = Math.cos(angle) * vSpeed;

        const planet = new Body(bodyId++, name, x, y, vx, vy, mass, size, composition);
        planet.hasRings = hasRings;
        planet.updateRadiusFromMass();
        planet.color = planet.calculateColor();
        engine.addBody(planet);
        return planet;
      };

      // Terrestrial planets
      spawnPlanet("Mercury", 75, 12, 4, { rock: 0.7, metal: 0.3, ice: 0.0, gas: 0.0 });
      spawnPlanet("Venus", 115, 48, 7, { rock: 0.9, metal: 0.1, ice: 0.0, gas: 0.0 });
      
      // Earth & Moon combo
      const earthAngle = Math.random() * Math.PI * 2;
      const earth = spawnPlanet("Earth", 165, 80, 9, { rock: 0.6, metal: 0.3, ice: 0.1, gas: 0.0 }, earthAngle);
      
      // Satellite orbit helper
      const moonDist = 18;
      const moonAngle = earthAngle + Math.PI / 2; // offset angle
      const mX = earth.x + Math.cos(moonAngle) * moonDist;
      const mY = earth.y + Math.sin(moonAngle) * moonDist;
      const moonSpeed = Math.sqrt((engine.G * earth.mass) / moonDist);
      const mVx = earth.vx - Math.sin(moonAngle) * moonSpeed;
      const mVy = earth.vy + Math.cos(moonAngle) * moonSpeed;

      const moon = new Body(bodyId++, "Luna (Moon)", mX, mY, mVx, mVy, 1.5, 2.5, { rock: 0.9, metal: 0.1, ice: 0.0, gas: 0.0 });
      moon.updateRadiusFromMass();
      moon.color = moon.calculateColor();
      engine.addBody(moon);

      spawnPlanet("Mars", 220, 52, 6, { rock: 0.8, metal: 0.2, ice: 0.0, gas: 0.0 });

      // Gas Giants
      spawnPlanet("Jupiter", 320, 380, 18, { rock: 0.05, metal: 0.05, ice: 0.1, gas: 0.8 }, Math.random() * Math.PI * 2);
      spawnPlanet("Saturn", 430, 260, 14, { rock: 0.08, metal: 0.02, ice: 0.2, gas: 0.7 }, Math.random() * Math.PI * 2, true);
      break;
    }

    case 'binary': {
      // Two identical stars orbiting their center of mass (barycenter)
      const starMass = 1500;
      const orbitRadius = 110;
      const totalDist = orbitRadius * 2;
      
      // Stable orbital speed: v = sqrt(G * starMass^2 / ((m1+m2)*totalDist)) => sqrt(G * starMass / (2*2*r))
      const speed = Math.sqrt((engine.G * starMass) / (4 * orbitRadius));

      // Star A
      const starA = new Body(
        bodyId++, "Alpha Centauri A", 
        cx - orbitRadius, cy, 
        0, speed, 
        starMass, 30, 
        { rock: 0.0, metal: 0.0, ice: 0.1, gas: 0.9 }
      );
      starA.isStar = true;
      starA.updateRadiusFromMass();
      starA.color = '#fff6e0';
      engine.addBody(starA);

      // Star B
      const starB = new Body(
        bodyId++, "Alpha Centauri B", 
        cx + orbitRadius, cy, 
        0, -speed, 
        starMass, 26, 
        { rock: 0.0, metal: 0.0, ice: 0.1, gas: 0.9 }
      );
      starB.isStar = true;
      starB.updateRadiusFromMass();
      starB.color = '#ffd1ad'; // Slightly cooler orange star
      engine.addBody(starB);

      // Spawn some circumbinary planets orbiting the barycenter further out
      const planetSpawn = (name, dist, mass, composition, angle) => {
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        // Approximation of gravity from center of combined mass
        const vSpeed = Math.sqrt((engine.G * (starMass * 2)) / dist);
        const vx = -Math.sin(angle) * vSpeed;
        const vy = Math.cos(angle) * vSpeed;

        const planet = new Body(bodyId++, name, x, y, vx, vy, mass, 8, composition);
        planet.updateRadiusFromMass();
        planet.color = planet.calculateColor();
        engine.addBody(planet);
      };

      planetSpawn("Tatooine Prime", 280, 70, { rock: 0.7, metal: 0.3, ice: 0.0, gas: 0.0 }, 0);
      planetSpawn("Tatooine Minor", 360, 45, { rock: 0.5, metal: 0.1, ice: 0.4, gas: 0.0 }, Math.PI);
      break;
    }

    case 'accretion': {
      // Central Star
      const centralSun = new Body(
        bodyId++, "Protostar", cx, cy, 0, 0, 
        1800, 32, 
        { rock: 0.0, metal: 0.0, ice: 0.2, gas: 0.8 }
      );
      centralSun.isStar = true;
      centralSun.updateRadiusFromMass();
      centralSun.color = centralSun.calculateColor();
      engine.addBody(centralSun);

      // Spawn 70 small planetoids in circular orbits ready to merge
      const planetoidCount = 65;
      for (let i = 0; i < planetoidCount; i++) {
        const dist = 70 + Math.random() * 320;
        const angle = Math.random() * Math.PI * 2;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;

        // Circular speed
        const speed = Math.sqrt((engine.G * centralSun.mass) / dist) * (0.95 + Math.random() * 0.1); // add minor eccentricity
        const vx = -Math.sin(angle) * speed;
        const vy = Math.cos(angle) * speed;

        const mass = 2.0 + Math.random() * 18.0;
        const rockRatio = 0.3 + Math.random() * 0.7;
        const metalRatio = 1.0 - rockRatio;
        const iceRatio = Math.random() * 0.3;

        const p = new Body(
          bodyId++, `Proto-${bodyId}`, 
          x, y, vx, vy, 
          mass, 4, 
          { rock: rockRatio, metal: metalRatio, ice: iceRatio, gas: 0 }
        );
        p.updateRadiusFromMass();
        p.color = p.calculateColor();
        engine.addBody(p);
      }
      break;
    }

    case 'galaxy': {
      // Two spiral structures dancing in a space collision
      // Galaxy A
      const bhAMass = 1800;
      const gAx = cx - 220;
      const gAy = cy - 60;
      const gAvx = 0.8;
      const gAvy = 0.3;

      const bhA = new Body(bodyId++, "Sagittarius A*", gAx, gAy, gAvx, gAvy, bhAMass, 15);
      bhA.isBlackHole = true;
      bhA.updateRadiusFromMass();
      engine.addBody(bhA);

      // Spiral arms for Galaxy A
      const starsA = 70;
      for (let i = 0; i < starsA; i++) {
        // Spiral equations: r = a * theta
        const angle = (i / starsA) * Math.PI * 8; // 4 full winds
        const dist = 30 + (i / starsA) * 140 + Math.random() * 12;
        
        const x = gAx + Math.cos(angle) * dist;
        const y = gAy + Math.sin(angle) * dist;

        const vSpeed = Math.sqrt((engine.G * bhAMass) / dist);
        // Galactic orbit + translation speed
        const vx = gAvx - Math.sin(angle) * vSpeed;
        const vy = gAvy + Math.cos(angle) * vSpeed;

        const star = new Body(
          bodyId++, `Star A-${i}`, 
          x, y, vx, vy, 
          2 + Math.random() * 8, 3, 
          { rock: 0.0, metal: 0.0, ice: 0.1, gas: 0.9 }
        );
        star.color = '#c9f0ff';
        engine.addBody(star);
      }

      // Galaxy B
      const bhBMass = 1200;
      const gBx = cx + 220;
      const gBy = cy + 60;
      const gBvx = -0.8;
      const gBvy = -0.3;

      const bhB = new Body(bodyId++, "Andromeda Core", gBx, gBy, gBvx, gBvy, bhBMass, 12);
      bhB.isBlackHole = true;
      bhB.updateRadiusFromMass();
      engine.addBody(bhB);

      // Spiral arms for Galaxy B (Counter-rotating)
      const starsB = 55;
      for (let i = 0; i < starsB; i++) {
        const angle = (i / starsB) * Math.PI * 6;
        const dist = 25 + (i / starsB) * 120 + Math.random() * 10;
        
        const x = gBx + Math.cos(angle) * dist;
        const y = gBy + Math.sin(angle) * dist;

        const vSpeed = Math.sqrt((engine.G * bhBMass) / dist);
        // Counter-orbit (change negative sign)
        const vx = gBvx + Math.sin(angle) * vSpeed;
        const vy = gBvy - Math.cos(angle) * vSpeed;

        const star = new Body(
          bodyId++, `Star B-${i}`, 
          x, y, vx, vy, 
          1.5 + Math.random() * 5, 3, 
          { rock: 0.0, metal: 0.0, ice: 0.1, gas: 0.9 }
        );
        star.color = '#ffd4eb';
        engine.addBody(star);
      }
      break;
    }

    case 'lagrange': {
      // Sun-Jupiter stable Lagrange Point demonstration
      // Central Sun (Fixed)
      const sun = new Body(bodyId++, "Sun", cx, cy, 0, 0, 3000, 38, { rock: 0.0, metal: 0.0, ice: 0.0, gas: 1.0 });
      sun.isStar = true;
      sun.isFixed = true;
      sun.updateRadiusFromMass();
      sun.color = sun.calculateColor();
      engine.addBody(sun);

      // Massive Planet (Jupiter-like) at distance 260
      const jDist = 260;
      const jAngle = 0; // x-axis
      const jMass = 400;
      const jSpeed = Math.sqrt((engine.G * (sun.mass + jMass)) / jDist);

      const jupiter = new Body(
        bodyId++, "Jupiter", 
        cx + jDist, cy, 
        0, jSpeed, 
        jMass, 18, 
        { rock: 0.1, metal: 0.1, ice: 0.1, gas: 0.7 }
      );
      jupiter.updateRadiusFromMass();
      jupiter.color = jupiter.calculateColor();
      engine.addBody(jupiter);

      // Lagrange L4 point is 60 degrees (PI/3) ahead in orbit
      // Lagrange L5 point is 60 degrees (PI/3) behind in orbit
      const spawnLagrangianDust = (baseAngle, count) => {
        for (let i = 0; i < count; i++) {
          // Add small offset variance to show stability traps
          const rOffset = -15 + Math.random() * 30;
          const aOffset = -0.15 + Math.random() * 0.3;
          
          const angle = baseAngle + aOffset;
          const dist = jDist + rOffset;
          
          const x = cx + Math.cos(angle) * dist;
          const y = cy + Math.sin(angle) * dist;

          // Stable velocity at distance: v = sqrt(G*M_sun/d)
          const speed = Math.sqrt((engine.G * sun.mass) / dist);
          const vx = -Math.sin(angle) * speed;
          const vy = Math.cos(angle) * speed;

          const dust = new Body(
            bodyId++, `Trojan-${bodyId}`, 
            x, y, vx, vy, 
            0.2, 2.0, 
            { rock: 0.5, metal: 0.1, ice: 0.4, gas: 0.0 }
          );
          dust.color = '#7dfc00'; // Lime green for trojan markers
          engine.addBody(dust);
        }
      };

      // Spawn Trojan asteroids in L4 & L5 regions
      spawnLagrangianDust(Math.PI / 3, 20); // 60 deg ahead
      spawnLagrangianDust(-Math.PI / 3, 20); // 60 deg behind
      break;
    }

    default:
      console.warn("Unknown preset requested:", presetName);
      break;
  }
}
