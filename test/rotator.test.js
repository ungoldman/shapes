import assert from 'node:assert/strict'
import { test } from 'node:test'
import fc from 'fast-check'
import {
  ACTIONS,
  aligned,
  apply,
  approach,
  axisAngle,
  CARDED,
  CRUISE,
  DOUBLE,
  DRAG,
  DRIFT,
  drift,
  EFFECT_KEYS,
  EFFECTS,
  FLING,
  fling,
  HARMONIES,
  HUE_JITTER,
  IDENTITY,
  KEYS,
  MAX_CRUISE,
  multiply,
  NOTES,
  OPS,
  other,
  project,
  redirect,
  roll,
  SHAPE_KEYS,
  settle,
  TAP,
  turn,
  UNSEEN,
  unit,
  WIPES,
  ZOOM,
  ZOOM_KEYS,
  zoomBy
} from '../src/rotator.js'

const angle = fc.double({ min: -720, max: 720, noNaN: true })
const fraction = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true })
const point = fc.tuple(...[0, 1, 2].map(() => fc.double({ min: -2, max: 2, noNaN: true })))

function close(a, b, epsilon = 1e-9) {
  for (const [i, n] of a.entries()) assert.ok(Math.abs(n - b[i]) < epsilon, `${a} vs ${b}`)
}

test('a turn stays a unit quaternion and keeps lengths', () => {
  fc.assert(
    fc.property(angle, angle, point, (ax, ay, v) => {
      const q = turn(IDENTITY, ax, ay)
      assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-12)
      assert.ok(Math.abs(Math.hypot(...apply(q, v)) - Math.hypot(...v)) < 1e-9)
    })
  )
})

test('ten thousand small turns do not drift from a pure rotation', () => {
  let q = IDENTITY
  for (let i = 0; i < 10000; i++) q = turn(q, 0.37, -0.53)
  assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-12)
  assert.ok(Math.abs(Math.hypot(...apply(q, [1, 1, 1])) - Math.sqrt(3)) < 1e-9)
})

test('no turn and a full turn both leave a point where it was', () => {
  close(apply(IDENTITY, [1, 2, 3]), [1, 2, 3])
  close(apply(turn(IDENTITY, 360, -360), [1, 2, 3]), [1, 2, 3])
})

test('a quarter turn about each screen axis moves a point where expected', () => {
  close(apply(turn(IDENTITY, 90, 0), [1, 1, 1]), [1, -1, 1])
  close(apply(turn(IDENTITY, 0, 90), [1, 1, 1]), [1, 1, -1])
})

test('turns compose the way the screen sees them, x then y', () => {
  const q = turn(IDENTITY, 90, 90)
  close(apply(q, [0, 1, 0]), apply(turn(IDENTITY, 0, 90), apply(turn(IDENTITY, 90, 0), [0, 1, 0])))
})

test('multiplying by the identity changes nothing', () => {
  const q = turn(IDENTITY, 30, 40)
  close(multiply(IDENTITY, q), q)
  close(multiply(q, IDENTITY), q)
})

test('axis and angle read back the turn, the short way round', () => {
  const [deg, axis] = axisAngle(turn(IDENTITY, 0, 90))
  close([deg], [90])
  close(axis, [0, 1, 0])
  const [back, flipped] = axisAngle(turn(IDENTITY, 0, 270))
  close([back], [90])
  close(flipped, [0, -1, 0])
  assert.deepEqual(axisAngle(IDENTITY), [0, [0, 0, 1]])
})

test('the center projects to the middle of the view', () => {
  assert.deepEqual(project([0, 0, 0], 800, 600), [400, 300])
})

test('the field of view is the shorter side', () => {
  assert.deepEqual(project([1, 1, 0], 800, 600), project([1, 1, 0], 600, 800).reverse())
})

test('zoom scales distance from the middle', () => {
  const [x] = project([1, 0, 0], 800, 600)
  const [zoomed] = project([1, 0, 0], 800, 600, 2)
  assert.equal(zoomed - 400, 2 * (x - 400))
})

test('zoom stays within its range', () => {
  assert.equal(zoomBy(1, 2), 2)
  assert.equal(zoomBy(3, 10), ZOOM[1])
  assert.equal(zoomBy(0.5, 0.01), ZOOM[0])
  assert.equal(zoomBy(1, ZOOM_KEYS.Equal * ZOOM_KEYS.Minus), 1)
})

test('a nearer point projects further from the middle', () => {
  const [near] = project([1, 0, -1], 800, 600)
  const [far] = project([1, 0, 1], 800, 600)
  assert.ok(near > far && far > 400)
})

