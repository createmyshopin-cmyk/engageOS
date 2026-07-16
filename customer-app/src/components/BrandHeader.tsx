interface BrandHeaderProps {
  logoUrl: string | null;
  businessName: string;
  headline?: string;
}

export function BrandHeader({ logoUrl, businessName, headline }: BrandHeaderProps) {
  return (
    <header className="safe-t flex flex-col items-center gap-3 px-4 pt-6 text-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={businessName}
          width={64}
          height={64}
          className="h-16 w-16 rounded-2xl object-cover"
          fetchPriority="high"
        />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-black">
          {businessName.charAt(0).toUpperCase()}
        </span>
      )}
      <div>
        <h1 className="text-xl font-bold">{businessName}</h1>
        {headline && <p className="mt-1 text-sm text-muted">{headline}</p>}
      </div>
    </header>
  );
}
