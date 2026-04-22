// 2D affine matrix utilities: [a, b, c, d, e, f] for
//   | a c e |
//   | b d f |
//   | 0 0 1 |

export type Mat = [number, number, number, number, number, number];

export const identity = (): Mat => [1, 0, 0, 1, 0, 0];

export function multiply(m1: Mat, m2: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

export function translate(m: Mat, tx: number, ty: number): Mat {
  return multiply(m, [1, 0, 0, 1, tx, ty]);
}

export function rotate(m: Mat, rad: number): Mat {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return multiply(m, [c, s, -s, c, 0, 0]);
}

export function scale(m: Mat, sx: number, sy: number): Mat {
  return multiply(m, [sx, 0, 0, sy, 0, 0]);
}

export function invert(m: Mat): Mat {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return identity();
  const inv = 1 / det;
  return [d * inv, -b * inv, -c * inv, a * inv, (c * f - d * e) * inv, (b * e - a * f) * inv];
}

export function applyPoint(m: Mat, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}
