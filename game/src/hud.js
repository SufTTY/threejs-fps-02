// The DOM HUD: crosshair with spread bloom, hit marker, health, ammo, wave banner, kill
// feed and the one overlay panel. It never touches the simulation; main.js pushes numbers
// in and reads the play callback out.
const COPY = {
  start: {
    title: 'OVERRUN',
    copy: 'Hunter drones are breaching the yard in waves. Hold out. Head shots pay double.',
    action: 'Click to play',
  },
  paused: {
    title: 'OVERRUN',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'OVERRUN',
    copy: 'You went down.',
    action: 'Try again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const scoreValue = document.getElementById('score-value');
  const waveValue = document.getElementById('wave-value');
  const healthFill = document.getElementById('health-fill');
  const healthValue = document.getElementById('health-value');
  const healthBar = document.getElementById('health');
  const banner = document.getElementById('banner');
  const bannerTitle = document.getElementById('banner-title');
  const bannerSub = document.getElementById('banner-sub');
  const feed = document.getElementById('feed');
  const crosshair = document.getElementById('crosshair');
  const vignette = document.getElementById('vignette');
  const hitmarker = document.getElementById('hitmarker');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastScore = -1;
  let lastWave = -1;
  let lastHealth = -1;

  function feedLine(text, accent) {
    const line = document.createElement('div');
    line.className = 'feed-line' + (accent ? ' accent' : '');
    line.textContent = text;
    feed.prepend(line);
    while (feed.children.length > 4) feed.lastChild.remove();
    setTimeout(() => { line.classList.add('fade'); }, 2600);
    setTimeout(() => { line.remove(); }, 3200);
  }

  return {
    feedLine,
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setScore(value) {
      if (value === lastScore) return;
      lastScore = value;
      scoreValue.textContent = String(value);
    },
    setWave(value, sub = '') {
      if (value !== lastWave) {
        lastWave = value;
        waveValue.textContent = String(value);
      }
      if (sub) bannerSub.textContent = sub;
    },
    bannerWave(number) {
      bannerTitle.textContent = `WAVE ${number}`;
      bannerSub.textContent = `${Math.min(3 + number, 14)} drones inbound`;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), 2200);
    },
    bannerClear(score) {
      bannerTitle.textContent = 'WAVE CLEARED';
      bannerSub.textContent = `+${score} bonus · next wave soon`;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), 2200);
    },
    setHealth(value) {
      const rounded = Math.round(value);
      if (rounded === lastHealth) return;
      lastHealth = rounded;
      healthFill.style.width = `${Math.max(0, rounded)}%`;
      healthValue.textContent = String(rounded);
      healthBar.classList.toggle('low', rounded <= 30);
      vignette.classList.toggle('hurt', rounded <= 30);
    },
    flashHurt() {
      vignette.classList.remove('hit');
      void vignette.offsetWidth;
      vignette.classList.add('hit');
      setTimeout(() => vignette.classList.remove('hit'), 220);
    },
    setSpread(scale) {
      crosshair.style.setProperty('--spread', `${scale.toFixed(2)}em`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    showOverlay(mode, score, wave) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'dead'
        ? `${text.copy} You reached wave ${wave} with ${score} points.`
        : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
