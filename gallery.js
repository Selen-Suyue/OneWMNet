'use strict';
(() => {
  const mediaBase = 'assets/predictions/';
  const root = document.querySelector('#prediction-gallery');
  const speed = document.querySelector('#gallery-speed');
  const playAll = document.querySelector('#play-visible');
  const pagination = document.querySelector('#gallery-pages');
  const fixed = value => (Number.isFinite(value) ? value : 0).toFixed(3);
  let cases = [], cards = [], page = 0;
  const titles = {'cabinet-withdrawal':'Cabinet interaction', 'croissant-plate':'Croissant plate approach', 'counter-descent':'Countertop approach'};

  function reflectPlayback() {
    const playing = cards.some(card => card.playing);
    playAll.textContent = playing ? 'Ⅱ Pause all' : '▶ Play all';
    playAll.setAttribute('aria-label', playing ? 'Pause all three examples' : 'Play all three examples');
    playAll.disabled = !cards.some(card => card.ready);
  }
  function pauseAll() { cards.forEach(card => card.pause()); }
  function offsetFor(sample, time) {
    return Math.min(time * sample.displayFps * sample.actionStride, sample.frameOffsets.at(-1));
  }
  class PredictionCard {
    constructor(sample, index) {
      this.sample = sample;
      this.playing = false;
      this.ready = false;
      this.time = 0;
      this.version = 0;
      this.animation = 0;
      this.element = document.createElement('article');
      this.element.className = 'prediction-card';
      this.element.dataset.case = sample.id;
      this.element.setAttribute('aria-label', sample.title);
      this.element.innerHTML = `
        <div class="case-head"><div><p><span class="case-benchmark"></span></p><h3></h3></div></div>
        <div class="case-pair"><figure><figcaption><i class="rose-dot"></i>Prediction</figcaption><video muted playsinline preload="auto" class="case-prediction" aria-label="Predicted future"></video></figure><figure><figcaption><i class="blue-dot"></i>Reference</figcaption><video muted playsinline preload="auto" class="case-reference" aria-label="Recorded reference future"></video></figure></div>
        <div class="case-camera-row"><span>View</span><div class="case-cameras" role="group" aria-label="Camera view"></div></div>
        <div class="case-trajectory"><div class="case-trajectory-top"><span>Recorded motion · m</span><button class="case-reset" type="button" aria-label="Reset trajectory view">↺</button></div><canvas tabindex="0" aria-label="3D recorded end-effector trajectory. Drag or use arrow keys to rotate. Press R to reset."></canvas><div class="case-action"><span><b>Δx</b> <span class="action-x">—</span></span><span><b>Δy</b> <span class="action-y">—</span></span><span><b>Δz</b> <span class="action-z">—</span></span><span class="grip-cell"><b>GRIP</b> <span class="action-grip">—</span></span></div></div>
        <div class="case-controls"><button class="circle-button case-play" type="button" aria-label="Play synchronized prediction" disabled>▶</button><input type="range" min="0" max="1000" value="0" aria-label="Prediction timeline"><span class="case-time">0.00 s</span></div>
        <details class="case-protocol"><summary>Sample details</summary><div><p class="case-timing"></p><p class="case-task"></p><p class="case-model"></p><p class="case-rotation"></p><p class="case-gripper"></p><p>Δx / Δy / Δz and gripper values are raw conditioning controls.</p></div></details><p class="case-error" role="status" hidden></p>`;
      this.q = selector => this.element.querySelector(selector);
      this.q('h3').textContent = titles[sample.id] || sample.title;
      this.q('.case-benchmark').textContent = sample.benchmark.toUpperCase();
      this.q('.case-task').textContent = sample.task;
      this.q('.case-model').textContent = `${sample.model.label}. ${sample.model.selection}`;
      this.q('.case-gripper').textContent = sample.actionSemantics.gripperConvention;
      this.prediction = this.q('.case-prediction');
      this.reference = this.q('.case-reference');
      this.playButton = this.q('.case-play');
      this.progress = this.q('input');
      this.videos = [this.prediction, this.reference];
      this.videos.forEach(video => {
        video.muted = true;
        video.loop = true;
        video.addEventListener('error', () => {
          if (!this.disposed) this.error('This clip could not load. Please reload the local preview.');
        });
      });
      root.append(this.element);
      this.view = new TrajectoryView(this.q('canvas'), sample);
      this.q('.case-reset').addEventListener('click', () => this.view.reset());
      this.playButton.addEventListener('click', () => this.playing ? this.pause() : this.play());
      this.progress.addEventListener('input', () => { this.pause(); this.seek(Number(this.progress.value) / 1000 * sample.duration); });
      sample.cameras.forEach((camera, i) => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = camera.label;
        button.setAttribute('aria-label', `${camera.label} camera`);
        button.addEventListener('click', () => this.loadCamera(i, this.time));
        this.q('.case-cameras').append(button);
      });
      this.updateProtocol();
      this.update();
      this.loadCamera(Math.max(0, sample.cameras.findIndex(camera => camera.id === sample.recommendedCamera)));
    }
    error(message) {
      this.pause(); this.ready = false; this.playButton.disabled = true;
      this.q('.case-error').hidden = false;
      this.q('.case-error').textContent = message;
      reflectPlayback();
    }
    updateProtocol() {
      this.q('.case-timing').textContent = `${this.sample.sourceHorizonSeconds.toFixed(1)} s source horizon · ${Number((this.sample.displaySpeedRelativeToSource * Number(speed.value)).toFixed(3))}× source speed`;
      this.videos.forEach(video => { video.defaultPlaybackRate = video.playbackRate = Number(speed.value); });
    }
    pause() {
      this.playing = false;
      this.videos.forEach(video => video.pause());
      cancelAnimationFrame(this.animation);
      this.animation = 0;
      this.playButton.textContent = '▶';
      this.playButton.setAttribute('aria-label', 'Play synchronized prediction');
      reflectPlayback();
    }
    async play() {
      if (!this.ready || this.disposed) return;
      document.querySelectorAll('.real-card video').forEach(video => video.pause());
      document.dispatchEvent(new Event('prediction-video-play'));
      if (this.prediction.currentTime >= this.sample.duration - .02) this.seek(0);
      this.reference.currentTime = this.prediction.currentTime;
      this.playing = true;
      const version = this.version;
      try {
        await Promise.all(this.videos.map(video => video.play()));
        if (this.disposed || version !== this.version || !this.playing) return;
        this.playButton.textContent = 'Ⅱ';
        this.playButton.setAttribute('aria-label', 'Pause synchronized prediction');
        reflectPlayback();
        this.tick();
      } catch (error) {
        if (version === this.version && this.playing) this.error('Playback is unavailable. Please reload this preview.');
      }
    }
    tick() {
      if (!this.playing) return;
      const time = this.prediction.currentTime;
      if (time < this.time || Math.abs(this.reference.currentTime - time) > .07) this.reference.currentTime = time;
      this.time = time;
      this.update();
      this.animation = requestAnimationFrame(() => this.tick());
    }
    seek(time) {
      this.time = Math.max(0, Math.min(time, this.sample.duration - .002));
      this.videos.forEach(video => { video.currentTime = this.time; });
      this.update();
    }
    update() {
      const offset = offsetFor(this.sample, this.time);
      const action = this.sample.actions[Math.min(Math.floor(offset), this.sample.actions.length - 1)];
      this.progress.value = String(this.time / this.sample.duration * 1000);
      this.q('.case-time').textContent = `${(offset / this.sample.controlFps).toFixed(2)} s`;
      if (action) {
        ['x','y','z'].forEach((axis,i) => { this.q(`.action-${axis}`).textContent = fixed(action.translation[i]); });
        this.q('.action-grip').textContent = fixed(action.gripper);
        this.q('.case-rotation').textContent = `ROT ${action.rotation.map(fixed).join(' / ')}${action.baseMotion ? ' · BASE ' + action.baseMotion.map(fixed).join(' / ') : ''}`;
      }
      this.view.time = this.time;
      this.view.draw();
    }
    mediaReady(video, path, poster, signal) {
      return new Promise((resolve, reject) => {
        const clean = () => { video.removeEventListener('loadeddata', complete); video.removeEventListener('error', failed); signal.removeEventListener('abort', canceled); };
        const complete = () => { clean(); resolve(true); };
        const canceled = () => { clean(); resolve(false); };
        const failed = () => { clean(); reject(new Error('Media unavailable')); };
        video.addEventListener('loadeddata', complete, {once:true});
        video.addEventListener('error', failed, {once:true});
        signal.addEventListener('abort', canceled, {once:true});
        video.poster = mediaBase + poster; video.src = mediaBase + path; video.load();
      });
    }
    async loadCamera(index, time = 0) {
      this.pause();
      this.version++;
      this.loadAbort?.abort();
      this.loadAbort = new AbortController();
      const version = this.version;
      const camera = this.sample.cameras[index];
      this.ready = false; this.playButton.disabled = true;
      this.element.setAttribute('aria-busy', 'true');
      this.q('.case-error').hidden = true;
      [...this.q('.case-cameras').children].forEach((button,i) => button.setAttribute('aria-pressed', String(index === i)));
      try {
        const results = await Promise.all([
          this.mediaReady(this.prediction, camera.prediction, camera.posters.prediction, this.loadAbort.signal),
          this.mediaReady(this.reference, camera.groundTruth, camera.posters.groundTruth, this.loadAbort.signal)
        ]);
        if (this.disposed || version !== this.version || results.includes(false)) return;
        this.ready = true; this.playButton.disabled = false;
        this.element.setAttribute('aria-busy','false');
        this.updateProtocol(); this.seek(time); reflectPlayback();
      } catch (error) {
        if (version === this.version && !this.disposed) this.error('Unable to load this camera view. Please reload the preview.');
      }
    }
    destroy() {
      this.disposed = true; this.pause(); this.version++;
      this.loadAbort?.abort(); this.view.observer.disconnect();
      this.videos.forEach(video => { video.removeAttribute('src'); video.load(); });
    }
  }

  class TrajectoryView {
    constructor(canvas, sample) {
      this.canvas = canvas; this.context = canvas.getContext('2d'); this.sample = sample;
      this.time = 0; this.yaw = -.8; this.pitch = .6; this.dragging = null;
      this.points = sample.trajectory.map(point => [point.x,point.y,point.z]);
      const minima = [0,1,2].map(axis => Math.min(...this.points.map(point => point[axis])));
      const maxima = [0,1,2].map(axis => Math.max(...this.points.map(point => point[axis])));
      this.center = minima.map((min,axis) => (min+maxima[axis])/2);
      this.extent = Math.max(...maxima.map((max,axis) => max-minima[axis]),.02);
      this.floorZ = (minima[2]-this.center[2])/this.extent-.14;
      canvas.addEventListener('pointerdown', event => { this.dragging={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId); });
      canvas.addEventListener('pointermove', event => {
        if (!this.dragging) return;
        this.yaw += (event.clientX-this.dragging.x)*.009;
        this.pitch = Math.max(.1,Math.min(1.35,this.pitch+(event.clientY-this.dragging.y)*.007));
        this.dragging={x:event.clientX,y:event.clientY}; this.draw();
      });
      ['pointerup','pointercancel','lostpointercapture'].forEach(name => canvas.addEventListener(name, () => { this.dragging=null; }));
      canvas.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','r','R'].includes(event.key)) return;
        event.preventDefault();
        if (event.key.toLowerCase()==='r') return this.reset();
        this.yaw += event.key==='ArrowRight'?.12:event.key==='ArrowLeft'?-.12:0;
        this.pitch = Math.max(.1,Math.min(1.35,this.pitch+(event.key==='ArrowDown'?.08:event.key==='ArrowUp'?-.08:0)));
        this.draw();
      });
      this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
    }
    reset() { this.yaw=-.8; this.pitch=.6; this.draw(); }
    resize() {
      const rect=this.canvas.getBoundingClientRect(), ratio=Math.min(devicePixelRatio||1,2);
      this.canvas.width=Math.max(1,Math.round(rect.width*ratio));
      this.canvas.height=Math.max(1,Math.round(rect.height*ratio));
      this.context.setTransform(ratio,0,0,ratio,0,0); this.draw();
    }
    // Every vertex is a recorded state. Interpolation only moves the display cursor.
