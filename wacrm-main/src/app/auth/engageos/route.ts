import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  buildRedirectPath,
  verifyEngageosSsoToken,
} from '@/lib/engageos/sso'

export const runtime = 'nodejs'

/**
 * GET /auth/engageos?token=…&embed=1
 *
 * Exchanges a short-lived EngageOS SSO token for a WACRM session via
 * Supabase magic link, then redirects to the requested dashboard path.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url))
  }

  const payload = verifyEngageosSsoToken(token)
  if (!payload) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url))
  }

  const embed =
    request.nextUrl.searchParams.get('embed') === '1' || payload.embed === true
  const redirectPath = buildRedirectPath(payload.path, embed)

  const admin = supabaseAdmin()

  const { error: nonceError } = await admin.from('engageos_sso_redemptions').insert({
    nonce: payload.nonce,
    account_id: payload.accountId,
    business_id: payload.businessId,
  })
  if (nonceError) {
    if ((nonceError as { code?: string }).code === '23505') {
      return NextResponse.redirect(new URL('/login?error=token_used', request.url))
    }
    console.error('[engageos/sso] nonce insert failed:', nonceError.message)
    return NextResponse.redirect(new URL('/login?error=sso_failed', request.url))
  }

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id, owner_user_id')
    .eq('id', payload.accountId)
    .maybeSingle<{ id: string; owner_user_id: string }>()

  if (accountError || !account) {
    return NextResponse.redirect(new URL('/login?error=account_not_found', request.url))
  }

  const { data: ownerData, error: ownerError } =
    await admin.auth.admin.getUserById(account.owner_user_id)
  if (ownerError || !ownerData.user?.email) {
    console.error('[engageos/sso] owner lookup failed:', ownerError?.message)
    return NextResponse.redirect(new URL('/login?error=owner_not_found', request.url))
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`
  ).replace(/\/+$/, '')

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: ownerData.user.email,
    options: {
      redirectTo: `${siteUrl}${redirectPath}`,
    },
  })

  if (linkError || !linkData.properties?.action_link) {
    console.error('[engageos/sso] generateLink failed:', linkError?.message)
    return NextResponse.redirect(new URL('/login?error=session_failed', request.url))
  }

  const response = NextResponse.redirect(linkData.properties.action_link)

  if (embed) {
    response.cookies.set('wacrm_embed', '1', {
      path: '/',
      maxAge: 60 * 60,
      sameSite: 'none',
      secure: true,
      httpOnly: false,
    })
  }

  return response
}
