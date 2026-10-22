import {
  ACTIONS,
  aligned,
  apply,
  approach,
  axisAngle,
  CARDED,
  DISTANCE,
  DRAG,
  drift,
  EFFECT_KEYS,
  EFFECTS,
  fling,
  IDENTITY,
  KEYS,
  NOTES,
  OPS,
  other,
  project,
  redirect,
  roll,
  SHAPE_KEYS,
  STEER,
  STILL,
  settle,
  TAP,
  turn,
  unit,
  ZOOM_KEYS,
  zoomBy
} from './rotator.js'
import { centroid, normal, SHAPES } from './shapes.js'

const THEME_KEY = 'shape-rotator-bg'
// ms per frame the spin speeds are tuned for
const FRAME = 1000 / 60
// a drag let go faster than this many px per ms, measured over the last
// stretch of ms before release, keeps spinning
const FLICK = 0.3
const FLICK_TAIL = 90
// ms a change of shape, effect, or colors crossfades over, and the size the
// new state grows from
const FADE = 250
// radians per ms the hypercube turns through 4D
const MORPH = 0.0006
// degrees round the wheel from a surface's front hue to its back one
const BACK_HUE = 150
const GROW = 0.88
// css px per square of the card's checker, and the share of each face pulled
// in from its edges where the card shows through
const CHECK = 8
const INSET = 0.1
// ms between steps while R, [, ], comma, period, or the dice is held, long
// enough to take in
const CYCLE_EVERY = 400
// zoom per pixel of wheel, and per pixel of a trackpad pinch, which sends
// much smaller steps
const WHEEL = 0.0015
const PINCH = 0.01
// ms between readout updates, slow enough to read
const READOUT_EVERY = 100
const EYE = [0, 0, -DISTANCE]
// toward the light, up and to the left of the eye
const LIGHT = (() => {
  const l = [-0.5, -0.7, -1]
  const n = Math.hypot(...l)
  return l.map((c) => c / n)
})()
const NAMES = { mixed: 'mixed ops', solid: 'solid', wire: 'wireframe' }

const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
const credits = document.getElementById('credits')
const picker = document.getElementById('shape')
const effects = document.getElementById('effect')
const themeColor = document.querySelector('meta[name="theme-color"]')
const buttons = Object.fromEntries(
  [...document.querySelectorAll('[data-action]')].map((el) => [el.dataset.action, el])
)
const readout = Object.fromEntries(
  ['name', 'counts', 'turn', 'effect', 'note'].map((id) => [
    id,
    document.getElementById(`readout-${id}`)
  ])
)
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

let shape = SHAPES[0]
let effect = EFFECTS[0]
let orientation = IDENTITY
const MOST_FACES = Math.max(...SHAPES.map((s) => s.F))
let { faces, hue } = roll(MOST_FACES)
// the spin it settles into when nothing holds it, and its speed right now
let cruise = still ? STILL : drift()
let speed = cruise
// the cruise when a double tap set it off, which a tap the same way speeds up
let owned = STILL
// what to go back to on unpause, so a reduced-motion visitor starts
// paused, one press from the usual drift
let thawed = { cruise: still ? drift() : cruise, owned }
// the last tap, for telling a double tap
let lastTap = null
// the gesture under way on the keys, and on the canvas
let keys = null
let touch = null
let cycling = null
// how far a 4D shape has turned through 4D
let phase = 0
let width = 0
let height = 0
let zoom = 1
// pointers down on the canvas, by id: one drags, two pinch
const pointers = new Map()
let span = 0
let ink = {}
const held = new Set()

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const toward = (from, to) => [to[0] - from[0], to[1] - from[1], to[2] - from[2]]

// The card the CARDED ops act on, since on an empty canvas they draw
// nothing or only the plain shape. A transparency checker in two grays, the
// second half see-through so the ops still have alpha to act on, clipped to
// the shape's outline.
const card = document.createElement('canvas')

function paintCard(dpr) {
  card.width = canvas.width
  card.height = canvas.height
  const c = card.getContext('2d')
  const cell = CHECK * dpr
  for (let row = 0; row * cell < card.height; row++) {
    for (let col = 0; col * cell < card.width; col++) {
      c.fillStyle = (row + col) % 2 ? ink.checkSoft : ink.check
      c.fillRect(Math.round(col * cell), Math.round(row * cell), Math.ceil(cell), Math.ceil(cell))
    }
  }
}