draw() {
  const {canvas, context, points, center, extent, floorZ, yaw, pitch} = this;
  const activeCase = this.sample, currentTime = this.time;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  context.clearRect(0, 0, w, h);
  if (!activeCase || !points.length) return;
  const scale = Math.min(w, h) * .55;
  function project(point) {
    const [x, y, z] = point;
    const xr = x * Math.cos(yaw) - y * Math.sin(yaw);
    const depth = x * Math.sin(yaw) + y * Math.cos(yaw);
    const vertical = z * Math.cos(pitch) - depth * Math.sin(pitch);
    const rotatedDepth = z * Math.sin(pitch) + depth * Math.cos(pitch);
    const perspective = 3.6 / (3.6 + rotatedDepth);
    return [w * .5 + xr * scale * perspective, h * .52 - vertical * scale * perspective];
  }
  const norm = point => point.map((value, axis) => (value - center[axis]) / extent);
  const normalized = points.map(norm);
  function path(list, color, width = 1, dash = []) {
    if (!list.length) return;
    context.beginPath(); context.strokeStyle = color; context.lineWidth = width; context.setLineDash(dash); context.lineCap = 'round'; context.lineJoin = 'round';
    list.forEach((point, index) => { const p = project(point); if (index) context.lineTo(...p); else context.moveTo(...p); });
    context.stroke(); context.setLineDash([]);
  }
  // Perspective floor and subtle height guides convey space without inventing motion.
  const corners = [[-.78,-.78,floorZ],[.78,-.78,floorZ],[.78,.78,floorZ],[-.78,.78,floorZ]];
  context.beginPath(); corners.map(project).forEach((p,i) => i ? context.lineTo(...p) : context.moveTo(...p)); context.closePath(); context.fillStyle = '#dce4de2b'; context.fill();
  for (let i = -4; i <= 4; i++) {
    const v = i * .195;
    path([[v,-.78,floorZ],[v,.78,floorZ]], '#c3ccc55a', .7);
    path([[-.78,v,floorZ],[.78,v,floorZ]], '#c3ccc55a', .7);
  }
  path([...corners,corners[0]], '#bfc6bf77', .8);
  path(normalized.map(p => [p[0],p[1],floorZ]), '#82999433', 5);
  const origin = [-.78,-.78,floorZ];
  const axes = [{end:[-.3,-.78,floorZ],name:'x',color:'#bc8473'}, {end:[-.78,-.3,floorZ],name:'y',color:'#7d9c92'}, {end:[-.78,-.78,floorZ+.48],name:'z',color:'#809aa8'}];
  for (const axis of axes) {
    path([origin,axis.end], axis.color, 1.2);
    const p = project(axis.end); context.font = '11px monospace'; context.fillStyle = axis.color; context.fillText(axis.name,p[0]+5,p[1]+3);
  }
  path(normalized, '#c9a49960', 2.5, [3,5]);
  const sourceOffset = Math.min(currentTime * activeCase.displayFps * activeCase.actionStride, activeCase.frameOffsets.at(-1));
  let index = activeCase.trajectory.findIndex(point => point.offset > sourceOffset);
  if (index < 0) index = points.length - 1;
  const before = Math.max(0,index - 1), after = index;
  const t0 = activeCase.trajectory[before].offset, t1 = activeCase.trajectory[after].offset;
  const ratio = t1 === t0 ? 0 : Math.max(0,Math.min(1,(sourceOffset-t0)/(t1-t0)));
  const tip = normalized[before].map((v,axis) => v + (normalized[after][axis] - v) * ratio);
  path([...normalized.slice(0,before+1),tip], '#c87973', 3.5);
  path([[tip[0],tip[1],floorZ],tip], '#bba49180', 1, [3,4]);
  normalized.forEach((p,i) => {
    if (i % 4) return;
    const screen = project(p); context.beginPath();context.arc(...screen,1.8,0,Math.PI*2);context.fillStyle = i <= before ? '#b66566' : '#ccbab2';context.fill();
  });
  const start = project(normalized[0]); context.beginPath();context.arc(...start,4,0,Math.PI*2);context.fillStyle='#fffaf4';context.fill();context.strokeStyle='#bd9a8b';context.lineWidth=1.3;context.stroke();
  context.font='8px monospace';context.fillStyle='#ac9889';context.fillText('t₀',start[0]-14,start[1]+16);
  const p = project(tip);
  const glow = context.createRadialGradient(...p,0,...p,20);glow.addColorStop(0,'#ca6f6f32');glow.addColorStop(1,'#ca6f6f00');context.fillStyle=glow;context.beginPath();context.arc(...p,20,0,Math.PI*2);context.fill();
  context.beginPath();context.arc(...p,5.5,0,Math.PI*2);context.fillStyle='#c47771';context.fill();context.strokeStyle='#fff8ec';context.lineWidth=2;context.stroke();
}
  }
  function renderPage() {
    // Keep the gallery's footprint while canvases measure their new cards.
    root.style.minHeight = `${root.getBoundingClientRect().height}px`;
    cards.forEach(card => card.destroy()); cards=[]; root.replaceChildren();
    root.setAttribute('aria-busy','true');
    const start=page*3;
    cards=cases.slice(start,start+3).map((sample,index) => new PredictionCard(sample,start+index));
    root.style.minHeight = '';
    root.setAttribute('aria-busy','false');
    document.querySelector('#gallery-count').textContent=`${cases.length} examples`;
    [...pagination.children].forEach((button,index)=>{
      if(index===page)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    reflectPlayback();
  }
  playAll.addEventListener('click', () => {
    if(cards.some(card=>card.playing)) pauseAll();
    else cards.forEach(card=>card.play());
  });
  speed.addEventListener('change', () => cards.forEach(card=>card.updateProtocol()));
  document.addEventListener('real-video-play',pauseAll);
  document.addEventListener('dream-video-play',pauseAll);
  document.addEventListener('visibilitychange', () => {if(document.hidden)pauseAll();});
  new IntersectionObserver(entries => {if(!entries[0].isIntersecting)pauseAll();},{threshold:.02}).observe(root);
  fetch(mediaBase+'manifest.json').then(response=>{
    if(!response.ok)throw new Error('Missing manifest');
    return response.json();
  }).then(manifest=>{
    cases=manifest.cases;
    for(let index=0;index<Math.ceil(cases.length/3);index++){
      const button=document.createElement('button');button.type='button';
      button.textContent=String(index+1);button.setAttribute('aria-label',`Page ${index+1}: examples ${index*3+1} to ${Math.min(index*3+3,cases.length)}`);
      button.addEventListener('click',()=>{if(page!==index){page=index;renderPage();}});
      pagination.append(button);
    }
    renderPage();
  }).catch(()=>{
    root.textContent='The examples could not load. Open this page using the local preview server.';
    root.setAttribute('aria-busy','false'); playAll.disabled=true;
  });
})();
