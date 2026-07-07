/* =============================================
   CLC – Animation & Interactivity Engine
   ============================================= */

/* ─── Global mouse position (shared across all canvas effects) ─── */
let mouseX = 0, mouseY = 0;
document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

/* ─── 1. Loading Screen ─────────────────────── */
window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = document.getElementById('loading');
    if (loader) {
      loader.classList.add('hide');
      setTimeout(initHeroAnimations, 350);
    }
  }, 4000);
});

/* ─── 2. Custom Cursor (lerp) ───────────────── */
const cursorEl   = document.getElementById('cursor');
const cursorDot  = cursorEl?.querySelector('.cursor-dot');
const cursorRing = cursorEl?.querySelector('.cursor-ring');

let dotX = 0, dotY = 0, ringX = 0, ringY = 0;

if (cursorEl) {
  document.addEventListener('mousemove', () => cursorEl.style.opacity = '1');
  document.addEventListener('mouseleave', () => cursorEl.style.opacity = '0');

  const interactives = document.querySelectorAll(
    'a, button, input, textarea, .slider-contact-btn, .contact-btn, .service-wrapper, .card, .images .img, .about-team-photo, .project-card'
  );
  interactives.forEach(el => {
    el.addEventListener('mouseenter', () => cursorEl.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => cursorEl.classList.remove('cursor-hover'));
  });

  (function animateCursor() {
    dotX  += (mouseX - dotX)  * 0.85;
    dotY  += (mouseY - dotY)  * 0.85;
    ringX += (mouseX - ringX) * 0.11;
    ringY += (mouseY - ringY) * 0.11;
    cursorDot.style.transform  = `translate(calc(${dotX}px - 50%), calc(${dotY}px - 50%))`;
    cursorRing.style.transform = `translate(calc(${ringX}px - 50%), calc(${ringY}px - 50%))`;
    requestAnimationFrame(animateCursor);
  })();
}

/* ─── 3. Navbar Scroll State ─────────────────── */
const navbar = document.getElementById('navbar');
if (navbar) {
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ─── 4. Hero Entry Animations ──────────────── */
function initHeroAnimations() {
  document.querySelectorAll('.hero-reveal').forEach((el, i) => {
    el.style.animationDelay = `${i * 0.2}s`;
    el.classList.add('hero-animate');
  });
}

/* ─── 5. Rotating Word in Hero ──────────────── */
const rotatingWords = [
  { word: 'lideran',     color: '#46C458' },
  { word: 'dominan',     color: '#4D56CB' },
  { word: 'impactan',    color: '#FF9F24' },
  { word: 'inspiran',    color: '#FFD221' },
  { word: 'crecen',      color: '#6EA9ED' },
  { word: 'brillan',     color: '#FFD221' },
  { word: 'conquistan',  color: '#46C458' },
  { word: 'transforman', color: '#6EA9ED' },
];
let wordIndex = 0;
const rotatingEl = document.querySelector('.rotating-word');
if (rotatingEl) {
  // Apply initial color
  rotatingEl.style.color = rotatingWords[0].color;

  setInterval(() => {
    rotatingEl.classList.add('word-exit');
    rotatingEl.classList.remove('word-enter');
    setTimeout(() => {
      wordIndex = (wordIndex + 1) % rotatingWords.length;
      rotatingEl.textContent = rotatingWords[wordIndex].word;
      rotatingEl.style.color  = rotatingWords[wordIndex].color;
      rotatingEl.classList.remove('word-exit');
      rotatingEl.classList.add('word-enter');
    }, 290);
  }, 2600);
}

/* ─── 6. Scroll Reveal ───────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el    = entry.target;
    const delay = Number(el.dataset.revealDelay) || 0;
    setTimeout(() => el.classList.add('revealed'), delay);
    revealObserver.unobserve(el);
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));

/* ─── 7. Parallax on About Video ─────────────── */
const thinkingVideo   = document.querySelector('.thinking-video');
const thinkingSection = document.querySelector('.thinking-section');
if (thinkingVideo && thinkingSection) {
  window.addEventListener('scroll', () => {
    const rect = thinkingSection.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const progress = -rect.top / window.innerHeight;
    thinkingVideo.style.transform = `translateY(${progress * 45}px)`;
  }, { passive: true });
}

/* ─── 8. Marquee Pause on Hover ──────────────── */
['.inner-slider', '.clients', '.images'].forEach(sel => {
  const wrapper = document.querySelector(sel);
  if (!wrapper) return;
  const tracks = wrapper.querySelectorAll('.slider, .inner, .group');
  wrapper.addEventListener('mouseenter', () => tracks.forEach(t => t.style.animationPlayState = 'paused'));
  wrapper.addEventListener('mouseleave', () => tracks.forEach(t => t.style.animationPlayState = 'running'));
});

/* =============================================
   CANVAS EFFECTS
   ============================================= */

/* ─── Helper: get canvas-local mouse position ─ */
function getLocalMouse(canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: mouseX - rect.left, y: mouseY - rect.top };
}