// what was on screen just before a change, faded out over the new frame
const fade = document.createElement('canvas')
let fadeStart = -Infinity
// when a new shape began to grow in, which a change of effect alone skips
let growStart = -Infinity

function transition(grow = true) {
  const now = performance.now()
  if (grow) growStart = now
  if (now === fadeStart) return
  fadeStart = now
  fade.width = canvas.width
  fade.height = canvas.height
  fade.getContext('2d').drawImage(canvas, 0, 0)
}

function resize() {
  const dpr = window.devicePixelRatio || 1
  width = canvas.clientWidth
  height = canvas.clientHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  layer.width = canvas.width
  layer.height = canvas.height
  paintCard(dpr)
  fadeStart = -Infinity
  growStart = -Infinity
}

function path(g, points, face) {
  g.beginPath()
  for (const i of face) g.lineTo(...points[i])
  g.closePath()
}

// The original look: every face in a fixed order, no hiding, each composited
// onto what is already drawn with its own op.
function drawOps(points) {
  shape.faces.forEach((face, i) => {
    const { stroke, fill, op } = faces[i]
    path(ctx, points, face)
    ctx.strokeStyle = stroke
    ctx.stroke()
    ctx.globalCompositeOperation = op
    ctx.fillStyle = fill
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  })
}

// each face's normal, center, and whether it faces the eye
function survey(world) {
  return shape.faces.map((face, i) => {
    const corners = face.map((v) => world[v])
    const n = normal(corners)
    const c = centroid(corners)
    return { face, i, n, c, front: dot(n, toward(c, EYE)) > 0 }
  })
}

// Back faces culled, the rest painted far to near. One hue lit by how
// squarely each face meets the light, or each face its rolled color unlit.
function visible(world) {
  return survey(world)
    .filter((f) => shape.twoSided || f.front)
    .sort((a, b) => b.c[2] - a.c[2])
}

// a face's corners pulled toward its middle by INSET
function inset(points, face) {
  const mid = [0, 1].map((k) => face.reduce((sum, i) => sum + points[i][k], 0) / face.length)
  return face.map((i) => [0, 1].map((k) => points[i][k] + (mid[k] - points[i][k]) * INSET))
}

function drawSolid(g, points, world, colorful, shrink) {
  g.lineJoin = 'round'
  g.strokeStyle = ink.edge
  for (const { face, i, n, front } of visible(world)) {
    const facing = front ? n : n.map((c) => -c)
    const light = Math.max(0, dot(facing, LIGHT))
    if (shrink) {
      const corners = inset(points, face)
      path(g, corners, corners.keys())
    } else {
      path(g, points, face)
    }
    // the back of a two-sided surface takes a second hue
    const h = shape.twoSided && !front ? (hue + BACK_HUE) % 360 : hue
    g.fillStyle = colorful ? faces[i].solid : `oklch(${0.38 + 0.4 * light} 0.08 ${h})`
    g.fill()
    g.stroke()
  }
}

// One op over the card: the whole shape drawn solid on its own layer, then
// composited onto the card at once, so the op reads as shape against card.
const layer = document.createElement('canvas')
const layerCtx = layer.getContext('2d')