test('other never picks the current index, and reaches every other one', () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 12 }), fraction, (n, r) => {
      const current = Math.floor(r * n)
      const seen = new Set()
      for (let i = 0; i < n - 1; i++) seen.add(other(n, current, () => (i + 0.5) / (n - 1)))
      assert.ok(!seen.has(current))
      assert.equal(seen.size, n - 1)
    })
  )
  assert.equal(other(1, 0), 0)
})

const tap = (dir, start) => ({ dir, tap: true, start, end: start + 60 })
const none = { owned: [0, 0, 0], last: null }

const O = [0, 0, 0]

test('a lone tap or a hold leaves the shape still', () => {
  assert.deepEqual(settle(none, tap([-1, 0, 0], 0)).cruise, O)
  assert.deepEqual(settle(none, { dir: [1, 0, 0], tap: false, start: 0, end: 900 }), {
    cruise: O,
    last: null
  })
})

test('a double tap lets it spin that way, diagonals and rolls too', () => {
  for (const dir of [unit([-1, 1, 0]), [0, 0, -1]]) {
    const first = settle(none, tap(dir, 1000))
    const second = settle({ owned: O, last: first.last }, tap(dir, 1060 + DOUBLE - 1))
    close(
      second.cruise,
      dir.map((c) => c * CRUISE)
    )
    assert.deepEqual(settle({ owned: O, last: first.last }, tap(dir, 1060 + DOUBLE)).cruise, O)
    assert.deepEqual(settle({ owned: O, last: first.last }, tap([1, 0, 0], 1100)).cruise, O)
  }
})

test('a hold between taps breaks the double', () => {
  const held = settle(none, { dir: [0, 1, 0], tap: false, start: 0, end: 600 })
  assert.equal(held.last, null)
  assert.deepEqual(settle({ owned: O, last: held.last }, tap([0, 1, 0], 650)).cruise, O)
})

test('a tap along a spin it set off speeds it up, to a limit', () => {
  let state = { owned: [0, CRUISE, 0], last: null }
  state = { ...state, owned: settle(state, tap([0, 1, 0], 0)).cruise }
  assert.deepEqual(state.owned, [0, 2 * CRUISE, 0])
  for (let i = 0; i < 100; i++) state.owned = settle(state, tap([0, 1, 0], i * 1000)).cruise
  assert.deepEqual(state.owned, [0, MAX_CRUISE, 0])
})

test('a tap across or against the spin stops it', () => {
  for (const dir of [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1]
  ]) {
    assert.deepEqual(settle({ owned: [0, 1, 0], last: null }, tap(dir, 0)).cruise, O)
  }
})

test('a tap with no direction, from opposite keys, goes nowhere', () => {
  assert.deepEqual(settle(none, tap(O, 0)), { cruise: O, last: null })
  assert.ok(TAP > 60)
})

test('Q and E roll the shape about the axis into the screen', () => {
  assert.deepEqual(KEYS.KeyQ, [0, 0, -1])
  assert.deepEqual(KEYS.KeyE, [0, 0, 1])
  // with y down the screen, a positive turn about z swings right into down
  close(apply(turn(IDENTITY, 0, 0, 90), [1, 0, 0]), [0, 1, 0])
  close(apply(turn(IDENTITY, 0, 0, -90), [1, 0, 0]), [0, -1, 0])
})

test('a fling keeps the drag going at the speed it was let go', () => {
  close(fling(60, 0, 100), [0, -(60 / 100) * FLING * DRAG * (1000 / 60), 0])
  close(fling(0, -30, 50), [-(30 / 50) * FLING * DRAG * (1000 / 60), 0, 0])
  assert.ok(Math.abs(Math.hypot(...fling(5000, 5000, 1)) - MAX_CRUISE) < 1e-9)
  assert.deepEqual(fling(10, 0, 0), fling(10, 0, 1))
})

test('alignment needs motion close to the direction', () => {
  assert.ok(aligned([0, 2, 0], [0, 1, 0]))
  assert.ok(!aligned(O, [0, 1, 0]))
  assert.ok(!aligned([1, 1, 0], [0, 1, 0]))
  assert.ok(!aligned([0, 1, 0], [0, 0, 1]))
})

test('easing lands the same at any frame rate', () => {
  const once = approach(O, [10, -4, 2], 32)
  const twice = approach(approach(O, [10, -4, 2], 16), [10, -4, 2], 16)
  close(once, twice)
  assert.ok(once[0] > 0 && once[0] < 10)
  close(approach([3, 3, 3], [3, 3, 3], 500), [3, 3, 3])
})

test('unit scales to length one and leaves zero alone', () => {
  close(unit([3, 4, 0]), [0.6, 0.8, 0])
  assert.deepEqual(unit(O), O)
})

