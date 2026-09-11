/**
 * Cloudflare 1.1.1.1 DNS over HTTPS (DoH) utility.
 * Allows testing DNS resolution speed and querying DNS records via Cloudflare DoH.
 */

const CLOUDFLARE_DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query'

export interface DnsPingResult {
  latencyMs: number
  success: boolean
  server: string
}

export async function pingCloudflareDns(): Promise<DnsPingResult> {
  const start = performance.now()
  try {
    const res = await fetch(`${CLOUDFLARE_DOH_ENDPOINT}?name=cloudflare.com&type=A`, {
      headers: {
        accept: 'application/dns-json',
      },
      cache: 'no-store',
    })
    const latencyMs = Math.round(performance.now() - start)
    return {
      latencyMs,
      success: res.ok,
      server: '1.1.1.1 (Cloudflare DoH)',
    }
  } catch {
    return {
      latencyMs: -1,
      success: false,
      server: '1.1.1.1 (Cloudflare DoH)',
    }
  }
}
