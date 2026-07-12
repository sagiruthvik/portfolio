import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource/instrument-serif'
import '@fontsource/instrument-serif/400-italic.css'
import './style.css'
import * as THREE from 'three'
import Lenis from 'lenis'

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches

/* ==========================================================
   Preloader — counts up while fonts + hero warm up
   ========================================================== */
const loaderDone = (() => {
  const loader = document.getElementById('loader')
  if (reduced) {
    loader.remove()
    return Promise.resolve()
  }
  const count = document.getElementById('loaderCount')
  const bar = document.getElementById('loaderBar')
  let ready = false
  let finished = false
  let resolveDone
  const done = new Promise((r) => (resolveDone = r))
  const t0 = performance.now()

  Promise.all([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, 750)),
  ]).then(() => (ready = true))

  // time-based so background-tab timer throttling can't strand the overlay
  function step() {
    if (finished) return
    const elapsed = performance.now() - t0
    let value = Math.min((elapsed / 900) * 92, 92)
    if (ready) value = Math.min((elapsed / 450) * 100, 100)
    count.textContent = String(Math.floor(value)).padStart(2, '0')
    bar.style.width = value + '%'
    if (value >= 100) {
      finished = true
      clearInterval(timer)
      loader.classList.add('is-done')
      setTimeout(resolveDone, 350)
    }
  }
  const timer = setInterval(step, 40)
  document.addEventListener('visibilitychange', step)

  return done
})()

/* ==========================================================
   Smooth scrolling (Lenis) + progress hairline
   ========================================================== */
let lenis = null
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1.05 })
  window.lenis = lenis
  function raf(time) {
    lenis.raf(time)
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)
}

const progressBar = document.getElementById('progressBar')
function updateProgress() {
  const max = document.documentElement.scrollHeight - innerHeight
  progressBar.style.transform = `scaleX(${max > 0 ? Math.min(scrollY / max, 1) : 0})`
}
addEventListener('scroll', updateProgress, { passive: true })

// anchor navigation through lenis
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'))
    if (!target) return
    e.preventDefault()
    document.body.classList.remove('menu-open')
    if (lenis) lenis.scrollTo(target, { offset: -12, duration: 1.4 })
    else target.scrollIntoView({ behavior: 'smooth' })
  })
})

/* ==========================================================
   HERO — ~10k particles assemble into "RUTHVIK", ripple away
   from the cursor, and periodically swirl into a galaxy.
   ========================================================== */
