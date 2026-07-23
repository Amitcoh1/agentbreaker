// The breaker-panel mark from the design — bottom switch flipped, in brass. Verbatim geometry.
export default function BrandMark({ width = 24, height = 35 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 26 38" aria-hidden="true">
      <rect x="1.5" y="1.5" width="23" height="35" rx="5" fill="none" stroke="#f2f0e9" strokeWidth="2.5" />
      <rect x="6.5" y="6.5" width="13" height="6" rx="1.5" fill="#f2f0e9" />
      <rect x="6.5" y="16" width="13" height="6" rx="1.5" fill="#f2f0e9" />
      <rect x="6.5" y="25.5" width="13" height="6" rx="1.5" fill="#d4a017" transform="rotate(-15 13 28.5)" />
    </svg>
  );
}
