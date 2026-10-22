// Orientation, projection, and dice rolls. No DOM, so it runs in Node too.
// The rotation and projection are adapted from
// https://gist.github.com/thomasdarimont/8c694b4522c6cb10d85c

// https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
export const OPS = [
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

// ops that erase everything outside the face they draw
export const WIPES = ['source-in', 'source-out', 'destination-in', 'destination-atop', 'copy']

// Each key's direction, as a turn about the screen's x, y, and z. The z axis
// points into the screen, so a negative turn about it is counterclockwise.
// Spins are [x, y, z] in degrees per frame at 60 fps.
export const KEYS = {
  KeyW: [-1, 0, 0],
  KeyS: [1, 0, 0],
  KeyA: [0, 1, 0],
  KeyD: [0, -1, 0],
  KeyQ: [0, 0, -1],
  KeyE: [0, 0, 1]
}

// degrees per frame at 60 fps: while steering, per press once let go, and at most
export const STEER = 2.4
export const CRUISE = 0.6
export const MAX_CRUISE = 12
// ms a press may last and still count as a tap, and the most that may pass
// between two taps for them to count as a double
export const TAP = 250
export const DOUBLE = 300
// ms for speed to close most of the gap to where it is headed
export const EASE = 70

const size = (v) => Math.hypot(...v)
const times = (v, k) => v.map((c) => c * k)
export const STILL = Object.freeze([0, 0, 0])

// true when v is moving along unit direction dir
export function aligned(v, dir) {
  const n = size(v)
  return n > 0 && v.reduce((s, c, i) => s + c * dir[i], 0) / n > 0.8
}

// Where the spin goes once a gesture ends. Owned is a spin a double tap set
// off, which another tap the same way speeds up. Otherwise a double tap lets
// the shape spin and anything else leaves it still.
export function settle({ owned, last }, { dir, tap, start, end }) {
  let cruise = STILL
  if (tap && aligned(owned, dir)) {
    cruise = times(dir, Math.min(MAX_CRUISE, size(owned) + CRUISE))
  } else if (tap && last && start - last.at < DOUBLE && aligned(last.dir, dir)) {
    cruise = times(dir, CRUISE)
  }
  return { cruise, last: tap && size(dir) ? { dir, at: end } : null }
}

// degrees turned per pixel dragged
export const DRAG = 0.5

// share of the drag's own speed that a fling carries on at
export const FLING = 0.2

// the spin a drag leaves when let go while moving dx, dy px over ms, in
// degrees per frame at 60 fps
export function fling(dx, dy, ms) {
  const k = (FLING * DRAG * (1000 / 60)) / Math.max(1, ms)
  const spin = [dy * k, -dx * k, 0]
  const n = size(spin)
  return n > MAX_CRUISE ? times(spin, MAX_CRUISE / n) : spin
}

// v eased toward target over ms, the same at any frame rate
export function approach(v, target, ms, ease = EASE) {
  const k = 1 - Math.exp(-ms / ease)
  return v.map((c, i) => c + (target[i] - c) * k)
}

export function unit(v) {
  const n = size(v)
  return n ? times(v, 1 / n) : v.map(() => 0)
}

// shape and effect steps back and forward
export const SHAPE_KEYS = {
  BracketLeft: -1,
  BracketRight: 1
}
export const EFFECT_KEYS = {
  Comma: -1,
  Period: 1
}

// zoom factor per press
export const ZOOM_KEYS = {
  Equal: 1.15,
  Minus: 1 / 1.15
}

export const ACTIONS = {
  KeyR: 'reroll',
  Space: 'pause',
  KeyL: 'light',
  KeyI: 'info'
}

// ops that draw nothing on an empty canvas
export const UNSEEN = ['source-in', 'source-atop', 'destination-in', 'destination-out']
// ops shown against a card: the unseen ones, and the wipes, which face over
// face would leave only the last face
export const CARDED = [...new Set([...UNSEEN, ...WIPES])]

// how faces are drawn, in menu order: wireframe, solid, one op for every
// face, or every op mixed
export const EFFECTS = ['wire', 'solid', ...OPS, 'mixed']

// a line on each effect whose name does not say it. Most single ops draw
// face over face, far to near. The CARDED ones draw the whole shape over a card.
export const NOTES = {
  wire: 'edges only with hidden ones dashed',
  solid: 'faces shaded by angle to light',
  mixed: 'random op per face',
  'source-over': 'source drawn over destination',
  'source-in': 'source kept only inside destination',
  'source-out': 'source kept only outside destination',
  'source-atop': 'source drawn only over destination',
  'destination-over': 'source drawn behind destination',
  'destination-in': 'destination kept only inside source',
  'destination-out': 'source erases destination',
  'destination-atop': 'destination kept inside source with source behind',
  lighter: 'colors added',
  copy: 'source replaces destination',
  xor: 'overlap cleared',
  multiply: 'colors multiplied toward dark',
  screen: 'inverted colors multiplied toward light',
  overlay: 'multiply on dark destination and screen on light',
  darken: 'darker of each channel kept',
  lighten: 'lighter of each channel kept',
  'color-dodge': 'destination brightened by source',
  'color-burn': 'destination darkened by source',
  'hard-light': 'overlay keyed on source',
  'soft-light': 'softer hard-light',
  difference: 'absolute difference of colors',
  exclusion: 'difference with lower contrast',
  hue: 'source hue with destination saturation and luminosity',
  saturation: 'source saturation with destination hue and luminosity',
  color: 'source hue and saturation with destination luminosity',
  luminosity: 'source luminosity with destination hue and saturation'
}

// degrees per frame at 60 fps that a fresh shape drifts
export const DRIFT = 0.1

// Orientation is a unit quaternion [w, x, y, z]. Turning vertices in place
// lets rounding error pile up until the shape warps, while one quaternion
// renormalized each step stays a pure rotation.
export const IDENTITY = [1, 0, 0, 0]

export function multiply([aw, ax, ay, az], [bw, bx, by, bz]) {
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw
  ]
}