function initHeroParticles() {
  const holder = document.getElementById('hero-canvas')
  const hero = document.getElementById('hero')
  const isMobile = innerWidth < 720
  const WORD = isMobile ? 'SR' : 'RUTHVIK'

  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
  } catch {
    document.body.classList.add('no-particles')
    return Promise.resolve()
  }

  // --- sample the word into points ---
  const c = document.createElement('canvas')
  const cx = c.getContext('2d', { willReadFrequently: true })
  const FONT_PX = 260
  cx.font = `700 ${FONT_PX}px "Space Grotesk Variable", "Space Grotesk", sans-serif`
  const textW = Math.ceil(cx.measureText(WORD).width)
  c.width = textW + 40
  c.height = FONT_PX * 1.4
  cx.font = `700 ${FONT_PX}px "Space Grotesk Variable", "Space Grotesk", sans-serif`
  cx.fillStyle = '#fff'
  cx.textAlign = 'center'
  cx.textBaseline = 'middle'
  cx.fillText(WORD, c.width / 2, c.height / 2)
  const img = cx.getImageData(0, 0, c.width, c.height).data

  const TARGET_N = isMobile ? 4200 : 10500
  let step = 2
  let pts = []
  do {
    pts = []
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) {
        if (img[(y * c.width + x) * 4 + 3] > 128) pts.push([x - c.width / 2, -(y - c.height / 2)])
      }
    }
    step += 0.5
  } while (pts.length > TARGET_N)

  const N = pts.length

  // --- three.js scene ---
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 3000)
  camera.position.z = 620

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  holder.appendChild(renderer.domElement)

  function sizeToHero() {
    const w = hero.clientWidth
    const h = hero.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    return [w, h]
  }
  let [vw, vh] = sizeToHero()
  addEventListener('resize', () => { [vw, vh] = sizeToHero() })

  // world-units scale so the word spans ~72% of the view width
  const visibleH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
  const visibleW = visibleH * (vw / vh)
  const scale = Math.min((visibleW * 0.68) / textW, (visibleH * 0.38) / FONT_PX)
  const TEXT_Y = visibleH * 0.15 // nudge the word above centre

  const textPts = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    textPts[i * 3] = pts[i][0] * scale
    textPts[i * 3 + 1] = pts[i][1] * scale + TEXT_Y
    textPts[i * 3 + 2] = (Math.random() - 0.5) * 14
  }

  // galaxy targets (3-arm spiral), stored polar for cheap live rotation
  const galR = new Float32Array(N)
  const galA = new Float32Array(N)
  const galZ = new Float32Array(N)
  const galaxyRadius = Math.min(visibleW, visibleH) * 0.46
  for (let i = 0; i < N; i++) {
    const t = i / N
    const arm = i % 3
    galR[i] = Math.pow(t, 0.75) * galaxyRadius + 8
    galA[i] = t * 11 + (arm * Math.PI * 2) / 3 + (Math.random() - 0.5) * 0.35
    galZ[i] = (Math.random() - 0.5) * 70 * (1 - t * 0.6)
  }

  const DEBUG_ASSEMBLED = location.hash === '#assembled'
  const cur = new Float32Array(N * 3)
  const seeds = new Float32Array(N)
  if (DEBUG_ASSEMBLED) cur.set(textPts)
  for (let i = 0; i < N && !DEBUG_ASSEMBLED; i++) {
    // birth cloud: a big sphere the word assembles from
    const r = 700 + Math.random() * 500
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    cur[i * 3] = r * Math.sin(ph) * Math.cos(th)
    cur[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th)
    cur[i * 3 + 2] = r * Math.cos(ph) - 300
    seeds[i] = Math.random()
  }

  // colors: cyan → violet → pink across the word
  const colors = new Float32Array(N * 3)
  const cCyan = new THREE.Color(0x4cc9f0)
  const cViolet = new THREE.Color(0xa78bfa)
  const cPink = new THREE.Color(0xf472b6)
  const tmp = new THREE.Color()
  let minX = Infinity, maxX = -Infinity
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, textPts[i * 3])
    maxX = Math.max(maxX, textPts[i * 3])
  }
  for (let i = 0; i < N; i++) {
    const t = (textPts[i * 3] - minX) / (maxX - minX || 1)
    if (t < 0.5) tmp.copy(cCyan).lerp(cViolet, t * 2)
    else tmp.copy(cViolet).lerp(cPink, (t - 0.5) * 2)
    const b = 0.9 + seeds[i] * 0.5
    colors[i * 3] = tmp.r * b
    colors[i * 3 + 1] = tmp.g * b
    colors[i * 3 + 2] = tmp.b * b
  }

  // soft round sprite
  const sc = document.createElement('canvas')
  sc.width = sc.height = 64
  const sg = sc.getContext('2d')
  const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  sg.fillStyle = grad
  sg.fillRect(0, 0, 64, 64)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(cur, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.PointsMaterial({
    size: isMobile ? 3.6 : 3.2,
    map: new THREE.CanvasTexture(sc),
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  scene.add(new THREE.Points(geo, mat))

  // cursor in world space
  const mouse = new THREE.Vector3(99999, 99999, 0)
  const mouseTarget = new THREE.Vector3(99999, 99999, 0)
  const ray = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const ndc = new THREE.Vector2()
  let ndcX = 0, ndcY = 0
  if (finePointer) {
    addEventListener('pointermove', (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      if (e.clientY < r.top || e.clientY > r.bottom) return
      ndcX = ((e.clientX - r.left) / r.width) * 2 - 1
      ndcY = -((e.clientY - r.top) / r.height) * 2 + 1
      ndc.set(ndcX, ndcY)
      ray.setFromCamera(ndc, camera)
      ray.ray.intersectPlane(plane, mouseTarget)
    })
  }

  // morph cycle: word (8s) → galaxy (6s) → word …
  let morph = 0        // 0 = word, 1 = galaxy
  let morphGoal = 0
  setInterval(() => { morphGoal = morphGoal === 0 ? 1 : 0 }, 9000)

  const REPEL_R = Math.min(visibleW, visibleH) * 0.16
  const R2 = REPEL_R * REPEL_R

  let running = true
  const io = new IntersectionObserver(([en]) => { running = en.isIntersecting }, { threshold: 0 })
  io.observe(hero)

  const clock = new THREE.Clock()
  let assembled = 0 // eases 0→1 on load

  function frame() {
    requestAnimationFrame(frame)
    if (!running) return
    const t = clock.getElapsedTime()
    const dt = Math.min(clock.getDelta() * 60, 3) || 1

    assembled = Math.min(assembled + 0.008 * dt, 1)
    const ease = assembled * assembled * (3 - 2 * assembled)
    morph += (morphGoal - morph) * 0.028 * dt
    const m = morph * morph * (3 - 2 * morph)
    const spin = t * 0.22

    mouse.lerp(mouseTarget, 0.14)

    const wob = 1.4 + m * 6
    for (let i = 0; i < N; i++) {
      const i3 = i * 3
      const s = seeds[i]
      // blend word ↔ galaxy target
      const ga = galA[i] + spin
      const gx = Math.cos(ga) * galR[i]
      const gy = Math.sin(ga) * galR[i] * 0.55 + TEXT_Y * 0.4
      const gz = galZ[i]
      let txp = textPts[i3] + (gx - textPts[i3]) * m
      let typ = textPts[i3 + 1] + (gy - textPts[i3 + 1]) * m
      let tzp = textPts[i3 + 2] + (gz - textPts[i3 + 2]) * m
      // gentle breathing
      typ += Math.sin(t * 1.3 + s * 12.56) * wob
      txp += Math.cos(t * 1.1 + s * 9.42) * wob * 0.5

      // spring toward target (scaled by assembly easing)
      const k = 0.02 + ease * 0.075
      cur[i3] += (txp - cur[i3]) * k * dt
      cur[i3 + 1] += (typ - cur[i3 + 1]) * k * dt
      cur[i3 + 2] += (tzp - cur[i3 + 2]) * k * dt

      // cursor ripple
      const dx = cur[i3] - mouse.x
      const dy = cur[i3 + 1] - mouse.y
      const d2 = dx * dx + dy * dy
      if (d2 < R2 && d2 > 0.01) {
        const d = Math.sqrt(d2)
        const f = ((REPEL_R - d) / REPEL_R) * 9 * dt
        cur[i3] += (dx / d) * f
        cur[i3 + 1] += (dy / d) * f
      }
    }
    geo.attributes.position.needsUpdate = true

    // camera parallax
    camera.position.x += (ndcX * 26 - camera.position.x) * 0.04 * dt
    camera.position.y += (ndcY * 16 - camera.position.y) * 0.04 * dt
    camera.lookAt(0, TEXT_Y * 0.5, 0)

    renderer.render(scene, camera)
  }
  frame()
  return Promise.resolve()
}

if (!reduced) {
  document.fonts
    .load('700 260px "Space Grotesk Variable"')
    .catch(() => {})
    .then(() => initHeroParticles())
} else {
  document.body.classList.add('no-particles')
}

/* ==========================================================
   Custom cursor
   ========================================================== */
if (finePointer) {
  const dot = document.querySelector('.cursor-dot')
  const ring = document.querySelector('.cursor-ring')
  let mx = -100, my = -100, rx = -100, ry = -100
  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY })
  ;(function loop() {
    requestAnimationFrame(loop)
    rx += (mx - rx) * 0.16
    ry += (my - ry) * 0.16
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`
  })()
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('[data-hover]')) document.body.classList.add('cursor-hover')
  })
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest('[data-hover]')) document.body.classList.remove('cursor-hover')
  })
}

/* ==========================================================
   Magnetic buttons + tilt cards
   ========================================================== */
if (finePointer && !reduced) {
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - (r.left + r.width / 2)
      const y = e.clientY - (r.top + r.height / 2)
      el.style.transform = `translate(${x * 0.22}px, ${y * 0.22}px)`
    })
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform .4s cubic-bezier(.22,.61,.36,1)'
      el.style.transform = ''
      setTimeout(() => (el.style.transition = ''), 400)
    })
  })

  document.querySelectorAll('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg)`
    })
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform .5s ease'
      el.style.transform = ''
      setTimeout(() => (el.style.transition = ''), 500)
    })
  })
}

