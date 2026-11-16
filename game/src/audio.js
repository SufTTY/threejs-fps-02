// Sound, synthesized with WebAudio so the game ships no audio files: a filtered noise
// gunshot, a pitch-blip hit marker, a deeper kill confirm, enemy shots, and hurt thuds.
// Everything is guarded: a muted or headless context never breaks gameplay.
export function createAudio() {
  let context = null;
  const state = { enabled: false };

  function ensure() {
    if (context) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      context = new Ctx();
      state.enabled = true;
    } catch {
      state.enabled = false;
    }
    return state.enabled;
  }

  function noiseBuffer(seconds) {
    const rate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(rate * seconds)), rate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    }
    return buffer;
  }

  function burst({ seconds = 0.12, frequency = 900, type = 'lowpass', gain = 0.5, q = 0.8 } = {}) {
    if (!ensure()) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, context.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
    source.connect(filter).connect(amp).connect(context.destination);
    source.start();
  }

  function blip({ from = 600, to = 900, seconds = 0.09, gain = 0.18, type = 'square' } = {}) {
    if (!ensure()) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), context.currentTime + seconds);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, context.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
    osc.connect(amp).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + seconds);
  }

  return {
    state,
    resume() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    shot() {
      burst({ seconds: 0.1, frequency: 1100, gain: 0.42 });
      blip({ from: 220, to: 60, seconds: 0.07, gain: 0.14, type: 'sawtooth' });
    },
    hit() {
      blip({ from: 700, to: 1000, seconds: 0.05, gain: 0.14 });
    },
    kill() {
      blip({ from: 420, to: 240, seconds: 0.16, gain: 0.2, type: 'triangle' });
      blip({ from: 630, to: 360, seconds: 0.12, gain: 0.12 });
    },
    headshot() {
      blip({ from: 900, to: 1500, seconds: 0.1, gain: 0.2 });
    },
    enemyShot() {
      burst({ seconds: 0.07, frequency: 500, gain: 0.16 });
    },
    hurt() {
      blip({ from: 160, to: 70, seconds: 0.14, gain: 0.3, type: 'sawtooth' });
    },
    death() {
      blip({ from: 300, to: 50, seconds: 0.6, gain: 0.3, type: 'sawtooth' });
    },
    wave() {
      blip({ from: 330, to: 660, seconds: 0.25, gain: 0.16, type: 'triangle' });
    },
    empty() {
      blip({ from: 1200, to: 900, seconds: 0.03, gain: 0.08 });
    },
  };
}
