// Smooth closed surfaces from signed distance fields. No DOM, so it runs in
// Node too. The smooth minimum is after Inigo Quilez,
// https://iquilezles.org/articles/smin/

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// polynomial smooth minimum, so parts melt into each other over about k
export function blend(parts, k) {
  return (p) => {
    let d = parts[0](p)
    for (let i = 1; i < parts.length; i++) {
      const e = parts[i](p)
      const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (e - d)) / k))
      d = e + (d - e) * h - k * h * (1 - h)
    }
    return d
  }
}

// each cube split into six tetrahedra around its main diagonal, the same way
// in every cell, so neighbors share their faces and the mesh closes
const TETS = [
  [0, 1, 3, 7],
  [0, 1, 5, 7],
  [0, 2, 3, 7],
  [0, 2, 6, 7],
  [0, 4, 5, 7],
  [0, 4, 6, 7]
]

// Marching tetrahedra over a grid of cells of side step inside [lo, hi].
// Triangles are wound so their normals point to where the field is positive.
export function mesh(field, lo, hi, step) {
  const n = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / step) + 1)
  const at = (x, y, z) => (z * n[1] + y) * n[0] + x
  const values = new Float64Array(n[0] * n[1] * n[2])
  const point = (i) => {
    const x = i % n[0]
    const y = Math.floor(i / n[0]) % n[1]
    const z = Math.floor(i / (n[0] * n[1]))
    return [lo[0] + x * step, lo[1] + y * step, lo[2] + z * step]
  }
  // values near zero are pushed off, so no crossing lands on a corner and no
  // triangle collapses
  const floor = step * 1e-3
  for (let i = 0; i < values.length; i++) {
    const v = field(point(i))
    values[i] = Math.abs(v) < floor ? (v < 0 ? -floor : floor) : v
  }
  const vertices = []
  const crossings = new Map()
  const cross = (a, b) => {
    const key = a < b ? a * values.length + b : b * values.length + a
    if (!crossings.has(key)) {
      const t = values[a] / (values[a] - values[b])
      const [pa, pb] = [point(a), point(b)]
      crossings.set(key, vertices.push(pa.map((c, k) => c + (pb[k] - c) * t)) - 1)
    }
    return crossings.get(key)
  }
  const faces = []
  const emit = (tri, inside, outside) => {
    const [p, q, r] = tri.map((i) => vertices[i])
    const u = sub(q, p)
    const w = sub(r, p)
    const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    faces.push(dot(nrm, sub(point(outside), point(inside))) > 0 ? tri : [tri[0], tri[2], tri[1]])
  }
  for (let z = 0; z < n[2] - 1; z++) {
    for (let y = 0; y < n[1] - 1; y++) {
      for (let x = 0; x < n[0] - 1; x++) {
        const corner = [0, 1, 2, 3, 4, 5, 6, 7].map((c) =>
          at(x + (c & 1), y + ((c >> 1) & 1), z + ((c >> 2) & 1))
        )
        for (const tet of TETS) {
          const ids = tet.map((c) => corner[c])
          const ins = ids.filter((i) => values[i] < 0)
          const outs = ids.filter((i) => values[i] >= 0)
          if (ins.length === 0 || ins.length === 4) continue
          if (ins.length === 1 || ins.length === 3) {
            const [lone, rest] = ins.length === 1 ? [ins[0], outs] : [outs[0], ins]
            emit(
              rest.map((r) => cross(lone, r)),
              ins[0],
              outs[0]
            )
          } else {
            const [a, b] = ins
            const [c, d] = outs
            const quad = [cross(a, c), cross(a, d), cross(b, d), cross(b, c)]
            emit([quad[0], quad[1], quad[2]], a, c)
            emit([quad[0], quad[2], quad[3]], a, c)
          }
        }
      }
    }
  }
  return { vertices, faces }
}