/* ==========================================================
   Reveals: generic blocks, split-word titles, lit statement
   ========================================================== */
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('is-visible')
        io.unobserve(en.target)
      }
    }),
  { threshold: 0.12 }
)
document.querySelectorAll('.reveal').forEach((el) => io.observe(el))

document.querySelectorAll('[data-split]').forEach((el) => {
  const words = el.textContent.trim().split(/\s+/)
  el.textContent = ''
  words.forEach((w, i) => {
    const mask = document.createElement('span')
    mask.className = 'w'
    const inner = document.createElement('i')
    inner.textContent = w
    inner.style.transitionDelay = `${i * 0.09}s`
    mask.appendChild(inner)
    el.appendChild(mask)
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '))
  })
  io.observe(el)
})

// statement words light up as you scroll through
{
  const st = document.getElementById('statement')
  if (st && !reduced) {
    const words = st.textContent.trim().split(/\s+/)
    st.textContent = ''
    const spans = words.map((w, i) => {
      const s = document.createElement('span')
      s.className = 'sw'
      s.textContent = w
      st.appendChild(s)
      if (i < words.length - 1) st.appendChild(document.createTextNode(' '))
      return s
    })
    let lit = -1
    const onScroll = () => {
      const r = st.getBoundingClientRect()
      const p = Math.min(Math.max((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.45), 0), 1)
      const n = Math.floor(p * spans.length)
      if (n === lit) return
      spans.forEach((s, i) => s.classList.toggle('lit', i < n))
      lit = n
    }
    addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }
}

