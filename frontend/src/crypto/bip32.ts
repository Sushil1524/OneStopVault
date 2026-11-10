import { secp256k1ScalarMult } from './secp256k1.js';

const CURVE_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

async function hmacSha512(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as unknown as BufferSource);
  return new Uint8Array(signature);
}

function getCompressedPubKey(privKeyBytes: Uint8Array): Uint8Array {
  let k = 0n;
  for (let i = 0; i < 32; i++) {
    k = (k << 8n) | BigInt(privKeyBytes[i]);
  }
  const P = secp256k1ScalarMult(k);
  const xHex = P[0].toString(16).padStart(64, '0');
  const prefix = (P[1] % 2n === 0n) ? 0x02 : 0x03;

  const pub = new Uint8Array(33);
  pub[0] = prefix;
  for (let i = 0; i < 32; i++) {
    pub[1 + i] = parseInt(xHex.slice(i * 2, (i + 1) * 2), 16);
  }
  return pub;
}

/**
 * Standard BIP-32 Hierarchical Deterministic Key Derivation (BIP-32 / BIP-44).
 * Used by MetaMask, Trust Wallet, Ledger, Trezor, and Electrum.
 */
export async function deriveBip32ChildKey(seed: Uint8Array, path: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const masterI = await hmacSha512(enc.encode('Bitcoin seed'), seed);

  let currentKey = masterI.slice(0, 32);
  let currentChainCode = masterI.slice(32);

  const segments = path.replace(/^m\//i, '').split('/');

  for (const seg of segments) {
    if (!seg) continue;
    const isHardened = seg.endsWith("'") || seg.endsWith('h');
    const indexNum = parseInt(seg.replace(/['h]/g, ''), 10);
    const index = (indexNum + (isHardened ? 0x80000000 : 0)) >>> 0;

    const indexBytes = new Uint8Array(4);
    indexBytes[0] = (index >> 24) & 0xff;
    indexBytes[1] = (index >> 16) & 0xff;
    indexBytes[2] = (index >> 8) & 0xff;
    indexBytes[3] = index & 0xff;

    let data: Uint8Array;
    if (isHardened) {
      data = new Uint8Array(37);
      data[0] = 0x00;
      data.set(currentKey, 1);
      data.set(indexBytes, 33);
    } else {
      const parentPub = getCompressedPubKey(currentKey);
      data = new Uint8Array(37);
      data.set(parentPub, 0);
      data.set(indexBytes, 33);
    }

    const I = await hmacSha512(currentChainCode, data);
    const IL = I.slice(0, 32);
    const IR = I.slice(32);

    let kL = 0n;
    let kParent = 0n;
    for (let i = 0; i < 32; i++) {
      kL = (kL << 8n) | BigInt(IL[i]);
      kParent = (kParent << 8n) | BigInt(currentKey[i]);
    }

    const childK = (kL + kParent) % CURVE_N;
    if (childK === 0n) throw new Error('Invalid child key: zero');

    const childKeyBytes = new Uint8Array(32);
    let temp = childK;
    for (let i = 31; i >= 0; i--) {
      childKeyBytes[i] = Number(temp & 0xffn);
      temp >>= 8n;
    }

    currentKey = childKeyBytes;
    currentChainCode = IR;
  }

  return currentKey;
}

/**
 * Standard SLIP-0010 Ed25519 seed derivation used by Solana wallets (Phantom, Solflare).
 */
export async function deriveSolanaKey(seed: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const masterI = await hmacSha512(enc.encode('ed25519 seed'), seed);
  return masterI.slice(0, 32);
}

