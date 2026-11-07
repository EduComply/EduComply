/**
 * Makes certificate verification explicit for the `pg` driver.
 *
 * pg 8 treats sslmode=prefer|require|verify-ca as verify-full (certificate + host name
 * verified) and warns that pg 9 will switch them to weaker libpq semantics (encryption
 * without verification). Rewriting them to verify-full keeps today's behaviour, silences
 * the warning and stays secure after an upgrade.
 *
 * Only the URL handed to pg is changed — .env keeps sslmode=require, which Prisma's
 * migration engine (DIRECT_URL) understands. sslmode=disable/allow and URLs without an
 * sslmode are left untouched; the URL is never logged.
 */
const UPGRADE = new Set(['prefer', 'require', 'verify-ca']);

export function withVerifiedTls(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url; // let the driver report the invalid URL
  }
  const mode = parsed.searchParams.get('sslmode');
  if (!mode || !UPGRADE.has(mode) || parsed.searchParams.has('uselibpqcompat')) return url;
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}
