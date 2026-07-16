import { useState } from "react";

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

/** Lazy image with blur-up placeholder; eager + high priority when `priority`. */
export function SmartImage({
  src,
  alt,
  className = "",
  width,
  height,
  priority,
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={`${className} ${loaded ? "img-loaded" : "img-blur"}`}
      style={{ willChange: loaded ? undefined : "filter, transform" }}
    />
  );
}