test('redirect keeps the speed and turns the direction across the screen', () => {
  fc.assert(
    fc.property(
      fraction,
      fc.double({ min: -5, max: 5, noNaN: true }),
      fc.double({ min: -5, max: 5, noNaN: true }),
      fc.double({ min: -5, max: 5, noNaN: true }),
      (r, x, y, z) => {
        const v = redirect([x, y, z], () => r)
        assert.ok(Math.abs(Math.hypot(...v) - Math.hypot(x, y, z)) < 1e-9)
        assert.equal(v[2], 0)
      }
    )
  )
  close(
    redirect([0, 2, 0], () => 0),
    [2, 0, 0]
  )
  close(
    redirect([0, 2, 0], () => 0.25),
    [0, 2, 0]
  )
})

test('drift goes either way on each axis across the screen', () => {
  assert.deepEqual(
    drift(() => 0),
    [DRIFT, DRIFT, 0]
  )
  assert.deepEqual(
    drift(() => 0.9),
    [-DRIFT, -DRIFT, 0]
  )
})

test('a roll uses every op before any repeats', () => {
  fc.assert(
    fc.property(fc.infiniteStream(fraction), fc.integer({ min: 1, max: 130 }), (s, n) => {
      const stream = s[Symbol.iterator]()
      const { faces, hue } = roll(n, () => stream.next().value)
      assert.equal(faces.length, n)
      assert.ok(Number.isInteger(hue) && hue >= 0 && hue < 360)
      const first = faces.slice(0, OPS.length).map((f) => f.op)
      assert.equal(new Set(first).size, first.length)
      const rest = OPS.length - WIPES.length
      for (let i = OPS.length; i < n; i += rest) {
        const block = faces.slice(i, i + rest).map((f) => f.op)
        assert.equal(new Set(block).size, block.length)
        assert.ok(block.every((op) => !WIPES.includes(op)))
      }
      for (const { stroke, fill, solid, op } of faces) {
        assert.ok(OPS.includes(op))
        assert.equal(solid, fill.replace(' / 0.9)', ')'))
        for (const color of [stroke, fill]) {
          const [l, c, h] = color.match(/[\d.]+/g).map(Number)
          assert.match(color, /^oklch\([\d.]+ [\d.]+ [\d.]+ \/ 0\.9\)$/)
          assert.ok(l > 0.45 && l <= 0.8 && c >= 0.04 && c <= 0.14 && h >= 0 && h < 360, color)
        }
      }
    })
  )
})

test('every face hue sits within the jitter of a harmony hue', () => {
  fc.assert(
    fc.property(fc.infiniteStream(fraction), (stream) => {
      const it = stream[Symbol.iterator]()
      const { faces, hue, harmony } = roll(40, () => it.next().value)
      const targets = HARMONIES[harmony].map((o) => (hue + o + 360) % 360)
      for (const { fill } of faces) {
        const h = Number(fill.match(/[\d.]+/g)[2])
        const near = targets.some(
          (t) => Math.min(Math.abs(h - t), 360 - Math.abs(h - t)) <= HUE_JITTER + 0.1
        )
        assert.ok(near, `${h} not near ${targets}`)
      }
    })
  )
})

test('the ops are all real composite ops, each once', () => {
  assert.equal(OPS.length, 26)
  assert.equal(new Set(OPS).size, 26)
  assert.ok(WIPES.every((op) => OPS.includes(op)))
})

test('keys and actions are event codes', () => {
  for (const code of [...Object.keys(KEYS), ...Object.keys(ACTIONS)])
    assert.match(code, /^(Key[A-Z]|Space)$/)
  assert.deepEqual(new Set(Object.values(ACTIONS)), new Set(['reroll', 'light', 'pause', 'info']))
  assert.deepEqual(Object.values(SHAPE_KEYS), [-1, 1])
  assert.deepEqual(Object.values(EFFECT_KEYS), [-1, 1])
  assert.deepEqual(EFFECTS.slice(0, 2), ['wire', 'solid'])
  assert.deepEqual(EFFECTS.slice(2, -1), OPS)
  assert.equal(EFFECTS.at(-1), 'mixed')
  assert.ok(UNSEEN.every((op) => OPS.includes(op)))
  assert.deepEqual(new Set(CARDED), new Set([...UNSEEN, ...WIPES]))
  assert.deepEqual(
    Object.keys(NOTES).sort(),
    EFFECTS.filter((e) => e !== 'solid' && e !== 'wire').sort()
  )
  for (const note of Object.values(NOTES)) assert.ok(!note.includes(',') && note.length <= 56, note)
})
