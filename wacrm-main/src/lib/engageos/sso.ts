import { createHmac, timingSafeEqual } from 'node:crypto'

export interface EngageosSsoPayload {
  accountId: string
  businessId: string
  merchantId: string
  path: string
  embed: boolean
  exp: number
  nonce: string
}

function ssoSecret(): string {
  const secret = process.env.ENGAGEOS_WACRM_SSO_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('ENGAGEOS_WACRM_SSO_SECRET must be set (>= 32 chars)')
  }
  return secret
}

function sign(data: string): string {
  return createHmac('sha256', ssoSecret()).update(data).digest('base64url')
}

/** Verify an EngageOS-minted SSO token. Returns null when invalid or expired. */
export function verifyEngageosSsoToken(token: string): EngageosSsoPayload | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null

  const data = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(data)

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8')
    ) as EngageosSsoPayload
    if (!payload.accountId || !payload.path || !payload.nonce) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function buildRedirectPath(path: string, embed: boolean): string {
  const base = path.startsWith('/') ? path : `/${path}`
  if (!embed) return base

  const qIndex = base.indexOf('?')
  const pathname = qIndex === -1 ? base : base.slice(0, qIndex)
  const query = qIndex === -1 ? '' : base.slice(qIndex + 1)
  const params = new URLSearchParams(query)
  params.set('embed', '1')
  const qs = params.toString()
  return `${pathname}?${qs}`
}
