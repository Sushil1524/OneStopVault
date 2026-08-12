/**
 * Cloudflare Worker Server-Side Pepper Security Layer
 * Applies server-side HMAC envelope to client ciphertext using Web Crypto API.
 */

export async function applyServerPepper(ciphertext: string, pepperSecret: string): Promise<string> {
  if (!pepperSecret) return ciphertext;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(pepperSecret);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(ciphertext)
  );
  
  const hmacHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  return `${hmacHex}.${ciphertext}`;
}

export async function verifyAndStripPepper(pepperedPayload: string, pepperSecret: string): Promise<string> {
  if (!pepperSecret) return pepperedPayload;
  
  const dotIndex = pepperedPayload.indexOf('.');
  if (dotIndex === -1) return pepperedPayload; // Legacy / unpeppered payload
  
  const hmacHex = pepperedPayload.substring(0, dotIndex);
  const rawCiphertext = pepperedPayload.substring(dotIndex + 1);
  
  const expectedHmacHex = await applyServerPepper(rawCiphertext, pepperSecret);
  const expectedDotIndex = expectedHmacHex.indexOf('.');
  const cleanExpectedHmac = expectedHmacHex.substring(0, expectedDotIndex);
  
  if (hmacHex !== cleanExpectedHmac) {
    throw new Error('Server-side HMAC verification failed. Data integrity compromised.');
  }
  
  return rawCiphertext;
}
