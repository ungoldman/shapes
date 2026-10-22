// Much of the code is adapted from this gist:
// https://gist.github.com/thomasdarimont/8c694b4522c6cb10d85c
// I mostly added pointer interactivity to allow the user to rotate,
// then spent time fiddling with colors and composite ops.

// docs on composite operations:
// https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
const COMPOSITE_OPS = [
  'source-over',
  'source-in',
  'source-out',
  'source-atop',
  'destination-over',
  'destination-in',
  'destination-out',
  'destination-atop',
  'lighter',
  'copy',
  'xor',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
]

const CANCEL_EVENTS = [
  'pointerup',
  'pointerout',
  'pointerleave',
  'pointercancel'
]

class Point3D {
  constructor (x, y, z) {
    this.x = x
    this.y = y
    this.z = z
  }

  rotateX (currentAngle) {
    const rad = (currentAngle * Math.PI) / 180
    const cosa = Math.cos(rad)
    const sina = Math.sin(rad)
    const y = this.y * cosa - this.z * sina
    const z = this.y * sina + this.z * cosa

    return new Point3D(this.x, y, z)
  }

  rotateY (currentAngle) {
    const rad = (currentAngle * Math.PI) / 180
    const cosa = Math.cos(rad)
    const sina = Math.sin(rad)
    const z = this.z * cosa - this.x * sina
    const x = this.z * sina + this.x * cosa

    return new Point3D(x, this.y, z)
  }

  rotateZ (currentAngle) {
    const rad = (currentAngle * Math.PI) / 180
    const cosa = Math.cos(rad)
    const sina = Math.sin(rad)
    const x = this.x * cosa - this.y * sina
    const y = this.x * sina + this.y * cosa

    return new Point3D(x, y, this.z)
  }

  project (viewWidth, viewHeight, fieldOfView, viewDistance) {
    const factor = (fieldOfView / state.DPR) / (viewDistance + this.z)
    const x = this.x * factor + (viewWidth / state.DPR) / 2
    const y = this.y * factor + (viewHeight / state.DPR) / 2
    return new Point3D(x, y, this.z)
  }
}

const canvas = document.querySelector('#canvas')
const ctx = canvas.getContext('2d')

function startingDrift () {
  return Math.random() < 0.5
    ? 0.1
    : -0.1
}

const state = {
  canvas,
  ctx,

  DPR: window.devicePixelRatio || 1,
  FPS: 60,

  vertices: createVertices(),
  colors: rollColors(),
  ops: rollOps(),

  lastX: 0,
  lastY: 0,

  dirX: startingDrift(),
  dirY: startingDrift()
}

const cubeFaces = [
  [0, 1, 2, 3],
  [1, 5, 6, 2],
  [5, 4, 7, 6],
  [4, 0, 3, 7],
  [0, 4, 5, 1],
  [3, 2, 6, 7]
]

function createVertices () {
  return [
    new Point3D(-1, 1, -1),
    new Point3D(1, 1, -1),
    new Point3D(1, -1, -1),
    new Point3D(-1, -1, -1),
    new Point3D(-1, 1, 1),
    new Point3D(1, 1, 1),
    new Point3D(1, -1, 1),
    new Point3D(-1, -1, 1)
  ]
}

function rollColors () {
  return Array(24).fill(0).map(_ => {
    return `rgba(${r(255)},${r(255)},${r(255)}, 0.9)`
  })
}

function rollOps () {
  const lastn = []
  return Array(6).fill(0).map(_ => {
    let n = r(25)
    while (lastn.includes(n)) n = r(25) // ensure unique op for every face
    lastn.push(n)
    return COMPOSITE_OPS[n]
  })
}

function startRendering () {
  const { canvas, ctx } = state
  setCanvasDimensions(canvas, ctx)

  // prevent all touch events
  // note: apparently you still need to handle touch* when using pointer*
  canvas.addEventListener('touchstart', event => event.preventDefault())
  canvas.addEventListener('touchmove', event => event.preventDefault())
  canvas.addEventListener('touchend', event => event.preventDefault())
  canvas.addEventListener('touchcancel', event => event.preventDefault())

  // capture & handle pointer events (should cover mouse & touch)
  canvas.addEventListener('pointerdown', event => {
    event.preventDefault()
    canvas.addEventListener('pointermove', handleEvent)
  })

  CANCEL_EVENTS.forEach(ce => {
    canvas.addEventListener(ce, event => {
      event.preventDefault()
      canvas.removeEventListener('pointermove', handleEvent)
    })
  })

  window.addEventListener('resize', _ => {
    setCanvasDimensions(canvas, ctx)
  })

  // window.shapeRotatorLoop = setInterval(() => renderLoop(canvas, ctx), 50)
  window.requestAnimationFrame(() => renderLoop(canvas, ctx))
}