// One op, face over face: every face, the back ones too, far to near, each
// blending with the faces already drawn. The fills keep a little
// transparency, so ops that clear or thin out show it.
function drawFaces(points, world, op) {
  const order = survey(world).sort((a, b) => b.c[2] - a.c[2])
  for (const { face, i } of order) {
    const { stroke, fill } = faces[i]
    path(ctx, points, face)
    ctx.strokeStyle = stroke
    ctx.stroke()
    ctx.globalCompositeOperation = op
    ctx.fillStyle = fill
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
}

function drawOne(points, world, op) {
  ctx.save()
  ctx.beginPath()
  for (const { face } of visible(world)) {
    ctx.moveTo(...points[face[0]])
    for (const i of face) ctx.lineTo(...points[i])
    ctx.closePath()
  }
  ctx.clip()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(card, 0, 0)
  ctx.restore()
  layerCtx.setTransform(1, 0, 0, 1, 0, 0)
  layerCtx.clearRect(0, 0, layer.width, layer.height)
  layerCtx.setTransform(ctx.getTransform())
  // pulled in from the edges where there is a card, so it shows between faces
  drawSolid(layerCtx, points, world, true, true)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = op
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
}

// Every edge, the ones behind the shape dashed and faint.
// Every edge, the ones behind the shape dashed and faint.
function drawWire(points, world) {
  const front = survey(world).map((f) => f.front)
  const seen = ([, , beside]) => shape.twoSided || beside.some((f) => front[f])
  ctx.lineWidth = 1
  ctx.setLineDash([3, 4])
  ctx.strokeStyle = ink.hidden
  ctx.beginPath()
  for (const edge of shape.edges.filter((e) => !seen(e))) {
    ctx.moveTo(...points[edge[0]])
    ctx.lineTo(...points[edge[1]])
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = ink.fg
  ctx.shadowColor = ink.glow
  ctx.shadowBlur = 8
  ctx.beginPath()
  for (const edge of shape.edges.filter(seen)) {
    ctx.moveTo(...points[edge[0]])
    ctx.lineTo(...points[edge[1]])
  }
  ctx.stroke()
  // one path for every dot, so the glow is drawn once
  ctx.fillStyle = ink.fg
  ctx.beginPath()
  for (const [x, y] of points) {
    ctx.moveTo(x + 1.6, y)
    ctx.arc(x, y, 1.6, 0, 2 * Math.PI)
  }
  ctx.fill()
  ctx.shadowBlur = 0
}

function draw(now) {
  ctx.clearRect(0, 0, width, height)
  const t = Math.min(1, (now - fadeStart) / FADE)
  // eased out, so the new shape settles into place
  const g = Math.min(1, (now - growStart) / FADE)
  const grow = GROW + (1 - GROW) * (1 - (1 - g) ** 3)
  const base = shape.morph ? shape.morph(phase) : shape.vertices
  const world = base.map((v) => apply(orientation, v))
  const points = world.map((v) => project(v, width, height, zoom * grow))
  if (effect === 'solid') drawSolid(ctx, points, world, false, false)
  else if (effect === 'wire') drawWire(points, world)
  else if (effect === 'mixed') drawOps(points)
  else if (CARDED.includes(effect)) drawOne(points, world, effect)
  else drawFaces(points, world, effect)
  if (t < 1) {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = (1 - t) * (1 - t)
    ctx.drawImage(fade, 0, 0)
    ctx.restore()
  }
}

// signed to two places, with no minus on a value that rounds to zero
const fixed = (n) => (n <= -0.005 ? '−' : '+') + Math.abs(n).toFixed(2)

function showReadout() {
  const [degrees, axis] = axisAngle(orientation)
  readout.name.textContent = shape.name
  readout.counts.textContent = `V ${shape.V}  E ${shape.E}  F ${shape.F}  χ ${shape.euler}`
  readout.turn.textContent = `${degrees.toFixed(1).padStart(5)}° about (${axis.map(fixed).join(', ')})`
  readout.effect.textContent = `${NAMES[effect] || effect}  ${zoom.toFixed(2)}\u00D7`
  readout.note.textContent = NOTES[effect] || ''
}

function direction(codes) {
  let sum = STILL
  for (const code of codes) sum = sum.map((c, i) => c + KEYS[code][i])
  return unit(sum)
}

// where the speed is headed: held keys steer, at the owned speed when it is
// faster and the same way, otherwise it eases into the cruise
function heading() {
  if (!held.size) return cruise
  const dir = direction(held)
  const before = keys ? keys.owned : STILL
  const fast = aligned(before, dir) ? Math.max(STEER, Math.hypot(...before)) : STEER
  return dir.map((c) => c * fast)
}

let then = performance.now()
let shown = 0
function frame(now) {
  // capped so a tab coming back from the background does not lurch
  const ms = Math.min(now - then, 100)
  then = now
  // a finger or the mouse on the canvas has the shape to itself
  if (!pointers.size) {
    speed = approach(speed, heading(), ms)
    orientation = turn(orientation, ...speed.map((c) => (c * ms) / FRAME))
  }
  // 4D turns with the spin, and holds still while a hand has the shape
  if (!paused() && !held.size && !pointers.size) phase += ms * MORPH
  draw(now)
  if (now - shown > READOUT_EVERY) {
    showReadout()
    shown = now
  }
  requestAnimationFrame(frame)
}

function paused() {
  return cruise.every((c) => c === 0)
}

// a gesture takes hold and stops the spin until it ends
function grab() {
  const before = owned
  cruise = STILL
  owned = STILL
  showPaused()
  return before
}

function finish(before, gesture) {
  ;({ cruise, last: lastTap } = settle({ owned: before, last: lastTap }, gesture))
  owned = cruise
  showPaused()
}

// held, R and M keep going, slow enough to take each one in
const CYCLES = ['reroll']

// do it once, then again every CYCLE_EVERY ms until the key or button lets go
function startCycle(name = 'reroll') {
  stopCycle()
  const step = typeof name === 'function' ? name : actions[name]
  step()
  cycling = setInterval(step, CYCLE_EVERY)
}

function stepEffect(by) {
  const n = EFFECTS.length
  setEffect(EFFECTS[(EFFECTS.indexOf(effect) + by + n) % n])
}

// a hand picking a shape cuts straight to it. Only a reroll animates.
function stepShape(by) {
  const n = SHAPES.length
  pick((SHAPES.indexOf(shape) + by + n) % n, false)
}

function stopCycle() {
  clearInterval(cycling)
  cycling = null
}

function showPaused() {
  buttons.pause.setAttribute('aria-pressed', String(paused()))
}

function setEffect(next) {
  transition(false)
  effect = next
  effects.value = next
  showReadout()
}

function pick(index, animate = true) {
  if (animate) transition()
  shape = SHAPES[index]
  picker.value = String(index)
  showReadout()
}

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

function setTheme(theme, save) {
  document.documentElement.dataset.theme = theme
  buttons.light.setAttribute('aria-pressed', String(theme === 'light'))
  const style = getComputedStyle(document.documentElement)
  const token = (name) => style.getPropertyValue(name).trim()
  themeColor.content = token('--bg')
  ink = {
    fg: token('--fg'),
    hidden: token('--dim'),
    edge: token('--edge'),
    glow: token('--glow'),
    check: token('--check'),
    checkSoft: token('--check-soft')
  }
  // the checker follows the theme
  if (width) paintCard(window.devicePixelRatio || 1)
  if (!save) return
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {}
}

const actions = {
  // everything but where the shape sits and how fast it turns
  reroll() {
    if (paused()) {
      thawed = { cruise: redirect(thawed.cruise), owned: STILL }
    } else {
      cruise = redirect(cruise)
      owned = STILL
    }
    transition()
    ;({ faces, hue } = roll(MOST_FACES))
    setEffect(EFFECTS[Math.floor(Math.random() * EFFECTS.length)])
    pick(other(SHAPES.length, SHAPES.indexOf(shape)))
  },
  light() {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true)
  },
  pause() {
    if (paused()) {
      ;({ cruise, owned } = thawed)
    } else {
      thawed = { cruise, owned }
      cruise = STILL
      owned = STILL
    }
    showPaused()
  },
  info() {
    credits.togglePopover()
  }
}

// the info button opens the credits itself, through popovertarget
for (const [name, el] of Object.entries(buttons)) {
  if (name !== 'reroll') el.addEventListener('click', actions[name])
}
// held, the dice keeps rolling. A click from the keyboard has no pointer.
buttons.reroll.addEventListener('pointerdown', () => startCycle())
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
  buttons.reroll.addEventListener(type, stopCycle)
}
buttons.reroll.addEventListener('click', (event) => {
  if (event.detail === 0) actions.reroll()
})