function about(axis, degrees) {
  const half = (degrees * Math.PI) / 360
  const s = Math.sin(half)
  return [Math.cos(half), axis[0] * s, axis[1] * s, axis[2] * s]
}

// turned about the screen's x axis, then its y, then its z, in degrees
export function turn(q, ax, ay, az = 0) {
  const next = multiply(
    about([0, 0, 1], az),
    multiply(about([0, 1, 0], ay), multiply(about([1, 0, 0], ax), q))
  )
  const n = Math.hypot(...next)
  return next.map((c) => c / n)
}

export function apply([w, x, y, z], [vx, vy, vz]) {
  // v + 2w(u × v) + 2u × (u × v), with u the vector part
  const cx = y * vz - z * vy
  const cy = z * vx - x * vz
  const cz = x * vy - y * vx
  return [
    vx + 2 * (w * cx + y * cz - z * cy),
    vy + 2 * (w * cy + z * cx - x * cz),
    vz + 2 * (w * cz + x * cy - y * cx)
  ]
}

// degrees turned and the unit axis turned about, the short way round
export function axisAngle([w, x, y, z]) {
  const sign = w < 0 ? -1 : 1
  const s = Math.hypot(x, y, z)
  if (s < 1e-9) return [0, [0, 0, 1]]
  return [(2 * Math.atan2(s, Math.abs(w)) * 180) / Math.PI, [x, y, z].map((c) => (sign * c) / s)]
}

// how far the eye sits in front of the center, in shape units
export const DISTANCE = 6

// how far in and out a zoom may go
export const ZOOM = [0.3, 4]

export function zoomBy(zoom, factor) {
  return Math.min(ZOOM[1], Math.max(ZOOM[0], zoom * factor))
}

// perspective onto a width by height view, its field of view the shorter side,
// so a phone held upright fits the cube across, times the zoom
export function project([x, y, z], width, height, zoom = 1, distance = DISTANCE) {
  const factor = (zoom * Math.min(width, height)) / (distance + z)
  return [x * factor + width / 2, y * factor + height / 2]
}

// an index below n, never the current one unless there is no other
export function other(n, current, random = Math.random) {
  if (n < 2) return 0
  const pick = Math.floor(random() * (n - 1))
  return pick >= current ? pick + 1 : pick
}

// v at the same speed in a direction across the screen picked at random
export function redirect(v, random = Math.random) {
  const a = random() * 2 * Math.PI
  return times([Math.cos(a), Math.sin(a), 0], size(v))
}

export function drift(random = Math.random) {
  return [random() < 0.5 ? DRIFT : -DRIFT, random() < 0.5 ? DRIFT : -DRIFT, 0]
}

// hue offsets of each harmony, in degrees around the color wheel
// degrees a face's hue may stray from its harmony hue
export const HUE_JITTER = 18

export const HARMONIES = {
  analogous: [-60, -30, 0, 30, 60],
  complementary: [-20, 0, 20, 160, 180, 200],
  triadic: [0, 120, 240],
  split: [0, 150, 210],
  tetradic: [0, 90, 180, 270],
  pentadic: [0, 72, 144, 216, 288],
  hexadic: [0, 60, 120, 180, 240, 300],
  // every hue, a step apart, for the most colors at once
  rainbow: Array.from({ length: 12 }, (_, i) => i * 30)
}

// A stroke, a fill and its opaque twin, and a composite op for each of n
// faces, all from one harmony around a base hue, which the shaded modes use.
// OKLCH keeps lightness and chroma even from hue to hue. Ops run through
// every one before any repeats. After the first 26 the wipes sit out, or on
// a shape with many faces the last wipe would leave one face standing.
export function roll(n, random = Math.random) {
  const hue = Math.floor(random() * 360)
  const names = Object.keys(HARMONIES)
  const harmony = names[Math.floor(random() * names.length)]
  const offsets = HARMONIES[harmony]
  const between = (lo, hi) => lo + random() * (hi - lo)
  let ops = []
  let rounds = 0
  const faces = Array.from({ length: n }, () => {
    if (!ops.length) ops = rounds++ ? OPS.filter((op) => !WIPES.includes(op)) : [...OPS]
    const h =
      (hue +
        offsets[Math.floor(random() * offsets.length)] +
        between(-HUE_JITTER, HUE_JITTER) +
        360) %
      360
    // soft pastels, kept off the brightest end
    const l = between(0.66, 0.8)
    const c = between(0.04, 0.14)
    const color = `${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)}`
    return {
      stroke: `oklch(${(l - 0.18).toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)} / 0.9)`,
      fill: `oklch(${color} / 0.9)`,
      solid: `oklch(${color})`,
      op: ops.splice(Math.floor(random() * ops.length), 1)[0]
    }
  })
  return { faces, hue, harmony }
}
