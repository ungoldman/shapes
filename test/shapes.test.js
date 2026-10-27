import assert from 'node:assert/strict'
import { test } from 'node:test'
import { edges, hull, normal, order, SHAPES } from '../src/shapes.js'

const sub = (a, b) => a.map((n, i) => n - b[i])
const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0)
const byName = Object.fromEntries(SHAPES.map((s) => [s.name, s]))
// the strip and the knot twist as they go, so their quads bend a little
const TWISTED = ['möbius strip', 'trefoil knot', 'klein bottle', 'enneper surface']

test('everyday shapes come first, then esoteric ones, each simplest first', () => {
  assert.deepEqual(
    SHAPES.map((s) => s.name),
    [
      'triangle',
      'tetrahedron',
      'pyramid',
      'prism',
      'cube',
      'octahedron',
      'hexagonal prism',
      'rhombic dodecahedron',
      'dodecahedron',
      'cuboctahedron',
      'icosahedron',
      'stella octangula',
      'cone',
      'cylinder',
      'truncated icosahedron',
      'sphere',
      'torus',
      'geodesic sphere',
      'hypercube',
      '16-cell',
      'möbius strip',
      'trefoil knot',
      'enneper surface',
      'klein bottle'
    ]
  )
})

test('ties fall to corners, then to name', () => {
  const a = { esoteric: false, F: 6, V: 8, name: 'a' }
  assert.ok(order(a, { ...a, name: 'b' }) < 0)
  assert.ok(order({ ...a, V: 9 }, a) > 0)
  assert.ok(order({ ...a, esoteric: true, F: 1 }, a) > 0)
})

test('vertex, edge, and face counts', () => {
  // the gridded surfaces vary with their resolution, so they are left out
  const loose = ['enneper surface', 'klein bottle']
  const counts = Object.fromEntries(
    SHAPES.filter((s) => !loose.includes(s.name)).map((s) => [s.name, [s.V, s.E, s.F]])
  )
  assert.deepEqual(counts, {
    triangle: [3, 3, 1],
    tetrahedron: [4, 6, 4],
    cube: [8, 12, 6],
    octahedron: [6, 12, 8],
    dodecahedron: [20, 30, 12],
    icosahedron: [12, 30, 20],
    pyramid: [5, 8, 5],
    prism: [6, 9, 5],
    'hexagonal prism': [12, 18, 8],
    cuboctahedron: [12, 24, 14],
    cone: [25, 48, 25],
    cylinder: [48, 72, 26],
    sphere: [86, 180, 96],
    'geodesic sphere': [162, 480, 320],
    torus: [128, 256, 128],
    'möbius strip': [240, 432, 192],
    'trefoil knot': [576, 1152, 576],
    'stella octangula': [14, 36, 24],
    hypercube: [16, 32, 24],
    '16-cell': [8, 24, 32],
    'rhombic dodecahedron': [14, 24, 12],
    'truncated icosahedron': [60, 90, 32]
  })
})

test('the Euler characteristic', () => {
  const odd = {
    triangle: 1,
    torus: 0,
    'möbius strip': 0,
    'trefoil knot': 0,
    hypercube: 8,
    '16-cell': 16,
    'klein bottle': 0,
    'enneper surface': 1
  }
  for (const s of SHAPES) {
    assert.equal(s.euler, odd[s.name] ?? 2, s.name)
    assert.equal(s.V - s.E + s.F, s.euler)
  }
})

test('faces name real vertices, and are flat unless the surface twists', () => {
  for (const s of SHAPES) {
    const slack = TWISTED.includes(s.name) ? 0.02 : 1e-9
    for (const face of s.faces) {
      assert.ok(
        face.every((i) => Number.isInteger(i) && i >= 0 && i < s.V),
        s.name
      )
      const points = face.map((i) => s.vertices[i])
      const n = normal(points)
      for (const p of points) assert.ok(Math.abs(dot(n, sub(p, points[0]))) < slack, s.name)
    }
  }
})

test('a closed shape runs every edge once each way, so its faces agree', () => {
  for (const s of SHAPES.filter((s) => !s.twoSided)) {
    const runs = new Set()
    for (const face of s.faces) {
      face.forEach((a, i) => {
        const run = `${a},${face[(i + 1) % face.length]}`
        assert.ok(!runs.has(run), s.name)
        runs.add(run)
      })
    }
    for (const run of runs) assert.ok(runs.has(run.split(',').reverse().join()), s.name)
  }
})