const groups = { false: 'shapes', true: 'esoteric' }
for (const [i, { name, esoteric }] of SHAPES.entries()) {
  let group = [...picker.children].find((g) => g.label === groups[esoteric])
  if (!group) {
    group = document.createElement('optgroup')
    group.label = groups[esoteric]
    picker.append(group)
  }
  group.append(new Option(name, String(i)))
}
picker.addEventListener('change', () => {
  pick(Number(picker.value), false)
  // hand the keys back, or WASD would pick shapes by their first letter
  picker.blur()
})

for (const id of ['wire', 'solid']) effects.add(new Option(NAMES[id], id))
const single = document.createElement('optgroup')
single.label = 'one composite op'
for (const op of OPS) single.append(new Option(op, op))
effects.append(single)
effects.add(new Option(NAMES.mixed, 'mixed'))
effects.addEventListener('change', () => {
  setEffect(effects.value)
  effects.blur()
})

function spread() {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

// Down takes hold, a drag steers, and letting go mid-drag flings the shape
// on at the speed it was moving.
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, [event.clientX, event.clientY])
  if (pointers.size === 1) {
    grab()
    touch = { tail: [[event.timeStamp, event.clientX, event.clientY]] }
    speed = STILL
  }
  if (pointers.size === 2) {
    span = spread()
    if (touch) touch.pinched = true
  }
})