function renderLoop (canvas, ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  handleEvent(null, true)

  const points = state.vertices.map(vertex => {
    return vertex.project(canvas.width, canvas.height, canvas.height, 6)
  })

  let i = 0

  cubeFaces.forEach((cubeFace, j) => {
    ctx.beginPath()
    ctx.moveTo(points[cubeFace[0]].x, points[cubeFace[0]].y)
    ctx.strokeStyle = state.colors[i++]
    ctx.lineTo(points[cubeFace[1]].x, points[cubeFace[1]].y)
    ctx.strokeStyle = state.colors[i++]
    ctx.lineTo(points[cubeFace[2]].x, points[cubeFace[2]].y)
    ctx.strokeStyle = state.colors[i++]
    ctx.lineTo(points[cubeFace[3]].x, points[cubeFace[3]].y)
    ctx.closePath()
    ctx.stroke()
    ctx.globalCompositeOperation = state.ops[j]
    ctx.fillStyle = state.colors[i++]
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  })

  setTimeout(() => {
    window.requestAnimationFrame(() => renderLoop(canvas, ctx))
  }, 1000 / state.FPS)
}

function handleEvent (event, drift) {
  if (event && event.preventDefault) event.preventDefault()
  const { clientX, clientY } = event || {}
  let x = 0
  let y = 0
  // let z = 0

  if (clientX != null && state.lastX != null) {
    x = (clientY - state.lastY)
    y = (state.lastX - clientX)
    state.dirX = x / 3
    state.dirY = y / 3
  } else if (drift) {
    x += state.dirX
    y += state.dirY
    // z += dirY
  }

  state.vertices = state.vertices.map((vertex, i) => {
    return vertex
      .rotateX(x)
      .rotateY(y)
      // .rotateZ(z)
  })

  state.lastX = clientX
  state.lastY = clientY
}

function keyRotate (x, y) {
  state.vertices = state.vertices.map((vertex, i) => {
    return vertex
      .rotateX(-x)
      .rotateY(-y)
  })
  state.dirX = -x / 4
  state.dirY = -y / 4
}

/**
 * generate random number
 * @param {number} n - upper limit
 * @returns number
 */
function r (n) { return Math.round(Math.random() * n) }

// adapted from https://www.html5rocks.com/en/tutorials/canvas/hidpi/
// mutates canvas, ctx, side effect on state.DPR
function setCanvasDimensions (canvas, ctx) {
  // Get the device pixel ratio, falling back to 1.
  state.DPR = window.devicePixelRatio || 1
  // Get the size of the canvas in CSS pixels.
  const rect = canvas.getBoundingClientRect()
  // Give the canvas pixel dimensions of their CSS
  // size * the device pixel ratio.
  canvas.width = rect.width * state.DPR
  canvas.height = rect.height * state.DPR

  ctx.scale(state.DPR, state.DPR)
}

function reroll () {
  state.colors = rollColors()
  state.ops = rollOps()
}

function resetView () {
  state.vertices = createVertices()
}

let lastDir = [0, 0]

function toggleFreeze () {
  if (
    state.dirX === 0 &&
    state.dirY === 0
  ) {
    state.dirX = lastDir[0]
    state.dirY = lastDir[1]
  } else {
    lastDir = [state.dirX, state.dirY]
    state.dirX = 0
    state.dirY = 0
  }
}

function controls () {
  const h = document.querySelector('html')
  const bulb = document.querySelector('.bulb')
  const dice = document.querySelector('.dice')
  const info = document.querySelector('.info')
  const d = document.querySelector('#info-dialog')
  const dc = document.querySelector('#info-dialog-close')
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  let bg = window.localStorage.getItem('shape-rotator-bg')

  if (!bg) bg = dark ? 'dark' : 'light'
  h.classList.add(bg)

  function toggleLight () {
    if (bg === 'dark') day()
    else night()
  }

  function day () {
    h.classList.remove('dark')
    h.classList.add('light')
    window.localStorage.setItem('shape-rotator-bg', 'light')
    bg = 'light'
  }

  function night () {
    h.classList.remove('light')
    h.classList.add('dark')
    window.localStorage.setItem('shape-rotator-bg', 'dark')
    bg = 'dark'
  }

  bulb.addEventListener('pointerdown', toggleLight)
  dice.addEventListener('pointerdown', reroll)
  info.addEventListener('pointerdown', toggleInfo)
  dc.addEventListener('pointerdown', toggleInfo)

  function toggleInfo () {
    if (d.open) return d.close()
    d.showModal()
  }

  const keys = {}

  document.addEventListener('keydown', event => {
    keys[event.key] = true

    if (event.key === 'q') return reroll()
    if (event.key === 'e') return toggleLight()
    if (event.key === 'i') return toggleInfo()

    let x = 0
    let y = 0
    if (keys.r) resetView()
    if (keys.f) toggleFreeze()
    if (keys.w) x = 4
    if (keys.s) x = -4
    if (keys.a) y = -4
    if (keys.d) y = 4

    if ([x, y].some(n => n !== 0)) keyRotate(x, y)
  })

  document.addEventListener('keyup', event => {
    delete keys[event.key]
  })
}

document.addEventListener('DOMContentLoaded', _ => {
  startRendering()
  controls()
})
