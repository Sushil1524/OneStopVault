/**
 * HaveIBeenPwned k-Anonymity Password Leak Audit
 * Checks password against 840+ million leaked passwords without exposing the password or full hash.
 */

async function sha1Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function checkPasswordBreach(password: string): Promise<{ isBreached: boolean; breachCount: number }> {
  if (!password) return { isBreached: false, breachCount: 0 };

  try {
    const fullHash = await sha1Hex(password);
    const prefix = fullHash.substring(0, 5);
    const suffix = fullHash.substring(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) {
      throw new Error(`HIBP API returned status ${res.status}`);
    }

    const text = await res.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const [lineSuffix, countStr] = line.trim().split(':');
      if (lineSuffix.toUpperCase() === suffix) {
        const count = parseInt(countStr, 10);
        return { isBreached: true, breachCount: count };
      }
    }

    return { isBreached: false, breachCount: 0 };
  } catch (err) {
    console.warn('HaveIBeenPwned audit check failed:', err);
    return { isBreached: false, breachCount: 0 };
  }
}
