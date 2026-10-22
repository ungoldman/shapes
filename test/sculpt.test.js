import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blend, mesh } from '../src/sculpt.js'

const sphere = (r) => (p) => Math.hypot(...p) - r

function euler({ vertices, faces }) {
  const edges = new Set()
  for (const face of faces) {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]
      edges.add(a < b ? `${a},${b}` : `${b},${a}`)
    })
  }
  return vertices.length - edges.size + faces.length
}

function volume({ vertices, faces }) {
  let v = 0
  for (const [a, b, c] of faces.map((f) => f.map((i) => vertices[i]))) {
    v +=
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])
  }
  return v / 6
}

test('a meshed sphere is closed, outward, and about the right size', () => {
  const m = mesh(sphere(1), [-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 0.2)
  assert.equal(euler(m), 2)
  const v = volume(m)
  assert.ok(v > 0 && Math.abs(v - (4 / 3) * Math.PI) < 0.3, String(v))
})

test('a field that lands on grid corners, either side of zero, still closes', () => {
  // radius 1 on a 0.25 grid puts corners exactly on the surface
  for (const nudge of [0, -1e-12, 1e-12]) {
    const m = mesh((p) => sphere(1)(p) + nudge, [-1.5, -1.5, -1.5], [1.5, 1.5, 1.5], 0.25)
    assert.equal(euler(m), 2)
    assert.ok(volume(m) > 0)
  }
})

test('blend joins two spheres into one piece', () => {
  const two = blend(
    [(p) => sphere(0.6)([p[0] - 0.5, p[1], p[2]]), (p) => sphere(0.6)([p[0] + 0.5, p[1], p[2]])],
    0.2
  )
  assert.equal(euler(mesh(two, [-1.3, -0.8, -0.8], [1.3, 0.8, 0.8], 0.1)), 2)
  assert.ok(two([0, 0, 0]) < Math.min(sphere(0.6)([0.5, 0, 0]), 0))
})
