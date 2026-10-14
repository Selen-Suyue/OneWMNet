'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Empty resource links are placeholders until the project is ready for release.
$$('.resource-link[href=""]').forEach(link => {
  link.addEventListener('click', event => event.preventDefault());
});

// Background music starts only from the listener's explicit click.
const music = $('#page-music');
const musicToggle = $('#music-toggle');
const musicStatus = $('#music-status');
let musicWanted = false;
let musicRequest = 0;
let musicFade = 0;
music.volume = 0;

const updateMusicToggle = () => {
  musicToggle.setAttribute('aria-pressed', String(musicWanted));
  musicToggle.setAttribute('aria-label', musicWanted ? 'Pause background music' : 'Play background music');
  $('.music-label').textContent = musicWanted ? 'Pause music' : 'Play music';
};

const fadeMusic = (target, onComplete = () => {}) => {
  clearInterval(musicFade);
  const initial = music.volume;
  const start = performance.now();
  const step = () => {
    const progress = Math.min((performance.now() - start) / 450, 1);
    music.volume = initial + (target - initial) * progress;
    if (progress === 1) {
      clearInterval(musicFade);
      onComplete();
    }
  };
  musicFade = setInterval(step, 20);
};

musicToggle.addEventListener('click', async () => {
  musicWanted = !musicWanted;
  const request = ++musicRequest;
  clearInterval(musicFade);
  musicStatus.textContent = '';
  updateMusicToggle();
  if (!musicWanted) {
    musicToggle.classList.remove('is-playing');
    fadeMusic(0, () => { if (!musicWanted) music.pause(); });
    return;
  }
  try {
    await music.play();
    if (request !== musicRequest || !musicWanted) return;
    musicToggle.classList.add('is-playing');
    fadeMusic(0.35);
  } catch {
    if (request !== musicRequest) return;
    musicWanted = false;
    musicToggle.classList.remove('is-playing');
    updateMusicToggle();
    musicStatus.textContent = 'Music could not start. Please try again.';
  }
});

music.addEventListener('pause', () => {
  musicWanted = false;
  ++musicRequest;
  clearInterval(musicFade);
  music.volume = 0;
  musicToggle.classList.remove('is-playing');
  updateMusicToggle();
});

// The article's progress and chapter navigation are independent of media playback.
const updateProgress = () => {
  const length = document.documentElement.scrollHeight - innerHeight;
  $('#page-progress').style.transform = `scaleX(${length > 0 ? scrollY / length : 0})`;
};
addEventListener('scroll', updateProgress, {passive: true});
addEventListener('resize', updateProgress);
updateProgress();
const chapterObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    $$('.site-header nav a').forEach(link => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
  }
}, {rootMargin: '-15% 0px -65% 0px'});
$$('main section[id]').forEach(section => chapterObserver.observe(section));

// The deliverable videos contain no audio streams; also mute each player in the UI.
$$('.real-card video').forEach(video => {
  video.muted = true;
  video.addEventListener('play', () => {
    $$('.real-card video').forEach(other => { if (other !== video) other.pause(); });
    document.dispatchEvent(new Event('real-video-play'));
  });
});
