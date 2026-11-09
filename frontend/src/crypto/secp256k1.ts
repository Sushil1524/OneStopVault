/**
 * Lightweight Zero-Dependency Crypto Primitives:
 * - Keccak-256 (FIPS 202 / Ethereum standard)
 * - secp256k1 Elliptic Curve Scalar Multiplication (using native BigInt)
 * - EIP-55 Mixed-Case Address Checksum
 * - Base58 & Base58Check Encoding (Bitcoin / Solana)
 * - Bech32 Native SegWit Encoding (BIP-173)
 */

// ─── Keccak-256 (SHA-3 / Ethereum Standard) ──────────────────────────────────

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const R = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

export function keccak256(bytes: Uint8Array): Uint8Array {
  const rate = 136; // 1088 bits / 8
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state: bigint[][] = Array(5).fill(0).map(() => Array(5).fill(0n));

  function rotl(x: bigint, n: number): bigint {
    const shift = BigInt(n);
    return ((x << shift) | (x >> (64n - shift))) & 0xffffffffffffffffn;
  }

  for (let b = 0; b < padded.length; b += rate) {
    for (let i = 0; i < rate; i += 8) {
      const x = (i / 8) % 5;
      const y = Math.floor(i / 8 / 5);
      let lane = 0n;
      for (let j = 0; j < 8; j++) {
        lane |= BigInt(padded[b + i + j]) << BigInt(8 * j);
      }
      state[x][y] ^= lane;
    }

    for (let round = 0; round < 24; round++) {
      const C = Array(5).fill(0n);
      for (let x = 0; x < 5; x++) {
        C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
      }
      const D = Array(5).fill(0n);
      for (let x = 0; x < 5; x++) {
        D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] ^= D[x];
        }
      }

      const B: bigint[][] = Array(5).fill(0).map(() => Array(5).fill(0n));
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          B[y][(2 * x + 3 * y) % 5] = rotl(state[x][y], R[x][y]);
        }
      }

      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x][y] = B[x][y] ^ (~B[(x + 1) % 5][y] & B[(x + 2) % 5][y]);
        }
      }
      state[0][0] ^= RC[round];
    }
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const x = Math.floor(i / 8) % 5;
    const y = Math.floor(Math.floor(i / 8) / 5);
    out[i] = Number((state[x][y] >> BigInt(8 * (i % 8))) & 0xffn);
  }
  return out;
}

// ─── secp256k1 Curve Math ────────────────────────────────────────────────────

const CURVE_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const CURVE_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

function mod(n: bigint, m = CURVE_P): bigint {
  return ((n % m) + m) % m;
}

function modPow(b: bigint, exp: bigint, m = CURVE_P): bigint {
  let res = 1n;
  b = mod(b, m);
  while (exp > 0n) {
    if (exp & 1n) res = mod(res * b, m);
    b = mod(b * b, m);
    exp >>= 1n;
  }
  return res;
}

function inv(n: bigint, m = CURVE_P): bigint {
  return modPow(n, m - 2n, m);
}

type Point = [bigint, bigint] | null;

function pointAdd(P1: Point, P2: Point): Point {
  if (!P1) return P2;
  if (!P2) return P1;
  const [x1, y1] = P1;
  const [x2, y2] = P2;
  if (x1 === x2) {
    if (y1 !== y2) return null;
    const l = mod((3n * x1 * x1) * inv(2n * y1));
    const x3 = mod(l * l - 2n * x1);
    const y3 = mod(l * (x1 - x3) - y1);
    return [x3, y3];
  }
  const l = mod((y2 - y1) * inv(x2 - x1));
  const x3 = mod(l * l - x1 - x2);
  const y3 = mod(l * (x1 - x3) - y1);
  return [x3, y3];
}

export function secp256k1ScalarMult(k: bigint, G: [bigint, bigint] = [Gx, Gy]): [bigint, bigint] {
  k = mod(k, CURVE_N);
  if (k === 0n) throw new Error('Invalid scalar key: zero');
  let R: Point = null;
  let Q: Point = G;
  while (k > 0n) {
    if (k & 1n) R = pointAdd(R, Q);
    Q = pointAdd(Q, Q);
    k >>= 1n;
  }
  if (!R) throw new Error('Point multiplication failed');
  return R;
}

// ─── Ethereum Address Generation & EIP-55 Checksum ───────────────────────────

export function toChecksumAddress(addressHex: string): string {
  const clean = addressHex.toLowerCase().replace(/^0x/, '');
  const enc = new TextEncoder();
  const hash = keccak256(enc.encode(clean));

  let ret = '0x';
  for (let i = 0; i < clean.length; i++) {
    const hashByte = hash[Math.floor(i / 2)];
    const hashNibble = (i % 2 === 0) ? (hashByte >> 4) : (hashByte & 0x0f);
    if (hashNibble >= 8) {
      ret += clean[i].toUpperCase();
    } else {
      ret += clean[i];
    }
  }
  return ret;
}

export function privateKeyToEthereumAddress(privateKeyBytes: Uint8Array): { address: string; privateKeyHex: string } {
  let k = 0n;
  for (let i = 0; i < privateKeyBytes.length; i++) {
    k = (k << 8n) | BigInt(privateKeyBytes[i]);
  }
  const pub = secp256k1ScalarMult(k);
  const xHex = pub[0].toString(16).padStart(64, '0');
  const yHex = pub[1].toString(16).padStart(64, '0');

  // Convert uncompressed public key (64 bytes) to byte array
  const pubBytes = new Uint8Array(64);
  for (let i = 0; i < 32; i++) {
    pubBytes[i] = parseInt(xHex.slice(i * 2, (i + 1) * 2), 16);
    pubBytes[32 + i] = parseInt(yHex.slice(i * 2, (i + 1) * 2), 16);
  }

  const hash = keccak256(pubBytes);
  let addrRaw = '';
  for (let i = 12; i < 32; i++) {
    addrRaw += hash[i].toString(16).padStart(2, '0');
  }

  let privHex = '';
  for (let i = 0; i < privateKeyBytes.length; i++) {
    privHex += privateKeyBytes[i].toString(16).padStart(2, '0');
  }

  return {
    address: toChecksumAddress(addrRaw),
    privateKeyHex: '0x' + privHex,
  };
}

// ─── Base58 & Base58Check Encoding (Solana / Bitcoin) ─────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(source: Uint8Array): string {
  if (source.length === 0) return '';
  const digits = [0];
  for (let i = 0; i < source.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += source[i];
    let carry = 0;
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = '';
  for (let i = 0; i < source.length && source[i] === 0; i++) str += '1';
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
  return str;
}

// ─── Bitcoin Native SegWit Bech32 (BIP-173) ───────────────────────────────────

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b2bbc8f, 0x15f2abc7, 0x677de83b, 0x30200801, 0x211b202e];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

export function encodeBech32(hrp: string, witnessProgram: Uint8Array): string {
  // Convert 8-bit bytes to 5-bit groups
  const data: number[] = [0]; // witness version 0
  let acc = 0;
  let bits = 0;
  for (const byte of witnessProgram) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      data.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) {
    data.push((acc << (5 - bits)) & 31);
  }

  // Calculate checksum
  const modArr = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(modArr) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> (5 * (5 - i))) & 31);
  }

  let result = hrp + '1';
  for (const val of [...data, ...checksum]) {
    result += BECH32_CHARSET[val];
  }
  return result;
}

