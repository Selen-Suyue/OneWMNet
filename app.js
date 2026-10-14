'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Empty resource links are placeholders until the project is ready for release.
$$('.resource-link[href=""]').forEach(link => {
  link.addEventListener('click', event => event.preventDefault());
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
