export function createNavigation(engine, { onHour }) {
  const root = document.createElement('div');
  root.className = 'hud navigation';
  root.innerHTML = '<div class="navigation-disc"></div><button class="navigation-switch" type="button" aria-label="切換地圖與時鐘" title="地圖 / 時鐘">時</button>';
  document.getElementById('ui').append(root);
  const disc = root.querySelector('.navigation-disc');
  const toggle = root.querySelector('.navigation-switch');
  let clockMode = false, field = null, project = null, player = null, hand = null, hourText = null, clock = null;
  toggle.addEventListener('click', () => {
    clockMode = !clockMode;
    root.classList.toggle('clock-mode', clockMode);
    toggle.textContent = clockMode ? '圖' : '時';
    if (field) render(field);
  });
  function svg(markup) {
    disc.innerHTML = markup;
    player = disc.querySelector('.map-player');
    hand = disc.querySelector('.clock-hand');
    hourText = disc.querySelector('.clock-hour');
    clock = disc.querySelector('.clock-face');
    if (clock) {
      let dragging = false;
      const choose = event => {
        const bounds = clock.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width * 160 - 80;
        const y = (event.clientY - bounds.top) / bounds.height * 160 - 80;
        const angle = Math.atan2(x, -y);
        const hour = ((angle / (Math.PI * 2) + 1) % 1) * 24;
        engine.env.setHour(hour);
        onHour();
      };
      clock.addEventListener('pointerdown', event => {
        event.preventDefault(); event.stopPropagation();
        dragging = true;
        clock.setPointerCapture(event.pointerId);
        choose(event);
      });
      clock.addEventListener('pointermove', event => {
        if (!dragging) return;
        event.preventDefault(); event.stopPropagation();
        choose(event);
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) clock.addEventListener(name, () => { dragging = false; });
      clock.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
        event.preventDefault(); event.stopPropagation();
        engine.env.setHour(engine.env.hour + (['ArrowRight', 'ArrowUp'].includes(event.code) ? 0.25 : -0.25));
        onHour();
      });
    }
  }
  function renderMap() {
    const points = field.config.coastline;
    const all = [...points, ...field.config.route.points, ...field.config.road.flatMap(way => way.points)];
    const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
    const minZ = Math.min(...all.map(p => p.z)), maxZ = Math.max(...all.map(p => p.z));
    const scale = Math.min(126 / (maxX - minX), 126 / (maxZ - minZ));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    project = p => [80 + (p.x - cx) * scale, 80 + (p.z - cz) * scale];
    const path = items => items.map((p, i) => `${i ? 'L' : 'M'}${project(p).map(v => v.toFixed(1)).join(',')}`).join(' ');
    const coast = path(points);
    const last = project(points.at(-1)), first = project(points[0]);
    const land = `${coast} L${last[0]},170 L0,170 L0,${first[1]} Z`;
    const destinations = [['road', '入口'], ['overlook', '左岸'], ['reef', '海']];
    const labels = destinations.map(([id, text]) => {
      const view = field.config.viewpoints[id];
      const [x, y] = project({ x: view.position[0], z: view.position[1] });
      return `<circle cx="${x}" cy="${y}" r="2.2" fill="#e9d6a1"/><text x="${x + 5}" y="${y + 3}" fill="#f2eed9" font-size="8">${text}</text>`;
    }).join('');
    svg(`<svg viewBox="0 0 160 160" class="map-face" role="img" aria-label="龍磐公園路線地圖">
      <defs><clipPath id="navigation-circle"><circle cx="80" cy="80" r="70"/></clipPath></defs>
      <circle cx="80" cy="80" r="72" fill="#142f38" fill-opacity=".86" stroke="#e5e8d7" stroke-opacity=".55"/>
      <g clip-path="url(#navigation-circle)"><rect width="160" height="160" fill="#254d5b"/>
        <path d="${land}" fill="#465443"/>
        <path d="${coast}" fill="none" stroke="#bccab6" stroke-width="1.5"/>
        ${field.config.road.map(way => `<path d="${path(way.points)}" fill="none" stroke="#929b93" stroke-width="2.4"/>`).join('')}
        <path d="${path(field.config.route.points)}" fill="none" stroke="#e2c68e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        ${labels}
      </g><circle cx="80" cy="80" r="69" fill="none" stroke="#ffffff18"/>
      <text x="80" y="17" text-anchor="middle" fill="#eef0db" font-size="9">N</text>
      <g class="map-player"><circle r="7" fill="#f8efd31f" stroke="#fbf1c4" stroke-opacity=".65"/><path d="M0,-5.5 L4,5 L0,2.7 L-4,5Z" fill="#fff2c2"/></g>
    </svg>`);
  }
  function renderClock() {
    const ticks = Array.from({ length: 24 }, (_, i) => {
      const a = i / 24 * Math.PI * 2 - Math.PI / 2;
      const inner = i % 6 === 0 ? 57 : 62;
      return `<line x1="${80 + Math.cos(a) * inner}" y1="${80 + Math.sin(a) * inner}" x2="${80 + Math.cos(a) * 68}" y2="${80 + Math.sin(a) * 68}" stroke="#e4e6d4" stroke-opacity="${i % 6 === 0 ? 0.9 : 0.4}"/>`;
    }).join('');
    svg(`<svg viewBox="0 0 160 160" class="clock-face" role="slider" tabindex="0" aria-label="選擇一天中的時間" aria-valuemin="0" aria-valuemax="24">
      <circle cx="80" cy="80" r="72" fill="#142f38" fill-opacity=".9" stroke="#e5e8d7" stroke-opacity=".55"/>
      <path d="M140 80 A60 60 0 0 1 20 80" fill="none" stroke="#c5ac75" stroke-width="3" stroke-opacity=".8"/>
      <path d="M20 80 A60 60 0 0 1 140 80" fill="none" stroke="#557493" stroke-width="3" stroke-opacity=".8"/>
      ${ticks}<text x="80" y="17" text-anchor="middle" fill="#e8e7d2" font-size="9">24</text>
      <text x="146" y="84" text-anchor="middle" fill="#e8d2a1" font-size="8">6</text><text x="14" y="84" text-anchor="middle" fill="#e8d2a1" font-size="8">18</text>
      <path class="clock-hand" d="M80 80 Q82 57 80 37" fill="none" stroke="#fae8b4" stroke-width="2" stroke-linecap="round"/>
      <circle cx="80" cy="80" r="3.2" fill="#f5e6b6"/>
      <text class="clock-hour" x="80" y="116" text-anchor="middle" fill="#f4ecd4" font-size="12">10:30</text>
      <text x="80" y="132" text-anchor="middle" fill="#c2cbbd" font-size="7">拖動選擇時刻</text>
    </svg>`);
  }
  function render() { if (clockMode) renderClock(); else renderMap(); }
  return {
    setField(value) { field = value; render(); },
    tick(t, controls) {
      if (!field) return;
      if (player && controls) {
        const [x, y] = project(controls.position);
        player.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${(controls.yaw * 180 / Math.PI + 180).toFixed(1)})`);
      }
      if (hand) hand.setAttribute('transform', `rotate(${(engine.env.hour * 15 + Math.sin(t * 2.1) * 1.1).toFixed(2)} 80 80)`);
      if (hourText) {
        const hour = Math.floor(engine.env.hour), minutes = Math.floor((engine.env.hour % 1) * 60);
        hourText.textContent = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        clock?.setAttribute('aria-valuenow', engine.env.hour.toFixed(2));
      }
    },
  };
}
