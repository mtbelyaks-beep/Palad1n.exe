'use strict';
// Анимации интерфейса. Три уровня из настроек: «Полные» (всё), «Спокойные» (только появление и наведение), «Выключены» (ничего).
// Всё остановится само, если включён режим для слабого компьютера или окно свёрнуто.
(function () {
  const LF = window.LF;
  const level = () => (document.body.classList.contains('lite') ? 'off' : document.body.dataset.motion || 'full');
  LF.motionLevel = level;

  const SEL = '.panel, .sgroup, .col, .gcard, .filters, .qcard, .offerprev, .bigprev, .tcard, .ibox, .themes, .empty, .counter';

  /** Элементы вида появляются волной, одно за другим. Класс снимается после показа, чтобы не мешать наведению. */
  LF.stagger = (root) => {
    if (level() === 'off' || !root) return;
    const items = [...root.querySelectorAll(SEL)].filter((el) => !el.closest('.rv-in')).slice(0, 28);
    items.forEach((el, i) => {
      el.style.setProperty('--i', String(i));
      el.classList.add('rv-in');
      el.addEventListener('animationend', () => { el.classList.remove('rv-in'); el.style.removeProperty('--i'); }, { once: true });
    });
  };

  // Мягкий свет под курсором на стеклянных панелях и лёгкий параллакс фона.
  let raf = 0; let ev = null;
  document.addEventListener('pointermove', (e) => {
    if (level() !== 'full' || document.body.classList.contains('paused')) return;
    ev = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const e2 = ev; if (!e2) return;
      const g = e2.target && e2.target.closest ? e2.target.closest('.glass') : null;
      if (g) {
        const r = g.getBoundingClientRect();
        g.style.setProperty('--mx', (e2.clientX - r.left) + 'px');
        g.style.setProperty('--my', (e2.clientY - r.top) + 'px');
      }
      const bg = document.getElementById('bg');
      if (bg) {
        bg.style.setProperty('--px', ((e2.clientX / window.innerWidth - 0.5) * -36).toFixed(1));
        bg.style.setProperty('--py', ((e2.clientY / window.innerHeight - 0.5) * -26).toFixed(1));
      }
    });
  }, { passive: true });
})();
