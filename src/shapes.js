// The shapes, each as vertices and faces. No DOM, so it runs in Node too.
// Faces wind counterclockwise seen from outside, so a face's normal points out.

const PHI = (1 + Math.sqrt(5)) / 2
// circumradius every shape is scaled to, the old cube's
const SIZE = Math.sqrt(3)

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a) => Math.hypot(...a)
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const unit = (a) => scale(a, 1 / length(a))

export function centroid(points) {
  const sum = points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
  return scale(sum, 1 / points.length)
}

// Newell's method, which holds for any planar polygon, unit length
export function normal(points) {
  const n = [0, 0, 0]
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]
    n[0] += (p[1] - q[1]) * (p[2] + q[2])
    n[1] += (p[2] - q[2]) * (p[0] + q[0])
    n[2] += (p[0] - q[0]) * (p[1] + q[1])
  })
  return scale(n, 1 / length(n))
}

// every undirected edge once, with the faces either side of it
export function edges(faces) {
  const found = new Map()
  faces.forEach((face, f) => {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]
      const key = a < b ? `${a},${b}` : `${b},${a}`
      if (!found.has(key)) found.set(key, [Math.min(a, b), Math.max(a, b), []])
      found.get(key)[2].push(f)
    })
  })
  return [...found.values()]
}

// a convex shape's faces, turned so each normal points away from the center
function outward(vertices, faces) {
  return faces.map((face) => {
    const points = face.map((i) => vertices[i])
    return dot(normal(points), centroid(points)) < 0 ? [...face].reverse() : face
  })
}

// the triangles of a convex shape whose edges all share one length
function triangles(vertices) {
  let shortest = Infinity
  for (const a of vertices) {
    for (const b of vertices) if (a !== b) shortest = Math.min(shortest, length(sub(a, b)))
  }
  const near = (i, j) => Math.abs(length(sub(vertices[i], vertices[j])) - shortest) < 1e-9
  const faces = []
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        if (near(i, j) && near(j, k) && near(i, k)) faces.push([i, j, k])
      }
    }
  }
  return faces
}

// The faces of any convex shape: every plane through three vertices with
// the rest on one side, its vertices in order around it. Coplanar faces
// merge, so a cylinder's cap is one polygon.
export function hull(vertices) {
  const faces = []
  const seen = new Set()
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = vertices[i]
        const raw = cross(sub(vertices[j], a), sub(vertices[k], a))
        if (length(raw) < 1e-9) continue
        const nrm = unit(raw)
        const d = dot(nrm, a)
        let above = 0
        let below = 0
        const on = []
        vertices.forEach((v, m) => {
          const side = dot(nrm, v) - d
          if (side > 1e-7) above++
          else if (side < -1e-7) below++
          else on.push(m)
        })
        const key = on.join()
        if ((above && below) || seen.has(key)) continue
        seen.add(key)
        const c = centroid(on.map((m) => vertices[m]))
        const u = sub(vertices[on[0]], c)
        const w = cross(nrm, u)
        const angle = (m) => Math.atan2(dot(sub(vertices[m], c), w), dot(sub(vertices[m], c), u))
        faces.push(on.sort((x, y) => angle(x) - angle(y)))
      }
    }
  }
  return faces
}

function fit(vertices) {
  const r = Math.max(...vertices.map(length))
  return vertices.map((v) => scale(v, SIZE / r))
}

function convex(vertices, faces = hull(vertices)) {
  const fitted = fit(vertices)
  return { vertices: fitted, faces: outward(fitted, faces) }
}

function triangle() {
  const vertices = [0, 1, 2].map((i) => {
    const a = (i * 2 * Math.PI) / 3 - Math.PI / 2
    return [Math.cos(a), Math.sin(a), 0]
  })
  return { vertices: fit(vertices), faces: [[0, 2, 1]], twoSided: true }
}

function tetrahedron() {
  const vertices = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1]
  ]
  return convex(vertices, triangles(vertices))
}

