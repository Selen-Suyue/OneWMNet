'use strict';
(() => {
  // The original figure's exact connectivity, in Vc,V1,V2,A1,A2 order.
  // 0: masked; 1: other allowed attention; 2: video-query × action-key.
  const mask = [[1,0,0,0,0],[1,1,0,2,0],[1,1,1,2,2],[1,0,0,1,0],[1,0,0,1,1]];
  const labels = ['V꜀','V₁','V₂','A₁','A₂'];
  const regimes = {
    clean:{count:4,ratio:'All-clean actions',title:'Learn what an action will do.',description:'All action chunks are clean conditions. The video expert learns their visual consequences.',input:'all clean',output:'specified conditions'},
    partial:{count:2,ratio:'Clean prefix + noisy suffix',title:'Know the beginning. Learn the rest.',description:'A clean prefix conditions future-video prediction and denoising of the remaining action suffix.',input:'clean + noisy',output:'condition + target'},
    noisy:{count:0,ratio:'All-noisy actions',title:'Learn which action comes next.',description:'All action chunks are noisy targets. Both experts learn to denoise under temporal causality.',input:'all noisy',output:'denoised targets'}
  };
  let current='partial', automatic=true, timer=0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused=motion.matches;
  document.querySelectorAll('.attention-matrix').forEach(matrix=>{
    matrix.append(document.createElement('span'));
    labels.forEach((label,index)=>{
      const axis=document.createElement('span');axis.className='matrix-axis'+(index>=3?' action-axis':'');axis.textContent=label;matrix.append(axis);
    });
    mask.forEach((row,r)=>{
      const axis=document.createElement('span');axis.className='matrix-axis'+(r>=3?' action-axis':'');axis.textContent=labels[r];matrix.append(axis);
      row.forEach((value,c)=>{
        const cell=document.createElement('span');cell.className='matrix-cell';
        cell.dataset.row=r;cell.dataset.column=c;cell.dataset.access=value;
        if(value===1)cell.classList.add('allowed');
        if(value===2)cell.classList.add('action-access');
        if(value>0 && !(value===2 && matrix.dataset.attention==='masked')){cell.classList.add('scan');cell.style.setProperty('--delay',`${r*.3}s`);}
        matrix.append(cell);
      });
    });
  });
  function setRegime(name) {
    current=name;const data=regimes[name];
    document.querySelectorAll('[data-conditioning]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.conditioning===name)));
    document.querySelectorAll('.attention-matrix').forEach(matrix=>{
      const kind=matrix.dataset.attention;
      matrix.querySelectorAll('[data-access="2"]').forEach(cell=>{
        const mode=kind==='unified'?(name==='clean'||(name==='partial'&&Number(cell.dataset.column)===3)?'clean':'noisy'):kind;
        cell.classList.remove('clean','noisy','masked');cell.classList.add(mode);
      });
    });
    document.querySelector('#known-action-ratio').textContent=data.ratio;
    document.querySelector('#regime-title').textContent=data.title;
    document.querySelector('#regime-description').textContent=data.description;
    document.querySelector('#pipeline-action-label').textContent=data.input;
    document.querySelector('#pipeline-output-label').textContent=data.output;
    document.querySelector('.pipeline-figure').dataset.mode=name;
    document.querySelectorAll('.construction-tokens>span').forEach((token,index)=>token.classList.toggle('noisy',index>=data.count));
  }
  function updateMotion() {
    clearInterval(timer);
    document.body.classList.toggle('diagrams-paused',paused);
    document.querySelectorAll('.motion-control').forEach(button=>{
      button.textContent=paused?'▶ Animate':'Ⅱ Pause';
      button.setAttribute('aria-pressed',String(paused));
    });
    if(!paused&&automatic&&!document.hidden)timer=setInterval(()=>{
      const sequence=['clean','partial','noisy'];setRegime(sequence[(sequence.indexOf(current)+1)%3]);
    },5200);
  }
  document.querySelectorAll('[data-conditioning]').forEach(button=>button.addEventListener('click',()=>{
    automatic=false;setRegime(button.dataset.conditioning);updateMotion();
  }));
  document.querySelectorAll('.motion-control').forEach(button=>button.addEventListener('click',()=>{
    paused=!paused;if(!paused)automatic=true;updateMotion();
  }));
  motion.addEventListener('change',()=>{paused=motion.matches;updateMotion();});
  document.addEventListener('visibilitychange',updateMotion);
  setRegime('partial');updateMotion();
})();
