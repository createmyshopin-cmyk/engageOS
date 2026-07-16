interface BrandHeaderProps {
  businessName: string;
  campaignName: string;
  logoUrl: string | null;
  /** Optional large headline shown only on the landing screen. */
  headline?: string;
}

/**
 * Merchant branding shown consistently on every customer screen
 * (landing, registration, scratch, prize, redirect). Always renders the
 * logo, merchant name and campaign name so the customer stays oriented.
 *
 * The logo uses a plain <img> with high fetch priority and eager loading:
 * it's the LCP element on this hot path and must never trigger a layout
 * shift, so width/height are fixed.
 */
export function BrandHeader({
  businessName,
  campaignName,
  logoUrl,
  headline,
}: BrandHeaderProps) {
  return (
    <header className="mb-6 text-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- merchant logos are tiny; avoid the optimizer cold-start on this hot path
        <img
          src={logoUrl}
          alt={businessName}
          width={64}
          height={64}
          // @ts-expect-error fetchpriority is a valid HTML attribute React forwards
          fetchpriority="high"
          decoding="async"
          className="mx-auto mb-3 h-16 w-16 rounded-full object-cover shadow-sm"
        />
      ) : (
        <div
          aria-hidden
          className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl font-bold text-amber-700 shadow-sm"
        >
          {businessName.charAt(0).toUpperCase()}
        </div>
      )}

      {headline ? (
        <h1 className="text-2xl font-bold text-neutral-900">{headline}</h1>
      ) : (
        <h1 className="text-lg font-bold text-neutral-900">{businessName}</h1>
      )}

      <p className="mt-1 text-sm text-neutral-600">
        {headline ? `at ${businessName}` : campaignName}
      </p>
      {headline && (
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-600">
          {campaignName}
        </p>
      )}
    </header>
  );
}