function cube() {
  const vertices = [
    [-1, 1, -1],
    [1, 1, -1],
    [1, -1, -1],
    [-1, -1, -1],
    [-1, 1, 1],
    [1, 1, 1],
    [1, -1, 1],
    [-1, -1, 1]
  ]
  const faces = [
    [0, 1, 2, 3],
    [1, 5, 6, 2],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [0, 4, 5, 1],
    [3, 2, 6, 7]
  ]
  return convex(vertices, faces)
}

function octahedron() {
  const vertices = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ]
  return convex(vertices, triangles(vertices))
}

function icosahedron() {
  const vertices = []
  for (const a of [-1, 1]) {
    for (const b of [-PHI, PHI]) vertices.push([0, a, b], [a, b, 0], [b, 0, a])
  }
  return convex(vertices, triangles(vertices))
}

// the icosahedron's dual: a vertex at each of its face centers, and a
// pentagon around each of its vertices
function dodecahedron() {
  const ico = icosahedron()
  const vertices = ico.faces.map((face) => centroid(face.map((i) => ico.vertices[i])))
  const faces = ico.vertices.map((v) => {
    const around = ico.faces.flatMap((face, f) =>
      face.some((i) => ico.vertices[i] === v) ? [f] : []
    )
    // sort the five by angle about the axis through v
    const axis = scale(v, 1 / length(v))
    const u = sub(vertices[around[0]], scale(axis, dot(vertices[around[0]], axis)))
    const w = [
      axis[1] * u[2] - axis[2] * u[1],
      axis[2] * u[0] - axis[0] * u[2],
      axis[0] * u[1] - axis[1] * u[0]
    ]
    const angle = (f) => Math.atan2(dot(vertices[f], w), dot(vertices[f], u))
    return around.sort((a, b) => angle(a) - angle(b))
  })
  return convex(vertices, faces)
}

function sphere(segments = 12, rings = 8) {
  const vertices = [[0, -1, 0]]
  for (let r = 1; r < rings; r++) {
    const lat = (r / rings) * Math.PI - Math.PI / 2
    for (let s = 0; s < segments; s++) {
      const lon = (s / segments) * 2 * Math.PI
      vertices.push([Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)])
    }
  }
  vertices.push([0, 1, 0])
  const at = (r, s) => 1 + (r - 1) * segments + (s % segments)
  const top = vertices.length - 1
  const faces = []
  for (let s = 0; s < segments; s++) {
    faces.push([0, at(1, s), at(1, s + 1)])
    for (let r = 1; r < rings - 1; r++)
      faces.push([at(r, s), at(r + 1, s), at(r + 1, s + 1), at(r, s + 1)])
    faces.push([at(rings - 1, s), top, at(rings - 1, s + 1)])
  }
  return convex(vertices, faces)
}

function ring(count, radius, y, turn = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = ((i + turn) / count) * 2 * Math.PI
    return [radius * Math.cos(a), y, radius * Math.sin(a)]
  })
}

function pyramid() {
  return convex([[0, 1, 0], ...ring(4, 1.2, -0.7, 0.5)])
}

function prism(sides = 3) {
  return convex([...ring(sides, 1, 0.8), ...ring(sides, 1, -0.8)])
}

function cuboctahedron() {
  const vertices = []
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) vertices.push([a, b, 0], [a, 0, b], [0, a, b])
  }
  return convex(vertices)
}

function cone(sides = 24) {
  return convex([[0, 1.2, 0], ...ring(sides, 1, -0.8)])
}

function cylinder(sides = 24) {
  return convex([...ring(sides, 1, 0.9), ...ring(sides, 1, -0.9)])
}