/* ─── CANVAS 1: Particle Network (Hero) ─────── */
(function initParticleNetwork() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const COUNT   = 65;
  const CONNECT = 135;
  const REPEL   = 95;
  const SPEED   = 0.45;

  let w, h, particles;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    w = canvas.width  = rect.width;
    h = canvas.height = rect.height;
    // Respawn after resize
    particles = Array.from({ length: COUNT }, () => ({
      x:  Math.random() * w,
      y:  Math.random() * h,
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
      r:  2.5 + Math.random() * 2.5,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const m = getLocalMouse(canvas);

    particles.forEach(p => {
      // Mouse repulsion
      const dx   = p.x - m.x;
      const dy   = p.y - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist < REPEL && dist > 0) {
        const f = (REPEL - dist) / REPEL;
        p.vx += (dx / dist) * f * 0.6;
        p.vy += (dy / dist) * f * 0.6;
      }

      // Speed cap + damping
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > SPEED * 3.5) { p.vx = (p.vx / speed) * SPEED * 3.5; p.vy = (p.vy / speed) * SPEED * 3.5; }
      p.vx *= 0.985; p.vy *= 0.985;

      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(77,86,203,0.85)';
      ctx.fill();
    });

    // Connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const d = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
        if (d < CONNECT) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(77,86,203,${(1 - d / CONNECT) * 0.55})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', resize);
})();

/* Contact form completeness guard */
(function initContactFormValidation() {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  const fields = Array.from(form.querySelectorAll('input, textarea'));
  const submitButton = form.querySelector('.contact-submit');
  if (!submitButton || fields.length === 0) return;

  const isFormComplete = () => fields.every((field) => field.value.trim().length > 0);

  function updateSubmitState() {
    const complete = isFormComplete();
    submitButton.disabled = !complete;
    submitButton.setAttribute('aria-disabled', String(!complete));
  }

  fields.forEach((field) => {
    field.addEventListener('input', updateSubmitState);
    field.addEventListener('change', updateSubmitState);
  });

  form.addEventListener('submit', (event) => {
    updateSubmitState();

    if (isFormComplete()) return;

    event.preventDefault();
    const firstEmptyField = fields.find((field) => field.value.trim().length === 0);
    firstEmptyField?.focus();
  });

  window.addEventListener('pageshow', updateSubmitState);
  setTimeout(updateSubmitState, 100);
  updateSubmitState();
})();

