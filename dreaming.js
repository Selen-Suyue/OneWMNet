'use strict';
(() => {
  const section = document.querySelector('#dreaming');
  if (!section) return;
  const base = 'assets/dreaming/';
  const video = section.querySelector('video');
  const play = section.querySelector('.dream-play');
  const speed = section.querySelector('.dream-speed');
  const timeline = section.querySelector('.dream-timeline');
  const tasks = section.querySelector('.dream-cases');
  const error = section.querySelector('.dream-error');
  const track = section.querySelector('.dream-round-track');
  const cycleSteps = [...section.querySelectorAll('.dream-cycle li')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const effects = section.querySelector('.dream-effects-control');
  const cache = new Map();
  // Presentation timing only. These pauses do not represent inference latency.
  const REVEAL_MS = 1500, ACTION_MS = 1700, FEEDBACK_MS = 350;
  let sample = null, actions = null, version = 0, animation = 0;
  let round = 0, phase = 'actions', elapsed = 0, running = false, lastTick = 0;
  let loadController = null;
  const clipMs = () => sample.futureFramesPerRound / sample.fps * 1000;
  const cycleMs = () => ACTION_MS + clipMs() + FEEDBACK_MS;
  const boundaryTime = index => index * sample.futureFramesPerRound / sample.fps;

  class ActionPath {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.yaw = -.8; this.pitch = .6; this.dragging = null;
      this.points = []; this.progress = 0; this.mode = 'actions';
      canvas.addEventListener('pointerdown', event => {
        this.dragging = {x:event.clientX,y:event.clientY}; canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove', event => {
        if (!this.dragging) return;
        this.yaw += (event.clientX-this.dragging.x)*.009;
        this.pitch = Math.max(.1,Math.min(1.35,this.pitch+(event.clientY-this.dragging.y)*.007));
        this.dragging = {x:event.clientX,y:event.clientY}; this.draw();
      });
      ['pointerup','pointercancel','lostpointercapture'].forEach(name => canvas.addEventListener(name, () => {this.dragging=null;}));
      canvas.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','r','R'].includes(event.key)) return;
        event.preventDefault();
        if (event.key.toLowerCase() === 'r') return this.reset();
        this.yaw += event.key==='ArrowRight' ? .12 : event.key==='ArrowLeft' ? -.12 : 0;
        this.pitch = Math.max(.1,Math.min(1.35,this.pitch+(event.key==='ArrowDown' ? .08 : event.key==='ArrowUp' ? -.08 : 0)));
        this.draw();
      });
      this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
      this.resize();
    }
    reset() { this.yaw=-.8; this.pitch=.6; this.draw(); }
    setActions(chunk) {
      // Visualize the saved relative translation controls, not absolute EEF poses.
      const path = [[0,0,0]];
      for (const action of chunk) path.push(path.at(-1).map((v,axis) => v+action[axis]));
      const min = [0,1,2].map(axis => Math.min(...path.map(p => p[axis])));
      const max = [0,1,2].map(axis => Math.max(...path.map(p => p[axis])));
      const center = min.map((v,axis) => (v+max[axis])/2);
      const extent = Math.max(...max.map((v,axis) => v-min[axis]),.5);
      this.points = path.map(p => p.map((v,axis) => (v-center[axis])/extent));
      this.floor = (min[2]-center[2])/extent-.12;
      this.progress = 0; this.draw();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio||1,2);
      this.canvas.width = Math.max(1,Math.round(r.width*dpr));
      this.canvas.height = Math.max(1,Math.round(r.height*dpr));
      this.ctx.setTransform(dpr,0,0,dpr,0,0); this.draw();
    }
    update(progress, mode) { this.progress = progress; this.mode = mode; this.draw(); }
    draw() {
      const {ctx,canvas,points,yaw,pitch,progress,mode} = this;
      const w=canvas.clientWidth,h=canvas.clientHeight;
      ctx.clearRect(0,0,w,h);
      if (!points.length || !w || !h) return;
      const floor=this.floor, scale=Math.min(w*.42,h*.58);
      const project = ([x,y,z]) => {
        const xr=x*Math.cos(yaw)-y*Math.sin(yaw), depth=x*Math.sin(yaw)+y*Math.cos(yaw);
        const vertical=z*Math.cos(pitch)-depth*Math.sin(pitch);
        const perspective=3.6/(3.6+z*Math.sin(pitch)+depth*Math.cos(pitch));
        return [w*.5+xr*scale*perspective,h*.53-vertical*scale*perspective];
      };
      const path = (vertices,color,width=1,dash=[]) => {
        if (!vertices.length) return;
        ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.lineCap='round';ctx.lineJoin='round';
        vertices.forEach((p,i) => {const q=project(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.stroke();ctx.setLineDash([]);
      };
      const corners=[[-.72,-.72,floor],[.72,-.72,floor],[.72,.72,floor],[-.72,.72,floor]];
      ctx.beginPath();corners.forEach((p,i) => {const q=project(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.closePath();ctx.fillStyle='#dce4ed35';ctx.fill();
      for(let i=-4;i<=4;i++) {
        const v=i*.18;
        path([[v,-.72,floor],[v,.72,floor]],'#c7cdd966',.7);
        path([[-.72,v,floor],[.72,v,floor]],'#c7cdd966',.7);
      }
      path([...corners,corners[0]],'#c4c7d482',.8);
      const origin=[-.72,-.72,floor];
      [{end:[-.3,-.72,floor],label:'x',color:'#c191a2'},{end:[-.72,-.3,floor],label:'y',color:'#9da9bc'},{end:[-.72,-.72,floor+.42],label:'z',color:'#8caec7'}].forEach(axis => {
        path([origin,axis.end],axis.color,1.2);const p=project(axis.end);ctx.font='12px monospace';ctx.fillStyle=axis.color;ctx.fillText(axis.label,p[0]+4,p[1]+3);
      });
      const index=Math.min(Math.floor(progress),points.length-1), after=Math.min(index+1,points.length-1);
      const tip=points[index].map((v,axis) => v+(points[after][axis]-v)*(progress-index));
      const revealed=[...points.slice(0,index+1),tip];
      path(points,'#c4b4d66e',2,[3,5]);
      path((mode==='actions'?revealed:points).map(p => [p[0],p[1],floor]),'#a6abc52b',4.5);
      if(mode!=='actions') path(points,'#c4b2d6',2.5);
      path(revealed,mode==='imagination'?'#8eacc9':'#ac91c3',3);
      path([[tip[0],tip[1],floor],tip],'#acabc282',1,[3,4]);
      points.forEach((p,i) => {
        if(i%4 || (mode==='actions' && i>index)) return;
        const q=project(p);ctx.beginPath();ctx.arc(...q,2,0,Math.PI*2);ctx.fillStyle=i<=index?'#a28bb8':'#c3b4d1';ctx.fill();
      });
      const start=project(points[0]);ctx.beginPath();ctx.arc(...start,3.5,0,Math.PI*2);ctx.fillStyle='#fffdf9';ctx.fill();ctx.strokeStyle='#b5a3c5';ctx.lineWidth=1.3;ctx.stroke();
      const p=project(tip), glow=ctx.createRadialGradient(...p,0,...p,19);
      glow.addColorStop(0,'#b298d155');glow.addColorStop(1,'#b298d100');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(...p,19,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(...p,5.5,0,Math.PI*2);ctx.fillStyle=mode==='imagination'?'#90acc7':'#aa8cc2';ctx.fill();ctx.strokeStyle='#fffaff';ctx.lineWidth=2;ctx.stroke();
    }
  }
  const view = new ActionPath(section.querySelector('canvas'));
  section.querySelector('.dream-reset').addEventListener('click', () => view.reset());
  const setEffects = paused => {
    section.classList.toggle('effects-paused',paused);
    effects.setAttribute('aria-pressed',String(paused));
    effects.textContent = paused ? '✦ Animate effects' : 'Ⅱ Pause effects';
  };
  setEffects(motion.matches);
  effects.addEventListener('click', () => setEffects(!section.classList.contains('effects-paused')));
  motion.addEventListener('change', () => setEffects(motion.matches));

  function render() {
    play.textContent = running ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label',running ? 'Pause imagined rollout' : phase==='complete' ? 'Replay imagined rollout' : 'Play imagined rollout');
    section.classList.toggle('dream-playing',running);
    section.dataset.phase=phase; section.dataset.round=String(round+1);
    if (!sample || !actions) return;
    const count=sample.actionsPerRound, start=boundaryTime(round), end=boundaryTime(round+1);
    const time=phase==='actions' ? start : phase==='imagination' ? Math.max(start,Math.min(end,video.currentTime)) : end;
    const cursor=phase==='actions' ? Math.min(1,elapsed/REVEAL_MS)*count : phase==='imagination' ? (time-start)/(end-start)*count : count;
    const shown=phase==='actions' ? Math.min(count,Math.ceil(cursor)) : count;
    view.update(cursor,phase);
    const offset=phase==='actions' ? elapsed : phase==='imagination' ? ACTION_MS+(time-start)*1000 : ACTION_MS+clipMs()+elapsed;
    timeline.value=String(phase==='complete' ? 1000 : (round*cycleMs()+offset)/(sample.roundCount*cycleMs())*1000);
    const description={actions:'Predict the next actions',imagination:'Imagine their effect',feedback:'Use the last imagined frame',complete:'Rollout complete'}[phase];
    timeline.setAttribute('aria-valuetext',`Round ${round+1} of ${sample.roundCount}. ${description}.`);
    section.querySelector('.dream-time').textContent=`${time.toFixed(1)} / ${sample.sourceHorizonSeconds.toFixed(1)} s`;
    section.querySelector('.dream-loop-count').textContent=`Round ${String(round+1).padStart(2,'0')} / ${sample.roundCount}`;
    section.querySelector('.dream-action-count').textContent=`${String(shown).padStart(2,'0')} / ${count}`;
    section.querySelector('.dream-state').textContent=phase==='actions' ? (round===0 ? 'Initial observation · held' : 'Previous prediction · held') : phase==='imagination' ? 'Imagining the next 8 frames' : phase==='feedback' ? 'Feed this view back to OneWM' : '16 rounds imagined';
    cycleSteps.forEach(step => {if(step.dataset.phase===phase) step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
    [...track.children].forEach((step,i) => {step.classList.toggle('visited',i<round || phase==='complete');step.classList.toggle('current',i===round && phase!=='complete');});
    const action=cursor>0 ? actions[round][Math.min(count-1,Math.ceil(cursor)-1)] : null;
    ['.dream-dx','.dream-dy','.dream-dz','.dream-grip'].forEach((selector,i) => {
      const value=action?.[i===3?6:i];
      section.querySelector(selector).textContent=value===undefined?'—':(Math.abs(value)<.005?0:value).toFixed(2);
    });
  }
  function hold(time) {
    video.pause();
    const target=time===0 ? 0 : time+.001; // Seek into the exact boundary frame, never the preceding one.
    if(Math.abs(video.currentTime-target)>.0005) video.currentTime=target;
  }
  function pause() {
    running=false; video.pause();cancelAnimationFrame(animation);animation=0;lastTick=0;render();
  }
  function fail(message) {
    pause();play.disabled=true;timeline.disabled=true;section.setAttribute('aria-busy','false');
    error.hidden=false;error.textContent=message;
  }
  function playVideo() {
    const current=version;
    video.muted=true;video.defaultPlaybackRate=video.playbackRate=Number(speed.value);
    video.play().then(() => {if(current===version && (!running || phase!=='imagination')) video.pause();}).catch(e => {
      if(current===version && running && phase==='imagination' && e.name!=='AbortError') fail('This video could not play. Please reload the local preview.');
    });
  }
  function beginRound(index) {
    round=index;phase='actions';elapsed=0;view.setActions(actions[round]);hold(boundaryTime(round));
  }
  function tick(now) {
    animation=0;
    if(!running) return;
    const delta=lastTick?Math.min(now-lastTick,100):0;lastTick=now;
    if(phase==='actions' && !video.seeking) {
      elapsed+=delta*Number(speed.value);
      if(elapsed>=ACTION_MS) {elapsed=0;phase='imagination';playVideo();}
    } else if(phase==='imagination' && video.currentTime>=boundaryTime(round+1)) {
      hold(boundaryTime(round+1));phase='feedback';elapsed=0;
    } else if(phase==='feedback' && !video.seeking) {
      elapsed+=delta*Number(speed.value);
      if(elapsed>=FEEDBACK_MS) {
        if(round+1<sample.roundCount) beginRound(round+1);
        else {phase='complete';running=false;}
      }
    }
    render();
    if(running) animation=requestAnimationFrame(tick);
  }
  function start() {
    if(play.disabled || !actions) return;
    if(phase==='complete') beginRound(0);
    document.querySelectorAll('.real-card video').forEach(v => v.pause());
    document.dispatchEvent(new Event('dream-video-play'));
    running=true;lastTick=0;render();
    if(phase==='imagination') playVideo();
    cancelAnimationFrame(animation);animation=requestAnimationFrame(tick);
  }
  play.addEventListener('click', () => running ? pause() : start());
  speed.addEventListener('change', () => {video.defaultPlaybackRate=video.playbackRate=Number(speed.value);});
  timeline.addEventListener('input', () => {
    if(!sample || !actions) return;
    const position=Number(timeline.value)/1000;
    pause();
    const total=position*sample.roundCount*cycleMs();
    round=Math.min(sample.roundCount-1,Math.floor(total/cycleMs()));
    const local=total-round*cycleMs();
    view.setActions(actions[round]);
    if(position>=1) {phase='complete';elapsed=FEEDBACK_MS;hold(boundaryTime(sample.roundCount));}
    else if(local<ACTION_MS) {phase='actions';elapsed=local;hold(boundaryTime(round));}
    else if(local<ACTION_MS+clipMs()) {phase='imagination';elapsed=0;hold(boundaryTime(round)+(local-ACTION_MS)/1000);}
    else {phase='feedback';elapsed=local-ACTION_MS-clipMs();hold(boundaryTime(round+1));}
    render();
  });
  video.addEventListener('timeupdate', () => {if(!running) render();});
  video.addEventListener('seeked', () => render());
  video.addEventListener('ended', () => {
    if(running && phase==='imagination') {hold(boundaryTime(round+1));phase='feedback';elapsed=0;render();}
  });
  video.addEventListener('error', () => fail('This example could not load. Please reload the local preview.'));
  document.addEventListener('real-video-play',pause);
  document.addEventListener('prediction-video-play',pause);
  document.addEventListener('visibilitychange', () => {if(document.hidden) pause();});
  new IntersectionObserver(entries => {if(!entries[0].isIntersecting) pause();},{threshold:.02}).observe(section);

  async function select(next) {
    pause();const current=++version;sample=next;actions=null;round=0;phase='actions';elapsed=0;view.setActions([]);
    loadController?.abort();loadController=new AbortController();
    const {signal}=loadController;
    play.disabled=true;timeline.disabled=true;error.hidden=true;timeline.value='0';
    section.setAttribute('aria-busy','true');section.dataset.case=next.id;
    section.querySelector('.dream-task-title').textContent=next.title;
    section.querySelector('.dream-instruction').textContent=next.instruction;
    section.querySelector('.dream-facts').textContent=`${next.roundCount} rounds · ${next.actionCount} predicted actions · ${next.sourceHorizonSeconds.toFixed(1)} s in imagination`;
    [...tasks.children].forEach(button => button.setAttribute('aria-pressed',String(button.dataset.case===next.id)));
    track.replaceChildren(...Array.from({length:next.roundCount}, () => document.createElement('span')));
    const ready=() => {
      if(current!==version || !actions || video.readyState<2) return;
      play.disabled=false;timeline.disabled=false;section.setAttribute('aria-busy','false');render();
    };
    video.addEventListener('loadeddata',ready,{signal});
    video.poster=base+next.poster;video.src=base+next.video;video.muted=true;
    video.defaultPlaybackRate=video.playbackRate=Number(speed.value);video.load();render();
    try {
      let data=cache.get(next.id);
      if(!data) {
        const response=await fetch(base+next.actions,{signal});
        if(!response.ok) throw new Error('Missing predicted actions');
        data=await response.json();
        if(data.case!==next.id || data.actionsRaw.length!==next.roundCount || data.actionsRaw.some(chunk => chunk.length!==next.actionsPerRound || chunk.some(a => a.length!==7 || a.some(v => !Number.isFinite(v))))) throw new Error('Invalid predicted actions');
        cache.set(next.id,data);
      }
      if(current!==version) return;
      actions=data.actionsRaw;view.setActions(actions[0]);ready();
    } catch(e) {if(current===version && e.name!=='AbortError') fail('The saved actions could not load. Please reload the local preview.');}
  }
  fetch(base+'manifest.json').then(response => {
    if(!response.ok) throw new Error('Missing imagined-rollout manifest');
    return response.json();
  }).then(manifest => {
    manifest.cases.forEach(item => {
      const button=document.createElement('button');
      button.type='button';button.className='dream-case';button.dataset.case=item.id;
      button.setAttribute('aria-label',`Show ${item.title}`);
      const img=document.createElement('img');
      img.src=base+item.thumbnail;img.alt='';img.loading='lazy';img.width=224;img.height=112;
      const label=document.createElement('span');label.textContent=item.shortTitle||item.title;
      button.append(img,label);button.addEventListener('click', () => {if(sample?.id!==item.id) select(item);});
      tasks.append(button);
    });
    select(manifest.cases.find(item => item.id===manifest.defaultCase)||manifest.cases[0]);
  }).catch(() => fail('The imagined examples could not load. Open this page using the local preview server.'));
})();
