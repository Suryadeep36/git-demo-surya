// Graphic Renderer for AstroPhysics Space Sandbox
// Implements custom canvas graphics, light shading, spacetime grid warping, and particle FX

export class CanvasRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;

    // Viewport camera parameters
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1.0,
      minZoom: 0.1,
      maxZoom: 5.0
    };

    // Parallax stars
    this.stars = [];
    this.generateStarfield(300);

    // Visual feedback particles (explosions, sparks)
    this.visParticles = [];
  }

  generateStarfield(count) {
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * 3000 - 1500,
        y: Math.random() * 3000 - 1500,
        radius: 0.5 + Math.random() * 1.5,
        alpha: 0.2 + Math.random() * 0.8,
        speedFactor: 0.05 + Math.random() * 0.15, // parallax speed
        color: this.getRandomStarColor(),
        twinkleRate: 0.01 + Math.random() * 0.03
      });
    }
  }

  getRandomStarColor() {
    const colors = ['#ffffff', '#e1f4ff', '#ffebd1', '#ffe5e5', '#f0f3ff'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
  }

  // Coordinates converters
  toWorld(screenX, screenY) {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    return {
      x: (screenX - w / 2) / this.camera.zoom + this.camera.x,
      y: (screenY - h / 2) / this.camera.zoom + this.camera.y
    };
  }

  toScreen(worldX, worldY) {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    return {
      x: (worldX - this.camera.x) * this.camera.zoom + w / 2,
      y: (worldY - this.camera.y) * this.camera.zoom + h / 2
    };
  }

  // Draw loop
  draw(options) {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    // 1. Clear viewport (deep void space)
    this.ctx.fillStyle = '#02030a';
    this.ctx.fillRect(0, 0, w, h);

    // 2. Draw parallax star background
    this.drawStars(w, h);

    // 3. Draw warped spacetime grid
    if (options.showGrid) {
      this.drawSpacetimeGrid(w, h);
    }

    // 4. Draw orbital trails
    if (options.showTrails) {
      this.drawTrails();
    }

    // 5. Draw orbit projections
    if (options.showPrediction && options.dragLaunch) {
      this.drawLaunchPrediction(options.dragLaunch);
    }

    // 6. Draw thermal overlays
    if (options.showHeatMap) {
      this.drawThermalOverlay();
    }

    // 7. Draw gas and chemical clouds
    this.drawGasClouds();

    // 8. Draw active bodies
    this.drawBodies();

    // 9. Draw visual explosion particles
    this.updateAndDrawVisualParticles();

    // 10. Draw vectors (forces, velocity)
    if (options.showVectors) {
      this.drawVectors();
    }

    // 11. Draw launch guides
    if (options.dragLaunch) {
      this.drawLaunchGuide(options.dragLaunch);
    }
  }

  drawStars(w, h) {
    this.stars.forEach(star => {
      // Modulate opacity to simulate twinkling
      star.alpha += star.twinkleRate;
      if (star.alpha > 1.0 || star.alpha < 0.2) {
        star.twinkleRate = -star.twinkleRate;
      }

      // Parallax position calculation
      // Coordinate shift decreases as speedFactor decreases (deeper depth)
      const sx = (star.x - this.camera.x * star.speedFactor) * this.camera.zoom + w / 2;
      const sy = (star.y - this.camera.y * star.speedFactor) * this.camera.zoom + h / 2;

      // Wrap background stars back into view boundaries
      if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) {
        this.ctx.fillStyle = star.color;
        this.ctx.globalAlpha = star.alpha;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, star.radius * Math.max(0.5, this.camera.zoom), 0, Math.PI * 2);
        this.ctx.fill();
      }
    });
    this.ctx.globalAlpha = 1.0;
  }

  // Draw spandex rubber sheet spacetime grid warping near massive bodies
  drawSpacetimeGrid(w, h) {
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    this.ctx.lineWidth = 1;

    // Grid spacing (adjusts with zoom to keep performance stable)
    const spacing = 50 * Math.max(0.5, Math.pow(2, Math.round(Math.log2(1 / this.camera.zoom))));
    
    // Find limits in world coords
    const start = this.toWorld(0, 0);
    const end = this.toWorld(w, h);

    const xStart = Math.floor(start.x / spacing) * spacing;
    const xEnd = Math.ceil(end.x / spacing) * spacing;
    const yStart = Math.floor(start.y / spacing) * spacing;
    const yEnd = Math.ceil(end.y / spacing) * spacing;

    // We will draw grid lines connecting warped nodes
    // Compute node displacement offset based on proximity to gravity centers
    const warpNode = (wx, wy) => {
      let dxNet = 0;
      let dyNet = 0;
      
      this.engine.bodies.forEach(b => {
        if (b.isDestroyed) return;
        const dx = b.x - wx;
        const dy = b.y - wy;
        const distSq = dx * dx + dy * dy;
        
        // Displacement multiplier: proportional to Mass, inversely proportional to Distance^2
        const warpStrength = b.mass * 300.0;
        const scaleDist = distSq + 1200; // prevent divide-by-zero spikes
        
        dxNet += (dx / scaleDist) * (warpStrength / Math.sqrt(scaleDist));
        dyNet += (dy / scaleDist) * (warpStrength / Math.sqrt(scaleDist));
      });

      return {
        x: wx + dxNet * 0.25,
        y: wy + dyNet * 0.25
      };
    };

    // Draw vertical lines
    for (let wx = xStart; wx <= xEnd; wx += spacing) {
      this.ctx.beginPath();
      for (let wy = yStart; wy <= yEnd; wy += spacing / 2) {
        const warped = warpNode(wx, wy);
        const sNode = this.toScreen(warped.x, warped.y);
        if (wy === yStart) {
          this.ctx.moveTo(sNode.x, sNode.y);
        } else {
          this.ctx.lineTo(sNode.x, sNode.y);
        }
      }
      this.ctx.stroke();
    }

    // Draw horizontal lines
    for (let wy = yStart; wy <= yEnd; wy += spacing) {
      this.ctx.beginPath();
      for (let wx = xStart; wx <= xEnd; wx += spacing / 2) {
        const warped = warpNode(wx, wy);
        const sNode = this.toScreen(warped.x, warped.y);
        if (wx === xStart) {
          this.ctx.moveTo(sNode.x, sNode.y);
        } else {
          this.ctx.lineTo(sNode.x, sNode.y);
        }
      }
      this.ctx.stroke();
    }
  }

  drawTrails() {
    this.engine.bodies.forEach(b => {
      if (b.trail.length < 2) return;

      this.ctx.beginPath();
      const s0 = this.toScreen(b.trail[0].x, b.trail[0].y);
      this.ctx.moveTo(s0.x, s0.y);

      for (let i = 1; i < b.trail.length; i++) {
        const s = this.toScreen(b.trail[i].x, b.trail[i].y);
        this.ctx.lineTo(s.x, s.y);
      }

      // Trail styling (fade out trails)
      const grad = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height); // placeholder/fallback
      
      this.ctx.strokeStyle = b.isBlackHole ? 'rgba(255, 0, 160, 0.4)' : b.color;
      this.ctx.lineWidth = Math.max(1, 2.5 * this.camera.zoom);
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      // Transparent tail
      this.ctx.globalAlpha = 0.25;
      this.ctx.stroke();
      this.ctx.globalAlpha = 1.0;
    });
  }

  drawBodies() {
    // Sort stars to render atmospheric glow behind smaller planets
    const sorted = [...this.engine.bodies].sort((a, b) => {
      if (a.isStar !== b.isStar) return a.isStar ? -1 : 1;
      return a.mass - b.mass;
    });

    sorted.forEach(b => {
      const sPos = this.toScreen(b.x, b.y);
      const sRadius = b.radius * this.camera.zoom;

      if (sRadius < 0.2) return; // skip tiny invisible ones

      // 1. Draw atmosphere/stellar corona glow
      if (b.isStar) {
        const glowRad = sRadius * 2.5;
        const grad = this.ctx.createRadialGradient(sPos.x, sPos.y, sRadius * 0.6, sPos.x, sPos.y, glowRad);
        grad.addColorStop(0, b.color);
        grad.addColorStop(0.3, b.color + 'aa');
        grad.addColorStop(0.6, b.color + '22');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(sPos.x, sPos.y, glowRad, 0, Math.PI * 2);
        this.ctx.fill();

        // Solar spikes
        this.ctx.strokeStyle = b.color + '44';
        this.ctx.lineWidth = 1.5;
        const spikes = 4;
        const t = Date.now() * 0.001;
        for (let i = 0; i < spikes; i++) {
          const angle = (i * Math.PI) / 2 + t * 0.05;
          const xDir = Math.cos(angle);
          const yDir = Math.sin(angle);
          this.ctx.beginPath();
          this.ctx.moveTo(sPos.x + xDir * sRadius, sPos.y + yDir * sRadius);
          this.ctx.lineTo(sPos.x + xDir * glowRad, sPos.y + yDir * glowRad);
          this.ctx.stroke();
        }
      }

      // 2. Draw Black Hole singularity accretion disk
      if (b.isBlackHole) {
        const diskRad = sRadius * 3.5;
        const t = Date.now() * 0.005;

        // Disk flow glow
        this.ctx.strokeStyle = 'rgba(255, 0, 150, 0.15)';
        this.ctx.lineWidth = sRadius * 0.6;
        this.ctx.beginPath();
        this.ctx.arc(sPos.x, sPos.y, sRadius * 2.0, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(0, 230, 255, 0.1)';
        this.ctx.lineWidth = sRadius * 0.3;
        this.ctx.beginPath();
        this.ctx.arc(sPos.x, sPos.y, sRadius * 2.5, 0, Math.PI * 2);
        this.ctx.stroke();

        // Central Event Horizon
        this.ctx.fillStyle = '#000000';
        this.ctx.shadowColor = '#ff007f';
        this.ctx.shadowBlur = 10 * this.camera.zoom;
        this.ctx.beginPath();
        this.ctx.arc(sPos.x, sPos.y, sRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Reset shadows
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        return; // skip core shading
      }

      // 3. Draw Solid Planet Core
      this.ctx.fillStyle = b.color;
      this.ctx.beginPath();
      this.ctx.arc(sPos.x, sPos.y, sRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // 4. Draw Gas Giant storm bands
      if (b.composition.gas > 0.4 && sRadius > 6) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(sPos.x, sPos.y, sRadius, 0, Math.PI * 2);
        this.ctx.clip();

        // Draw horizontal atmospheric bands
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.fillRect(sPos.x - sRadius, sPos.y - sRadius * 0.4, sRadius * 2, sRadius * 0.15);
        this.ctx.fillRect(sPos.x - sRadius, sPos.y + sRadius * 0.2, sRadius * 2, sRadius * 0.1);
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.fillRect(sPos.x - sRadius, sPos.y - sRadius * 0.1, sRadius * 2, sRadius * 0.18);
        this.ctx.fillRect(sPos.x - sRadius, sPos.y + sRadius * 0.5, sRadius * 2, sRadius * 0.08);

        this.ctx.restore();
      }

      // 5. Draw planet rings if flagged (e.g. Saturn)
      if (b.hasRings && sRadius > 5) {
        this.ctx.save();
        this.ctx.translate(sPos.x, sPos.y);
        this.ctx.rotate(0.3); // slant tilt

        // Draw outer ring ring
        this.ctx.strokeStyle = 'rgba(195, 175, 140, 0.5)';
        this.ctx.lineWidth = sRadius * 0.25;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, sRadius * 2.0, sRadius * 0.4, 0, 0, Math.PI * 2);
        this.ctx.stroke();

        // Draw inner ring gap
        this.ctx.strokeStyle = 'rgba(215, 195, 160, 0.3)';
        this.ctx.lineWidth = sRadius * 0.1;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, sRadius * 1.6, sRadius * 0.32, 0, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.restore();
      }

      // 6. Draw Planetary lighting/stellar shadow occlusion
      this.applyPlanetaryLighting(b, sPos, sRadius);
    });
  }

  applyPlanetaryLighting(b, sPos, sRadius) {
    // Find nearest massive energy source (Star) to throw shadow away from it
    const stars = this.engine.bodies.filter(star => star.isStar && !star.isDestroyed);
    if (stars.length === 0) return;

    let closestStar = stars[0];
    let minDistSq = Infinity;

    stars.forEach(star => {
      const dx = star.x - b.x;
      const dy = star.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestStar = star;
      }
    });

    // Shadow direction (unit vector pointing away from star)
    const sdx = b.x - closestStar.x;
    const sdy = b.y - closestStar.y;
    const sLen = Math.hypot(sdx, sdy);
    if (sLen === 0) return;

    const angle = Math.atan2(sdy, sdx);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(sPos.x, sPos.y, sRadius, 0, Math.PI * 2);
    this.ctx.clip();

    // Radial shadow gradient offset opposite of light direction
    const shadowX = sPos.x + Math.cos(angle) * sRadius * 0.7;
    const shadowY = sPos.y + Math.sin(angle) * sRadius * 0.7;

    const shadowGrad = this.ctx.createRadialGradient(
      sPos.x - Math.cos(angle) * sRadius * 0.3, sPos.y - Math.sin(angle) * sRadius * 0.3,
      sRadius * 0.3,
      shadowX, shadowY,
      sRadius * 1.1
    );
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.0)');
    shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
    shadowGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.95)');

    this.ctx.fillStyle = shadowGrad;
    this.ctx.beginPath();
    this.ctx.arc(sPos.x, sPos.y, sRadius * 1.05, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  drawGasClouds() {
    this.engine.gasParticles.forEach(p => {
      const sPos = this.toScreen(p.x, p.y);
      const rad = 6 * p.life * this.camera.zoom;

      if (rad < 0.2) return;

      const grad = this.ctx.createRadialGradient(sPos.x, sPos.y, 0, sPos.x, sPos.y, rad);
      // Ice (water vapor) is Cyan, Hydrogen gas is Pink/magenta
      const color = p.element === 'gas' ? '223, 116, 255' : '116, 219, 255';
      
      grad.addColorStop(0, `rgba(${color}, ${p.life * 0.35})`);
      grad.addColorStop(0.5, `rgba(${color}, ${p.life * 0.1})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(sPos.x, sPos.y, rad, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  // Draw thermal overlay (heat halos)
  drawThermalOverlay() {
    this.engine.bodies.forEach(b => {
      if (b.isDestroyed || b.temperature < 200) return;

      const sPos = this.toScreen(b.x, b.y);
      // Glow radius scales with temperature
      const glowRad = (b.radius + Math.sqrt(b.temperature) * 2.0) * this.camera.zoom;
      
      // Heat color: Yellow-Orange for stars, Red for hot planets, blue-white for extreme stars
      let color = '255, 50, 0'; // red hot default
      if (b.isStar) {
        color = b.mass > 3000 ? '180, 220, 255' : '255, 170, 0';
      }

      const grad = this.ctx.createRadialGradient(sPos.x, sPos.y, b.radius * this.camera.zoom, sPos.x, sPos.y, glowRad);
      grad.addColorStop(0, `rgba(${color}, 0.35)`);
      grad.addColorStop(0.5, `rgba(${color}, 0.1)`);
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(sPos.x, sPos.y, glowRad, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  drawVectors() {
    this.ctx.lineWidth = 2.0;

    this.engine.bodies.forEach(b => {
      const sPos = this.toScreen(b.x, b.y);

      // 1. Velocity vector (Green arrow)
      const vScale = 15.0; // scale speeds
      const vdx = b.vx * vScale * this.camera.zoom;
      const vdy = b.vy * vScale * this.camera.zoom;
      const vLen = Math.hypot(vdx, vdy);

      if (vLen > 4) {
        this.ctx.strokeStyle = '#00ff66';
        this.ctx.fillStyle = '#00ff66';
        this.drawArrow(sPos.x, sPos.y, sPos.x + vdx, sPos.y + vdy);
      }

      // 2. Net Force/Acceleration vector (Purple arrow)
      if (!b.isFixed) {
        const aScale = 25.0; // scale forces
        const adx = (b.fx / b.mass) * aScale * this.camera.zoom;
        const ady = (b.fy / b.mass) * aScale * this.camera.zoom;
        const aLen = Math.hypot(adx, ady);

        if (aLen > 4) {
          this.ctx.strokeStyle = '#df77ff';
          this.ctx.fillStyle = '#df77ff';
          this.drawArrow(sPos.x, sPos.y, sPos.x + adx, sPos.y + ady);
        }
      }
    });
  }

  // Draw simple clean vector arrow
  drawArrow(fromX, fromY, toX, toY) {
    const headLen = 6; // head pixels
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();

    // Arrow head
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    this.ctx.closePath();
    this.ctx.fill();
  }

  // Draw vector preview and circular prediction path when creating bodies
  drawLaunchGuide(guide) {
    const sStart = this.toScreen(guide.x, guide.y);
    const sEnd = this.toScreen(guide.endX, guide.endY);

    // Launch velocity line
    this.ctx.strokeStyle = '#00f0ff';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(sStart.x, sStart.y);
    this.ctx.lineTo(sEnd.x, sEnd.y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Launcher body overlay
    const sRadius = guide.radius * this.camera.zoom;
    this.ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    this.ctx.beginPath();
    this.ctx.arc(sStart.x, sStart.y, sRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#00f0ff';
    this.ctx.lineWidth = 2.0;
    this.ctx.stroke();
  }

  drawLaunchPrediction(guide) {
    const mockBody = new Body(
      -1, "Mock", 
      guide.x, guide.y,
      guide.vx, guide.vy,
      guide.mass, guide.radius,
      guide.composition
    );

    // Predict steps forward in time
    const path = this.engine.predictOrbit(mockBody, 200, 1.2);
    if (path.length < 2) return;

    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([3, 5]);
    
    this.ctx.beginPath();
    const s0 = this.toScreen(path[0].x, path[0].y);
    this.ctx.moveTo(s0.x, s0.y);

    for (let i = 1; i < path.length; i++) {
      const s = this.toScreen(path[i].x, path[i].y);
      this.ctx.lineTo(s.x, s.y);
    }
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  // Visual effects: spawn collision explosion sparks
  spawnExplosionSparks(x, y, color, particleCount = 20) {
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 3.5;
      this.visParticles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.0 + Math.random() * 2.5,
        color: color,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.02
      });
    }
  }

  updateAndDrawVisualParticles() {
    this.visParticles.forEach(p => {
      // Linear kinematics
      p.x += p.vx;
      p.y += p.vy;

      // Friction drag
      p.vx *= 0.98;
      p.vy *= 0.98;

      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        p.isDestroyed = true;
        return;
      }

      const sPos = this.toScreen(p.x, p.y);
      const sSize = p.size * this.camera.zoom;

      if (sSize > 0.1) {
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = p.alpha;
        this.ctx.beginPath();
        this.ctx.arc(sPos.x, sPos.y, sSize, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.ctx.globalAlpha = 1.0;
    this.visParticles = this.visParticles.filter(p => !p.isDestroyed);
  }
}