// the icosahedron with each triangle split in four, twice, pushed out to the sphere
function geodesic(levels = 2) {
  let { vertices, faces } = icosahedron()
  vertices = vertices.map(unit)
  for (let l = 0; l < levels; l++) {
    const middles = new Map()
    const middle = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`
      if (!middles.has(key)) {
        middles.set(key, vertices.length)
        vertices.push(unit(scale(add(vertices[a], vertices[b]), 0.5)))
      }
      return middles.get(key)
    }
    faces = faces.flatMap(([a, b, c]) => {
      const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)]
      return [
        [a, ab, ca],
        [b, bc, ab],
        [c, ca, bc],
        [ab, bc, ca]
      ]
    })
  }
  return convex(vertices, faces)
}

// Two tetrahedra through each other, drawn as the surface of their union so
// no two faces cross: an octahedron with a spike on each face, a tip at each
// cube corner over the three octahedron corners beside it.
function stellaOctangula() {
  const vertices = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ]
  const faces = []
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        const tip = vertices.push([x, y, z]) - 1
        const [a, b, c] = [x > 0 ? 0 : 1, y > 0 ? 2 : 3, z > 0 ? 4 : 5]
        faces.push([tip, a, b], [tip, b, c], [tip, c, a])
      }
    }
  }
  // star-shaped about the center, so out is away from it
  return { vertices: fit(vertices), faces: outward(vertices, faces) }
}

// One side and one edge: the strip turns half over on its way round, so its
// far edge meets its near one.
function mobius(segments = 48, across = 4) {
  const vertices = []
  for (let s = 0; s < segments; s++) {
    const u = (s / segments) * 2 * Math.PI
    for (let t = 0; t <= across; t++) {
      const v = (t / across - 0.5) * 0.9
      const r = 1 + v * Math.cos(u / 2)
      vertices.push([r * Math.cos(u), v * Math.sin(u / 2), r * Math.sin(u)])
    }
  }
  const at = (s, t) => s * (across + 1) + t
  const faces = []
  for (let s = 0; s < segments; s++) {
    for (let t = 0; t < across; t++) {
      // past the last segment the strip comes back flipped
      const [next, t0, t1] = s + 1 < segments ? [s + 1, t, t + 1] : [0, across - t, across - t - 1]
      faces.push([at(s, t), at(s, t + 1), at(next, t1), at(next, t0)])
    }
  }
  return { vertices: fit(vertices), faces, twoSided: true }
}

// a tube round a closed curve, wound so each face points away from it
function tube(curve, segments, sides, radius) {
  const point = (s) => curve((s / segments) * 2 * Math.PI)
  const vertices = []
  for (let s = 0; s < segments; s++) {
    const p = point(s)
    // Frenet frame from neighbors. Closed and never straight, so it closes.
    const tangent = unit(sub(point(s + 1), point(s - 1)))
    const bend = sub(add(point(s + 1), point(s - 1)), scale(p, 2))
    const nrm = unit(sub(bend, scale(tangent, dot(bend, tangent))))
    const bi = cross(tangent, nrm)
    for (let t = 0; t < sides; t++) {
      const a = (t / sides) * 2 * Math.PI
      vertices.push(add(p, add(scale(nrm, radius * Math.cos(a)), scale(bi, radius * Math.sin(a)))))
    }
  }
  const at = (s, t) => (s % segments) * sides + (t % sides)
  const faces = []
  for (let s = 0; s < segments; s++) {
    for (let t = 0; t < sides; t++) {
      faces.push([at(s, t), at(s, t + 1), at(s + 1, t + 1), at(s + 1, t)])
    }
  }
  return { vertices: fit(vertices), faces }
}

function trefoil() {
  const curve = (t) => [
    Math.sin(t) + 2 * Math.sin(2 * t),
    Math.cos(t) - 2 * Math.cos(2 * t),
    -Math.sin(3 * t)
  ]
  return tube(curve, 72, 8, 0.45)
}

// how far the 4D eye sits from a 4D shape along w
const W_EYE = 3

// A 4D shape that turns through the xw and zw planes, then has w divided out
// in perspective, so its inner parts roll out through the outer ones. Its
// edges meet three or more faces, so it has no inside to cull.
function fourD(corners, faces) {
  const at = (phase) =>
    corners.map(([x, y, z, w]) => {
      const [c1, s1] = [Math.cos(phase), Math.sin(phase)]
      const [x1, w1] = [x * c1 - w * s1, x * s1 + w * c1]
      const [c2, s2] = [Math.cos(phase * 0.6), Math.sin(phase * 0.6)]
      const [z2, w2] = [z * c2 - w1 * s2, z * s2 + w1 * c2]
      const k = W_EYE / (W_EYE - w2)
      return [x1 * k, y * k, z2 * k]
    })
  // one scale for every phase, so it never outgrows the other shapes
  let reach = 0
  for (let i = 0; i < 360; i++) reach = Math.max(reach, ...at((i / 360) * 10 * Math.PI).map(length))
  const morph = (phase) => at(phase).map((v) => scale(v, SIZE / reach))
  return { vertices: morph(0), faces, twoSided: true, morph }
}

// the 4D cube, drawn as its 24 squares
function hypercube() {
  const corners = Array.from({ length: 16 }, (_, i) =>
    [0, 1, 2, 3].map((b) => ((i >> b) & 1 ? 1 : -1))
  )
  const faces = []
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      const rest = [0, 1, 2, 3].filter((k) => k !== a && k !== b)
      for (let fixed = 0; fixed < 4; fixed++) {
        const base = ((fixed & 1) << rest[0]) | ((fixed >> 1) << rest[1])
        faces.push([base, base | (1 << a), base | (1 << a) | (1 << b), base | (1 << b)])
      }
    }
  }
  return fourD(corners, faces)
}

// the 4D octahedron: a corner each way on every axis, and a triangle for
// every three corners on different axes
function sixteenCell() {
  const corners = []
  for (let k = 0; k < 4; k++) {
    for (const sign of [1, -1]) corners.push([0, 1, 2, 3].map((j) => (j === k ? sign : 0)))
  }
  const faces = []
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      for (let c = b + 1; c < 8; c++) {
        if (new Set([a, b, c].map((i) => i >> 1)).size === 3) faces.push([a, b, c])
      }
    }
  }
  return fourD(corners, faces)
}

function rhombicDodecahedron() {
  const vertices = []
  for (const x of [-1, 1])
    for (const y of [-1, 1]) for (const z of [-1, 1]) vertices.push([x, y, z])
  for (let k = 0; k < 3; k++)
    for (const s of [-2, 2]) vertices.push([0, 1, 2].map((j) => (j === k ? s : 0)))
  return convex(vertices)
}

// the soccer ball: the icosahedron with each corner cut back a third
function truncatedIcosahedron() {
  const seeds = [
    [0, 1, 3 * PHI],
    [1, 2 + PHI, 2 * PHI],
    [PHI, 2, 2 * PHI + 1]
  ]
  const vertices = []
  const seen = new Set()
  for (const seed of seeds) {
    for (let r = 0; r < 3; r++) {
      const p = [seed[r % 3], seed[(r + 1) % 3], seed[(r + 2) % 3]]
      for (let signs = 0; signs < 8; signs++) {
        const v = p.map((c, k) => ((signs >> k) & 1 ? -c : c))
        const key = v.map((c) => c.toFixed(6)).join()
        if (!seen.has(key)) {
          seen.add(key)
          vertices.push(v)
        }
      }
    }
  }
  return convex(vertices)
}

// A closed surface from a grid over (u, v) in [0, 1), wrapping both ways.
// Past the last u it comes back with v flipped, the way a Klein bottle does.
function surface(f, nu, nv) {
  const vertices = []
  for (let s = 0; s < nu; s++) {
    for (let t = 0; t < nv; t++) vertices.push(f(s / nu, t / nv))
  }
  const at = (s, t) => (s === nu ? (nv - t) % nv : s * nv + (t % nv))
  const faces = []
  for (let s = 0; s < nu; s++) {
    for (let t = 0; t < nv; t++)
      faces.push([at(s, t), at(s + 1, t), at(s + 1, t + 1), at(s, t + 1)])
  }
  return { vertices: fit(vertices), faces, twoSided: true }
}

// the figure-8 Klein bottle: one side, no edge, passing through itself
function klein() {
  return surface(
    (u, v) => {
      const [a, b] = [u * 2 * Math.PI, v * 2 * Math.PI]
      const r = 2 + Math.cos(a / 2) * Math.sin(b) - Math.sin(a / 2) * Math.sin(2 * b)
      return [
        r * Math.cos(a),
        Math.sin(a / 2) * Math.sin(b) + Math.cos(a / 2) * Math.sin(2 * b),
        r * Math.sin(a)
      ]
    },
    48,
    16
  )
}

// Enneper's minimal surface over a disk, which folds back through itself
function enneper() {
  const rings = 14
  const segments = 48
  const point = (r, a) => {
    const [u, v] = [r * Math.cos(a), r * Math.sin(a)]
    return [u - u ** 3 / 3 + u * v * v, u * u - v * v, v - v ** 3 / 3 + v * u * u]
  }
  const vertices = [point(0, 0)]
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < segments; j++)
      vertices.push(point((i / rings) * 1.4, (j / segments) * 2 * Math.PI))
  }
  const at = (i, j) => 1 + (i - 1) * segments + (j % segments)
  const faces = []
  for (let j = 0; j < segments; j++) {
    faces.push([0, at(1, j), at(1, j + 1)])
    for (let i = 1; i < rings; i++)
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)])
  }
  return { vertices: fit(vertices), faces, twoSided: true }
}

// not convex, so its faces are wound outward by construction
function torus(major = 1.1, minor = 0.45, segments = 16, sides = 8) {
  const vertices = []
  for (let s = 0; s < segments; s++) {
    const u = (s / segments) * 2 * Math.PI
    for (let t = 0; t < sides; t++) {
      const v = (t / sides) * 2 * Math.PI
      const ring = major + minor * Math.cos(v)
      vertices.push([ring * Math.cos(u), minor * Math.sin(v), ring * Math.sin(u)])
    }
  }
  const at = (s, t) => (s % segments) * sides + (t % sides)
  const faces = []
  for (let s = 0; s < segments; s++) {
    for (let t = 0; t < sides; t++)
      faces.push([at(s, t), at(s, t + 1), at(s + 1, t + 1), at(s + 1, t)])
  }
  return { vertices: fit(vertices), faces }
}

// everyday shapes before esoteric ones, then simplest first: by faces, then
// corners, then name
export function order(a, b) {
  return a.esoteric - b.esoteric || a.F - b.F || a.V - b.V || a.name.localeCompare(b.name)
}

export const SHAPES = [
  ['triangle', triangle],
  ['tetrahedron', tetrahedron],
  ['cube', cube],
  ['octahedron', octahedron],
  ['dodecahedron', dodecahedron],
  ['icosahedron', icosahedron],
  ['pyramid', pyramid],
  ['prism', () => prism(3)],
  ['hexagonal prism', () => prism(6)],
  ['cuboctahedron', cuboctahedron],
  ['cone', cone],
  ['cylinder', cylinder],
  ['sphere', sphere],
  ['geodesic sphere', geodesic],
  ['torus', torus],
  ['stella octangula', stellaOctangula],
  ['rhombic dodecahedron', rhombicDodecahedron],
  ['truncated icosahedron', truncatedIcosahedron],
  ['möbius strip', mobius, true],
  ['trefoil knot', trefoil, true],
  ['klein bottle', klein, true],
  ['enneper surface', enneper, true],
  ['hypercube', hypercube, true],
  ['16-cell', sixteenCell, true]
]
  .map(([name, make, esoteric = false]) => {
    const shape = make()
    const lines = edges(shape.faces)
    const V = shape.vertices.length
    const E = lines.length
    const F = shape.faces.length
    return { name, esoteric, twoSided: false, ...shape, edges: lines, V, E, F, euler: V - E + F }
  })
  .sort(order)
