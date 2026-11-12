/**
 * Pure TypeScript RFC 8032 Ed25519 Public Key Derivation
 * Zero external dependencies — uses BigInt + Web Crypto SHA-512.
 */

const P = (1n << 255n) - 19n;

function mod(a: bigint, m: bigint = P): bigint {
  const res = a % m;
  return res >= 0n ? res : res + m;
}

function powMod(base: bigint, exp: bigint, m: bigint = P): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b, m);
    b = mod(b * b, m);
    e >>= 1n;
  }
  return result;
}

function inv(a: bigint): bigint {
  return powMod(a, P - 2n, P);
}

// Ed25519 curve constants: -x^2 + y^2 = 1 + d*x^2*y^2
const D = mod(-121665n * inv(121666n));
const I_SQRT_MINUS_1 = powMod(2n, (P - 1n) / 4n);

// Base point B
const BY = mod(4n * inv(5n));
function recoverX(y: bigint): bigint {
  const y2 = mod(y * y);
  const xx = mod(mod(y2 - 1n) * inv(mod(D * y2 + 1n)));
  let x = powMod(xx, (P + 3n) / 8n);
  if (mod(x * x) !== xx) {
    x = mod(x * I_SQRT_MINUS_1);
  }
  if ((x & 1n) !== 0n) {
    x = P - x;
  }
  return x;
}
const BX = recoverX(BY);

interface ExtPoint {
  X: bigint;
  Y: bigint;
  Z: bigint;
  T: bigint;
}

const ZERO_POINT: ExtPoint = { X: 0n, Y: 1n, Z: 1n, T: 0n };
const BASE_POINT: ExtPoint = { X: BX, Y: BY, Z: 1n, T: mod(BX * BY) };

function pointAdd(p1: ExtPoint, p2: ExtPoint): ExtPoint {
  const A = mod((p1.Y - p1.X) * (p2.Y - p2.X));
  const B = mod((p1.Y + p1.X) * (p2.Y + p2.X));
  const C = mod(2n * p1.T * p2.T * D);
  const D_term = mod(2n * p1.Z * p2.Z);
  const E = mod(B - A);
  const F = mod(D_term - C);
  const G = mod(D_term + C);
  const H = mod(B + A);
  return {
    X: mod(E * F),
    Y: mod(G * H),
    Z: mod(F * G),
    T: mod(E * H),
  };
}

function pointDouble(p: ExtPoint): ExtPoint {
  const A = mod(p.X * p.X);
  const B = mod(p.Y * p.Y);
  const C = mod(2n * p.Z * p.Z);
  const D_term = mod(-A); // a = -1
  const E = mod(mod((p.X + p.Y) * (p.X + p.Y)) - A - B);
  const G = mod(D_term + B);
  const F = mod(G - C);
  const H = mod(D_term - B);
  return {
    X: mod(E * F),
    Y: mod(G * H),
    Z: mod(F * G),
    T: mod(E * H),
  };
}

function scalarMult(scalar: bigint, point: ExtPoint = BASE_POINT): ExtPoint {
  let res = ZERO_POINT;
  let addend = point;
  let k = scalar;
  while (k > 0n) {
    if (k & 1n) res = pointAdd(res, addend);
    addend = pointDouble(addend);
    k >>= 1n;
  }
  return res;
}

function encodePoint(p: ExtPoint): Uint8Array {
  const zInv = inv(p.Z);
  const x = mod(p.X * zInv);
  const y = mod(p.Y * zInv);
  const out = new Uint8Array(32);
  let tmp = y;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  if ((x & 1n) !== 0n) {
    out[31] |= 0x80;
  }
  return out;
}

/**
 * Derive the 32-byte RFC 8032 Ed25519 public key from a 32-byte private seed.
 */
export async function ed25519PublicKeyFromSeed(seed32: Uint8Array): Promise<Uint8Array> {
  if (seed32.length !== 32) {
    throw new Error(`Expected 32-byte Ed25519 seed, got ${seed32.length} bytes`);
  }

  const digestBuf = await crypto.subtle.digest('SHA-512', seed32 as unknown as BufferSource);
  const h = new Uint8Array(digestBuf);

  // RFC 8032 §5.1.5 clamping
  h[0] &= 248;
  h[31] &= 127;
  h[31] |= 64;

  // Little-endian 32-byte scalar
  let scalar = 0n;
  for (let i = 31; i >= 0; i--) {
    scalar = (scalar << 8n) | BigInt(h[i]);
  }

  return encodePoint(scalarMult(scalar));
}

