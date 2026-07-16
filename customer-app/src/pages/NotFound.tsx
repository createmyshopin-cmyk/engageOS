export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-5xl">🔍</p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-xs text-sm text-muted">
        Scan the QR code again to open the campaign.
      </p>
    </div>
  );
}