canvas.addEventListener('pointermove', (event) => {
  const last = pointers.get(event.pointerId)
  if (!last) return
  pointers.set(event.pointerId, [event.clientX, event.clientY])
  if (pointers.size === 2) {
    const next = spread()
    if (span) zoom = zoomBy(zoom, next / span)
    span = next
    return
  }
  if (pointers.size > 2 || !touch) return
  const dx = event.clientX - last[0]
  const dy = event.clientY - last[1]
  orientation = turn(orientation, dy * DRAG, -dx * DRAG)
  touch.tail.push([event.timeStamp, event.clientX, event.clientY])
  while (event.timeStamp - touch.tail[0][0] > FLICK_TAIL) touch.tail.shift()
})

function release(event, cancelled) {
  if (!pointers.delete(event.pointerId)) return
  span = 0
  if (pointers.size || !touch) return
  const { tail, pinched } = touch
  touch = null
  lastTap = null
  // only motion from just before release counts, so a drag that stopped first stays put
  const recent = tail.filter(([t]) => event.timeStamp - t <= FLICK_TAIL)
  if (cancelled || pinched || recent.length < 2) return
  const [t0, x0, y0] = recent[0]
  const [t1, x1, y1] = recent[recent.length - 1]
  const ms = Math.max(1, t1 - t0)
  if (Math.hypot(x1 - x0, y1 - y0) / ms < FLICK) return
  cruise = fling(x1 - x0, y1 - y0, ms)
  owned = cruise
  showPaused()
}

canvas.addEventListener('pointerup', (event) => release(event, false))
canvas.addEventListener('pointercancel', (event) => release(event, true))

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    // a trackpad pinch arrives as a wheel with ctrlKey set
    const rate = event.ctrlKey ? PINCH : WHEEL
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    zoom = zoomBy(zoom, Math.exp(-pixels * rate))
  },
  { passive: false }
)

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.target instanceof HTMLSelectElement) return
  if (ZOOM_KEYS[event.code]) {
    zoom = zoomBy(zoom, ZOOM_KEYS[event.code])
    return
  }
  // a focused button takes Space for itself
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return
  // held keys are timed here, not by the system's key repeat
  if (event.code === 'Space') event.preventDefault()
  if (event.repeat) return
  const action = ACTIONS[event.code]
  if (CYCLES.includes(action)) return startCycle(action)
  if (SHAPE_KEYS[event.code]) return startCycle(() => stepShape(SHAPE_KEYS[event.code]))
  if (EFFECT_KEYS[event.code]) return startCycle(() => stepEffect(EFFECT_KEYS[event.code]))
  if (action) return actions[action]()
  if (!KEYS[event.code]) return
  if (!keys) keys = { start: event.timeStamp, owned: grab(), codes: new Set() }
  keys.codes.add(event.code)
  held.add(event.code)
})

window.addEventListener('keyup', (event) => {
  held.delete(event.code)
  if (keys && KEYS[event.code] && !held.size) {
    const { start, owned: before, codes } = keys
    keys = null
    const tap = event.timeStamp - start < TAP
    finish(before, { dir: direction(codes), tap, start, end: event.timeStamp })
  }
  if (CYCLES.includes(ACTIONS[event.code]) || SHAPE_KEYS[event.code] || EFFECT_KEYS[event.code]) {
    stopCycle()
  }
})
window.addEventListener('blur', () => {
  held.clear()
  keys = null
  stopCycle()
})
window.addEventListener('resize', resize)

setTheme(
  readTheme() || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  false
)
actions.reroll()
showPaused()
resize()
requestAnimationFrame(frame)