/* Project detail content */
(function initProjectDetailPage() {
  const titleEl = document.getElementById('project-detail-title');
  const typeEl = document.getElementById('project-detail-type');
  const imageEl = document.getElementById('project-detail-image');
  const galleryEl = document.getElementById('project-detail-gallery');
  if (!titleEl || !typeEl || !imageEl || !galleryEl) return;

  const projects = {
    'oceanside-el-salvador': {
      client: 'Oceanside El Salvador',
      type: 'Diseño Web & Redes Sociales',
      image: 'recursos/Proyectos/proyecto_01.png'
    },
    'carmen-galindo-atelier': {
      client: 'Carmen Galindo Atelier',
      type: 'Branding',
      image: 'recursos/Proyectos/proyecto_02.png'
    },
    'surf-city': {
      client: 'Surf City',
      type: 'Redes Sociales',
      image: 'recursos/Proyectos/proyecto_03.png'
    },
    'grupo-proint': {
      client: 'Grupo Proint',
      type: 'Branding',
      image: 'recursos/Proyectos/proyecto_04.png'
    },
    'del-horno': {
      client: 'Del Horno',
      type: 'Branding',
      image: 'recursos/Proyectos/proyecto_05.png'
    },
    'bibimbap': {
      client: 'Bibimbap',
      type: 'Branding',
      image: 'recursos/Proyectos/proyecto_06.png',
      gallery: [
        'recursos/Proyectos/Bibimbap/01.jpg',
        'recursos/Proyectos/Bibimbap/02.jpg',
        'recursos/Proyectos/Bibimbap/03.jpg',
        'recursos/Proyectos/Bibimbap/04.jpg',
        'recursos/Proyectos/Bibimbap/05.jpg',
        'recursos/Proyectos/Bibimbap/06.jpg',
        'recursos/Proyectos/Bibimbap/07.jpg',
        'recursos/Proyectos/Bibimbap/08.jpg',
        'recursos/Proyectos/Bibimbap/09.jpg',
        'recursos/Proyectos/Bibimbap/10.jpg'
      ]
    },
    'calambre': {
      client: 'Calambre',
      type: 'Branding',
      image: 'recursos/Proyectos/proyecto_07.png'
    },
    'daruma-iced-tea': {
      client: 'Daruma Iced Tea',
      type: 'Branding',
      image: 'recursos/Proyectos/proyecto_08.png'
    },
    'sapphire-martini': {
      client: 'Sapphire Martini',
      type: 'Branding',
      image: 'recursos/Proyectos/proyecto_09.png'
    }
  };

  const slug = new URLSearchParams(window.location.search).get('proyecto') || 'oceanside-el-salvador';
  const project = projects[slug] || projects['oceanside-el-salvador'];

  titleEl.textContent = project.client;
  typeEl.textContent = project.type;

  if (project.gallery) {
    document.querySelector('.project-detail-page')?.classList.add('gallery-mode');
    galleryEl.replaceChildren(...project.gallery.map((src, index) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `${project.client} - ${project.type} ${String(index + 1).padStart(2, '0')}`;
      img.loading = index === 0 ? 'eager' : 'lazy';
      return img;
    }));
  } else {
    imageEl.src = project.image;
    imageEl.alt = `${project.client} - ${project.type}`;
  }

  document.title = `${project.client} | CleanLineColor Studio`;
})();

/* ─── CANVAS 2: Organic Blob (About) ────────── */
(function initOrganicBlob() {
  const canvas = document.getElementById('about-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w, h, t = 0;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    w = canvas.width  = rect.width;
    h = canvas.height = rect.height;
  }

  /* Draw one animated blob at (cx,cy) with baseRadius r */
  function blob(cx, cy, r, speed, colorA, colorB) {
    const pts = 10;
    const step = (Math.PI * 2) / pts;

    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = i * step;
      // Stack sines at different frequencies for organic wobble
      const noise =
        Math.sin(t * speed        + a * 2) * 0.22 +
        Math.sin(t * speed * 1.6  + a * 3) * 0.14 +
        Math.sin(t * speed * 2.7  + a * 5) * 0.08;
      const radius = r * (1 + noise);
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const pa = (i - 1) * step;
        const pn =
          Math.sin(t * speed        + pa * 2) * 0.22 +
          Math.sin(t * speed * 1.6  + pa * 3) * 0.14 +
          Math.sin(t * speed * 2.7  + pa * 5) * 0.08;
        const pr = r * (1 + pn);
        const px = cx + Math.cos(pa) * pr;
        const py = cy + Math.sin(pa) * pr;
        ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
      }
    }
    ctx.closePath();

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.4);
    g.addColorStop(0, colorA);
    g.addColorStop(1, colorB);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    t += 0.006;

    const s = Math.min(w, h);
    // Green blob – top right
    blob(w * 0.80, h * 0.17, s * 0.28, 0.75, 'rgba(70,196,88,0.13)', 'rgba(70,196,88,0)');
    // Blue blob – bottom left
    blob(w * 0.14, h * 0.78, s * 0.21, 1.05, 'rgba(77,86,203,0.11)', 'rgba(77,86,203,0)');
    // Orange blob – center right
    blob(w * 0.70, h * 0.62, s * 0.15, 1.40, 'rgba(255,159,36,0.10)', 'rgba(255,159,36,0)');

    requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', resize);
})();
