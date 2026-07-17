// Procedural Space Audio Synthesizer using Web Audio API

class CosmicSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.droneGain = null;
    this.isMuted = true;
    
    // Background drone oscillators
    this.droneOscs = [];
    this.droneFilter = null;
    
    // Thruster audio nodes
    this.thrusterOsc = null;
    this.thrusterGain = null;
  }

  // Initialize Audio Context on user action
  init() {
    if (this.ctx) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master volume gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.6, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
    
    // Setup background cosmic drone
    this.startCosmicDrone();
  }

  toggleMute() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      const targetVal = this.isMuted ? 0 : 0.6;
      this.masterGain.gain.linearRampToValueAtTime(targetVal, this.ctx.currentTime + 0.1);
    }
    return this.isMuted;
  }

  startCosmicDrone() {
    if (!this.ctx) return;
    
    // Deep lowpass filter for sub-bass rumble
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(80, this.ctx.currentTime);
    this.droneFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);
    this.droneFilter.connect(this.masterGain);
    
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    this.droneGain.connect(this.droneFilter);
    
    // Beating frequency drone (55Hz and 55.4Hz)
    const freqs = [55.0, 55.4, 110.0];
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      // Separate gain for subtle volume modulation
      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(idx === 2 ? 0.05 : 0.4, this.ctx.currentTime);
      
      osc.connect(oscGain);
      oscGain.connect(this.droneGain);
      osc.start();
      
      this.droneOscs.push({ osc, gain: oscGain });
    });
    
    // Cosmic sweep filter modulation (Slow LFO)
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.05, this.ctx.currentTime); // 20s cycle
    
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(30, this.ctx.currentTime); // sweep filter between 50Hz and 110Hz
    
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneFilter.frequency);
    lfo.start();
  }

  // Play celestial chime when a body is spawned
  // Mass determines pitch: high mass = low frequency
  playSpawn(mass) {
    if (!this.ctx || this.isMuted) return;
    
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    
    const t = this.ctx.currentTime;
    
    // Map mass to frequency (logarithmic scale)
    // Low mass (e.g. 5) -> ~600Hz, High mass (e.g. 2000) -> ~70Hz
    const minMass = 1;
    const maxMass = 5000;
    const minFreq = 80;
    const maxFreq = 650;
    
    const ratio = Math.min(1, Math.max(0, (Math.log(mass) - Math.log(minMass)) / (Math.log(maxMass) - Math.log(minMass))));
    const freq = maxFreq - ratio * (maxFreq - minFreq);
    
    // Chime Synth: Oscillator -> Filter -> Gain
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gainNode = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    
    // Harmonics for a warmer chime sound
    const osc2 = this.ctx.createOscillator();
    const gainNode2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 1.5, t); // perfect fifth harmonic
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 2.5, t);
    
    // Envelope: sharp attack, exponential decay
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    
    gainNode2.gain.setValueAtTime(0, t);
    gainNode2.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gainNode2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    
    // Connections
    osc.connect(gainNode);
    osc2.connect(gainNode2);
    gainNode.connect(filter);
    gainNode2.connect(filter);
    filter.connect(this.masterGain);
    
    // Start & Stop
    osc.start(t);
    osc2.start(t);
    
    osc.stop(t + 0.9);
    osc2.stop(t + 0.9);
  }

  // Play explosion sound when bodies collide
  // Energy represents kinetic energy of collision
  playCollision(energy) {
    if (!this.ctx || this.isMuted) return;
    
    const t = this.ctx.currentTime;
    
    // Limit volume factor
    const volFactor = Math.min(0.5, Math.max(0.02, energy * 0.0001));
    const duration = Math.min(1.5, Math.max(0.2, 0.1 + energy * 0.0002));
    
    // Noise buffer generation for explosion hiss
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    // Sub-harmonic boom oscillator
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(90, t);
    subOsc.frequency.exponentialRampToValueAtTime(25, t + duration * 0.8);
    
    // Filters
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(300, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(60, t + duration);
    noiseFilter.Q.setValueAtTime(2.0, t);
    
    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(100, t);
    
    // Gain Envelopes
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(volFactor * 0.4, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(volFactor * 0.8, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.5);
    
    // Connections
    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    
    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.masterGain);
    
    // Execute
    noiseNode.start(t);
    subOsc.start(t);
    
    noiseNode.stop(t + duration + 0.1);
    subOsc.stop(t + duration + 0.1);
  }

  // Play deep sweep when black hole swallows an object
  playBlackHoleAccretion() {
    if (!this.ctx || this.isMuted) return;
    
    const t = this.ctx.currentTime;
    
    // Frequency sweeps down representing gravitational redshift / pull
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, t);
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.4, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    osc.start(t);
    osc.stop(t + 0.7);
  }

  // Handle thruster force engine sound
  startThrust() {
    if (!this.ctx || this.isMuted || this.thrusterOsc) return;
    
    const t = this.ctx.currentTime;
    
    this.thrusterOsc = this.ctx.createOscillator();
    this.thrusterOsc.type = 'triangle';
    this.thrusterOsc.frequency.setValueAtTime(65, t); // Low rumble hum
    
    this.thrusterGain = this.ctx.createGain();
    this.thrusterGain.gain.setValueAtTime(0, t);
    this.thrusterGain.gain.linearRampToValueAtTime(0.3, t + 0.1);
    
    // Bandpass filter to sound mechanical
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(100, t);
    filter.Q.setValueAtTime(3.0, t);
    
    this.thrusterOsc.connect(filter);
    filter.connect(this.thrusterGain);
    this.thrusterGain.connect(this.masterGain);
    
    this.thrusterOsc.start(t);
  }

  stopThrust() {
    if (!this.ctx || !this.thrusterOsc) return;
    
    const t = this.ctx.currentTime;
    const osc = this.thrusterOsc;
    const gain = this.thrusterGain;
    
    this.thrusterOsc = null;
    this.thrusterGain = null;
    
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    
    setTimeout(() => {
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch (e) {}
    }, 200);
  }
}

export const audio = new CosmicSynth();