/* ==========================================================
   Rotating hero role
   ========================================================== */
{
  const spans = [...document.querySelectorAll('#roleRotator em')]
  let idx = 0
  setInterval(() => {
    const curEl = spans[idx]
    idx = (idx + 1) % spans.length
    curEl.classList.remove('is-active')
    curEl.classList.add('is-leaving')
    setTimeout(() => curEl.classList.remove('is-leaving'), 500)
    spans[idx].classList.add('is-active')
  }, 2800)
}

/* ==========================================================
   Skill sphere — a draggable 3D word cloud
   ========================================================== */
{
  const holder = document.getElementById('skillSphere')
  const SKILLS = [
    'Angular', 'TypeScript', 'Java', 'Spring Boot', 'React', 'Node.js',
    'Python', 'MongoDB', 'AWS', 'Docker', 'Groovy', 'MySQL', 'Jenkins',
    'Git', 'Flask', 'SASS', 'REST', 'CI/CD', 'Three.js', 'DynamoDB',
    'Express', 'Jira', 'Agile', 'HTML', 'CSS', 'Laravel',
  ]
  const items = SKILLS.map((name, i) => {
    const el = document.createElement('span')
    el.textContent = name
    holder.appendChild(el)
    // fibonacci sphere
    const k = (i + 0.5) / SKILLS.length
    const phi = Math.acos(1 - 2 * k)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    return {
      el,
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.cos(phi),
      z: Math.sin(phi) * Math.sin(theta),
    }
  })

  let ry = 0, rx = -0.25
  let vy = reduced ? 0 : 0.0032
  let vx = 0
  let dragging = false
  let lastX = 0, lastY = 0

  holder.addEventListener('pointerdown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    holder.setPointerCapture(e.pointerId)
  })
  addEventListener('pointermove', (e) => {
    if (!dragging) return
    vy = (e.clientX - lastX) * 0.0022
    vx = (e.clientY - lastY) * 0.0016
    lastX = e.clientX
    lastY = e.clientY
  })
  addEventListener('pointerup', () => (dragging = false))

  function render() {
    requestAnimationFrame(render)
    const rect = holder.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > innerHeight) return
    ry += vy
    rx += vx
    rx = Math.max(-1.2, Math.min(1.2, rx))
    if (!dragging) {
      vy += (0.0032 * (reduced ? 0 : 1) - vy) * 0.02
      vx *= 0.95
    }
    const R = rect.width * 0.42
    const f = rect.width * 1.15
    const cosY = Math.cos(ry), sinY = Math.sin(ry)
    const cosX = Math.cos(rx), sinX = Math.sin(rx)
    for (const it of items) {
      let x = it.x * cosY + it.z * sinY
      let z = -it.x * sinY + it.z * cosY
      let y = it.y * cosX - z * sinX
      z = it.y * sinX + z * cosX
      const s = f / (f + z * R)
      const depth = (z + 1) / 2 // 0 front? (z negative = closer given our projection) —
      const near = 1 - depth
      it.el.style.transform = `translate(-50%, -50%) translate(${x * R * s}px, ${y * R * s}px) scale(${s})`
      it.el.style.opacity = (0.25 + near * 0.75).toFixed(2)
      it.el.style.zIndex = Math.round(near * 100)
      it.el.style.fontSize = '15px'
      it.el.style.color = near > 0.62 ? '#f2f1ef' : '#8f90a6'
      it.el.style.textShadow = near > 0.8 ? '0 0 18px rgba(76,201,240,0.55)' : 'none'
    }
  }
  render()
}

/* ==========================================================
   Nav behaviour + clock + misc
   ========================================================== */
{
  const nav = document.getElementById('nav')
  let lastY = 0
  addEventListener(
    'scroll',
    () => {
      const y = scrollY
      nav.classList.toggle('nav--hidden', y > lastY && y > 300 && !document.body.classList.contains('menu-open'))
      lastY = y
    },
    { passive: true }
  )
  document.getElementById('burger').addEventListener('click', () => {
    document.body.classList.toggle('menu-open')
  })

  const clockEl = document.getElementById('clock')
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  setInterval(() => (clockEl.textContent = fmt.format(new Date())), 1000)
  clockEl.textContent = fmt.format(new Date())
}

loaderDone.then(() => document.body.classList.add('is-loaded'))