test('a closed shape has positive volume, so its faces point out', () => {
  for (const s of SHAPES.filter((s) => !s.twoSided)) {
    let volume = 0
    for (const face of s.faces) {
      const [a, ...rest] = face.map((i) => s.vertices[i])
      for (let i = 0; i < rest.length - 1; i++) {
        const [b, c] = [rest[i], rest[i + 1]]
        volume += dot(a, [
          b[1] * c[2] - b[2] * c[1],
          b[2] * c[0] - b[0] * c[2],
          b[0] * c[1] - b[1] * c[0]
        ])
      }
    }
    assert.ok(volume > 0, s.name)
  }
})

test('a closed shape has two faces on every edge, an open one some with one', () => {
  for (const s of SHAPES) {
    for (const [a, b, faces] of s.edges) {
      assert.ok(a < b)
      // the hypercube meets three squares at every edge, the 16-cell four triangles
      const want = { hypercube: [3], '16-cell': [4] }[s.name] ?? (s.twoSided ? [1, 2] : [2])
      assert.ok(want.includes(faces.length), s.name)
    }
  }
  // the strip's one edge runs round twice before it closes
  assert.equal(byName['möbius strip'].edges.filter(([, , f]) => f.length === 1).length, 96)
})

test('the platonic solids have every vertex on one sphere and every edge one length', () => {
  for (const name of [
    'tetrahedron',
    'cube',
    'octahedron',
    'dodecahedron',
    'icosahedron',
    'cuboctahedron'
  ]) {
    const { vertices, edges: lines } = byName[name]
    for (const v of vertices) assert.ok(Math.abs(Math.hypot(...v) - Math.sqrt(3)) < 1e-9, name)
    const lengths = lines.map(([a, b]) => Math.hypot(...sub(vertices[a], vertices[b])))
    assert.ok(Math.max(...lengths) - Math.min(...lengths) < 1e-9, name)
  }
})

test('the hull merges coplanar faces, so a cylinder has two round caps', () => {
  const caps = byName.cylinder.faces.filter((f) => f.length === 24)
  assert.equal(caps.length, 2)
})

test('the hull skips collinear corners and keeps one face per plane', () => {
  // a square with a midpoint on one edge, under an apex
  const faces = hull([
    [0, 1, 0],
    [-1, 0, -1],
    [0, 0, -1],
    [1, 0, -1],
    [1, 0, 1],
    [-1, 0, 1]
  ])
  assert.equal(faces.length, 5)
  assert.equal(faces.filter((f) => f.length === 5).length, 1)
})

test('the 4D shapes turn and stay in reach', () => {
  for (const [name, n] of [
    ['hypercube', 16],
    ['16-cell', 8]
  ]) {
    const { morph, faces } = byName[name]
    for (let i = 0; i < 50; i++) {
      const points = morph(i * 0.37)
      assert.equal(points.length, n)
      for (const p of points) assert.ok(Math.hypot(...p) <= Math.sqrt(3) + 1e-9)
      // perspective keeps each square flat
      for (const face of faces) {
        const corners = face.map((v) => points[v])
        const n = normal(corners)
        for (const c of corners) assert.ok(Math.abs(dot(n, sub(c, corners[0]))) < 1e-9)
      }
    }
    assert.notDeepEqual(morph(0), morph(1))
  }
})

test('the klein bottle closes up with one side and no edge', () => {
  const k = byName['klein bottle']
  assert.ok(k.edges.every(([, , f]) => f.length === 2))
  assert.equal(k.euler, 0)
})

test('no shape reaches past the old cube', () => {
  for (const s of SHAPES) {
    assert.ok(Math.max(...s.vertices.map((v) => Math.hypot(...v))) <= Math.sqrt(3) + 1e-9, s.name)
  }
})

test('edges are found once each with the faces beside them', () => {
  assert.deepEqual(edges([[0, 1, 2]]), [
    [0, 1, [0]],
    [1, 2, [0]],
    [0, 2, [0]]
  ])
})
