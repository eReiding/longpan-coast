import { createNavigation } from './ui/navigation.js';
import './ui/navigation.css';

const DESTINATIONS = [
  ['entrance', '公園入口', '台26線 · 步道起點'],
  ['road', '台26公路', '雙黃線與公路彎道'],
  ['trail', '林蔭小徑', '紅土、林投與雲影'],
  ['meadow', '台地草坡', '瓊麻、馬鞍藤與草浪'],
  ['overlook', '高位左岸', '太平洋與層層礁岸'],
  ['valley', '右側谷地', '海岸灌叢與遠山'],
  ['reef', '潮間帶', '溶蚀礁岩、潮池與碎浪'],
  ['sunrise', '海上日出', '面向太平洋的金色清晨'],
  ['sunset', '內陸日落', '面向西方的真實日落方向'],
];

export function createUI(engine) {
  const root = document.getElementById('ui');
  root.innerHTML = `
    <div class="hud quick-hint" role="status">WASD 行走 · 雙指縮放 · <b>B</b> 俯瞰 · <b>H</b> 工具</div>
    <header class="hud masthead"><div class="brand">LONGPAN</div><div class="place">龍磐 · 墾丁國家公園</div><div class="geo">21°55′40.1″ N &nbsp; 120°50′58.1″ E</div></header>
    <div class="hud weather"><div class="wind"><span class="wind-arrow"></span><span>東北風 · 風場模擬<small>Pacific coast, Taiwan</small></span></div><button class="icon-button" id="info-button" title="場景與資料說明" aria-label="場景與資料說明">i</button></div>
    <div class="hud compass"><span>N</span><i></i><strong id="bearing">E</strong><i></i><span>S</span></div>
    <div class="hud dock">
      <nav class="views" aria-label="觀景機位"><button class="view" data-view="entrance">入口</button><button class="view" data-view="trail">小徑</button><button class="view active" data-view="overlook">左岸</button></nav>
      <button class="text-button" id="destination-button" title="目的地 M">景點 <kbd>M</kbd></button>
      <div class="divider"></div>
      <div class="time-control"><label for="hour">時刻</label><input id="hour" type="range" min="0" max="24" step="0.05" value="10.5" aria-label="一天中的時刻"><output id="hour-label">10:30</output></div>
      <label class="cycle" title="48 分鐘一個晝夜"><input id="cycle" type="checkbox">晝夜</label>
      <select class="quality" id="quality" title="渲染畫質" aria-label="渲染畫質"><option value="high">高畫質</option><option value="low">流暢</option></select>
      <button class="text-button" id="mode" title="V · 第一人稱/第三觀景">第一人稱</button>
      <button class="text-button" id="auto" title="F · 沿真實步道導覽">導覽</button>
      <button class="text-button" id="audio" title="海浪與風聲，需點擊開啟">聲景</button>
      <button class="text-button" id="theater-button" title="播放日出或日落">劇場</button>
    </div>
    <div class="hud theater" id="theater" hidden><button class="text-button" data-play="sunrise">海上日出</button><button class="text-button" data-play="sunset">內陸日落</button><button class="text-button" id="play-pause">暫停</button><input id="playback-progress" type="range" min="0" max="1" step="0.001" value="0" aria-label="動畫進度"><output id="playback-time">00:00</output><button class="text-button" id="stop-playback">退出</button></div>
    <div class="hud bottom"><div class="instructions"><span><b>W A S D</b> 行走</span><span class="desktop-hint">拖動環顧 · 滾輪觀察</span><span class="desktop-hint"><b>V</b> 視角 · <b>G</b> 下一景點</span></div><div class="actions"><button class="text-button" id="capture" disabled><span class="record-dot"></span><span id="capture-label">錄屏</span> <kbd>R</kbd></button><button class="text-button" id="hide">隱藏 <kbd>H</kbd></button></div></div>
    <div class="hud record-state" id="record-state">REC · 00:00</div>
    <div class="hud touch-pad"><button data-key="KeyW" aria-label="向前">↑</button><button data-key="KeyA" aria-label="向左">←</button><button data-key="KeyS" aria-label="向後">↓</button><button data-key="KeyD" aria-label="向右">→</button></div>
    <aside class="hud info-panel destination-panel" id="destinations" hidden><button class="close" id="close-destinations" aria-label="關閉">×</button><h2>去一個地方</h2><p>立即抵達，不必慢慢走過去。</p><div class="destination-list">${DESTINATIONS.map(([id, title, description]) => `<button class="destination-item" data-view="${id}"><strong>${title}</strong><span>${description}</span></button>`).join('')}</div></aside>
    <aside class="hud info-panel" id="info" hidden><button class="close" id="close-info" aria-label="關閉">×</button><h2>風入海岬</h2><p>從台26公路旁，沿紅土小徑走向太平洋。這裡有隆起珊瑚礁、鹽風草坡與本地海岸植物。全部場景由程序生成，不使用照片背景。</p><small>這是依據公開地形、OSM與照片重建的互動風景，不是測繪模型。東向為海上日出，西向為內陸日落；動物為氛圍設計。</small><div class="sensitivity"><label for="sensitivity">滑鼠速度</label><input id="sensitivity" type="range" min="0.003" max="0.015" step="0.0005" value="0.0105"></div><div class="credits"><button class="text-button" id="cad-export" disabled>导出局部地形 OBJ</button><br><small>米制 · 周围 220 m · 非工程测量</small><br><br>Three.js · WebGL2 · FFT ocean<br>Terrain Tiles by Mapzen / Tilezen, AWS Open Data<br>SRTM data courtesy of the U.S. Geological Survey<br>Global ETOPO1 terrain data U.S. NOAA<br>© OpenStreetMap contributors, ODbL 1.0<br><a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">地形資料來源與授權 ↗</a><br><a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">程序與素材許可 ↗</a></div></aside>`;
  const $ = id => document.getElementById(id);
  const ui = { controls: null, sky: null, post: null, recorder: null, playback: null, audio: null, field: null, cycle: false };
  for (const button of root.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => {
      ui.controls?.setView(button.dataset.view);
      $('destinations').hidden = true;
    });
  }
  const toggleDestinations = () => { $('destinations').hidden = !$('destinations').hidden; };
  $('destination-button').addEventListener('click', toggleDestinations);
  $('close-destinations').addEventListener('click', () => { $('destinations').hidden = true; });
  document.addEventListener('longpan-navigate', toggleDestinations);
  $('mode').addEventListener('click', () => ui.controls?.toggleMode());
  $('auto').addEventListener('click', () => ui.controls?.toggleAuto());
  $('hour').addEventListener('input', event => { engine.env.setHour(Number(event.target.value)); updateHour(); });
  $('cycle').addEventListener('change', event => { ui.cycle = event.target.checked; });
  $('quality').value = engine.quality.name;
  $('quality').addEventListener('change', event => {
    engine.setQuality(event.target.value);
    ui.post?.resize();
    if (ui.sky) ui.sky.clouds.material.uniforms.uSteps.value = engine.quality.cloudSteps;
  });
  $('audio').addEventListener('click', () => ui.audio?.toggle());
  $('theater-button').addEventListener('click', () => { $('theater').hidden = !$('theater').hidden; });
  $('sensitivity').addEventListener('input', event => { if (ui.controls) ui.controls.sensitivity = Number(event.target.value); });
  $('info-button').addEventListener('click', () => { $('info').hidden = !$('info').hidden; });
  $('close-info').addEventListener('click', () => { $('info').hidden = true; });
  const toggleTools = () => document.body.classList.toggle('tools-expanded');
  $('hide').addEventListener('click', toggleTools);
  for (const button of root.querySelectorAll('[data-play]')) button.addEventListener('click', () => {
    $('theater').hidden = false;
    ui.playback?.play(button.dataset.play);
  });
  $('play-pause').addEventListener('click', () => ui.playback?.togglePause());
  $('stop-playback').addEventListener('click', () => { ui.playback?.stop(); $('theater').hidden = true; });
  $('playback-progress').addEventListener('input', event => ui.playback?.seek(Number(event.target.value)));
  addEventListener('keydown', event => {
    if (event.target.isContentEditable || event.target.tagName === 'TEXTAREA' || (event.target.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(event.target.type))) return;
    if (event.code === 'KeyH' && !event.repeat) toggleTools();
    if (event.code === 'KeyR' && !event.repeat) ui.recorder?.toggle();
  });
  for (const button of root.querySelectorAll('[data-key]')) {
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); ui.controls?.setKey(button.dataset.key, true); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => ui.controls?.setKey(button.dataset.key, false));
  }
  function updateHour() {
    const hour = Math.floor(engine.env.hour), minutes = Math.floor((engine.env.hour % 1) * 60);
    $('hour-label').value = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    $('hour').value = engine.env.hour;
  }
  let statTime = 0;
  const navigation = createNavigation(engine, {
    onHour() { ui.playback?.stop(); updateHour(); },
  });
  updateHour();
  let noticeTimer = 0;
  return Object.assign(ui, {
    notify(message) {
      const hint = root.querySelector('.quick-hint');
      hint.textContent = message;
      hint.style.animation = 'none';
      hint.style.visibility = 'visible';
      hint.style.opacity = '0.88';
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        hint.style.opacity = '0';
        hint.style.visibility = 'hidden';
      }, 4200);
    },
    setField(field) { ui.field = field; navigation.setField(field); },
    tick(t, dt) {
      navigation.tick(t, ui.controls);
      if (ui.cycle && !ui.playback?.active) { engine.env.setHour(engine.env.hour + dt * 24 / 2880); updateHour(); }
      statTime += dt;
      if (statTime > 0.15) {
        const active = root.querySelector(`.view[data-view="${ui.controls?.view}"]`);
        root.querySelectorAll('.view').forEach(button => button.classList.toggle('active', button === active));
        $('auto').classList.toggle('active', !!ui.controls?.auto);
        $('mode').textContent = ui.controls?.mode === 'third' ? '第三觀景' : '第一人稱';
        const deg = ((ui.controls?.yaw || 0) * 180 / Math.PI % 360 + 360) % 360;
        $('bearing').textContent = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'][Math.round(deg / 45) % 8];
        if (ui.audio) $('audio').textContent = ui.audio.unsupported ? '不支援' : ui.audio.enabled ? '聲景中' : '聲景';
        if (ui.playback?.active) {
          updateHour();
          $('theater').hidden = false;
          $('playback-progress').value = ui.playback.progress;
          $('play-pause').textContent = ui.playback.playing ? '暫停' : '播放';
          const seconds = Math.floor(ui.playback.progress * ui.playback.duration);
          $('playback-time').value = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        }
        statTime = 0;
      }
      if (ui.recorder?.active) {
        const s = Math.floor(ui.recorder.elapsed);
        $('record-state').textContent = `REC · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      }
    },
    setRecorder(recorder) {
      ui.recorder = recorder;
      $('capture').disabled = !recorder.supported;
      $('capture').title = recorder.supported ? '即時錄製 WebGL 畫面，聲景開啟時包含音軌' : '此瀏覽器不支持 canvas 即時錄屏';
      if (!recorder.supported) $('capture-label').textContent = '錄屏不可用';
      $('capture').addEventListener('click', () => recorder.toggle());
      recorder.onchange = () => {
        document.body.classList.toggle('recording', recorder.active || recorder.stopping);
        $('capture-label').textContent = recorder.stopping ? '停止中' : recorder.active ? '停止' : '錄屏';
      };
    },
    setError(message) {
      const loading = document.getElementById('loading');
      loading.classList.add('error');
      loading.classList.remove('loaded');
      document.getElementById('load-status').textContent = message;
    },
  });
}
