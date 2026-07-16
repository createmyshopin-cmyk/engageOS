interface PreloaderProps {
  logoUrl?: string | null;
  merchantName?: string;
  campaignName?: string;
  /** When true, plays a quick fade-out (parent unmounts after ~180ms). */
  leaving?: boolean;
}

/** Soft animated loader — merchant branding when known, never a blank screen. */
export function Preloader({
  logoUrl,
  merchantName,
  campaignName,
  leaving,
}: PreloaderProps) {
  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-surface ${leaving ? "preloader-out" : ""}`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width={72}
          height={72}
          className="pulse-soft h-18 w-18 rounded-2xl object-cover"
          fetchPriority="high"
        />
      ) : (
        <span className="spinner" />
      )}
      {merchantName && <p className="text-lg font-semibold">{merchantName}</p>}
      {campaignName && <p className="text-sm text-muted">{campaignName}</p>}
      <span className="dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
