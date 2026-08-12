/**
 * TOTP (Time-based One-Time Password) Authenticator Generator
 * Implements RFC 6238 using Web Crypto API
 */

function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    value = (value << 5) | alphabet.indexOf(clean[i]);
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

export async function generateTOTP(secretBase32: string): Promise<{ code: string; secondsRemaining: number }> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  const counter = Math.floor(nowSeconds / timeStep);
  const secondsRemaining = timeStep - (nowSeconds % timeStep);

  try {
    const keyBytes = base32ToBytes(secretBase32);
    if (keyBytes.length === 0) return { code: '------', secondsRemaining };

    // Convert counter to 8-byte big-endian array
    const counterBuffer = new ArrayBuffer(8);
    const view = new DataView(counterBuffer);
    view.setUint32(4, counter, false); // Big endian

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
    const sigArray = new Uint8Array(signature);

    // Dynamic Truncation
    const offset = sigArray[sigArray.length - 1] & 0xf;
    const binary =
      ((sigArray[offset] & 0x7f) << 24) |
      ((sigArray[offset + 1] & 0xff) << 16) |
      ((sigArray[offset + 2] & 0xff) << 8) |
      (sigArray[offset + 3] & 0xff);

    const otp = binary % 1000000;
    const code = otp.toString().padStart(6, '0');

    return { code, secondsRemaining };
  } catch (err) {
    return { code: 'INVALID', secondsRemaining };
  }
}
