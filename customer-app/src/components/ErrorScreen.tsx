import { useNetwork } from "../hooks/useNetwork";

interface ErrorScreenProps {
  title: string;
  body?: string;
  emoji?: string;
  onRetry?: () => void;
}

export function ErrorScreen({ title, body, emoji = "😕", onRetry }: ErrorScreenProps) {
  return (
    <div className="fade-up flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-5xl">{emoji}</p>
      <h1 className="text-xl font-bold">{title}</h1>
      {body && <p className="max-w-xs text-sm text-muted">{body}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="press mt-3 rounded-full bg-brand px-8 py-3.5 text-sm font-bold text-black"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Network-aware fetch-failure screen: offline / slow / server busy. */
export function FetchErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { tier } = useNetwork();
  if (tier === "offline") {
    return (
      <ErrorScreen
        emoji="📶"
        title="No internet connection"
        body="Check your connection and try again — we'll be right here."
        onRetry={onRetry}
      />
    );
  }
  if (tier === "slow") {
    return (
      <ErrorScreen
        emoji="🐢"
        title="Slow internet detected"
        body="Your connection is a bit slow. Hang tight and retry."
        onRetry={onRetry}
      />
    );
  }
  return (
    <ErrorScreen
      emoji="⏳"
      title="Server is busy"
      body="Lots of players right now! Please try again in a moment."
      onRetry={onRetry}
    />
  );
}
