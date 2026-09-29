/**
 * UMIVERSITY varsity marks, inline so their colors follow CSS variables:
 *   --umi-fill (letters), --umi-trim (gold edge), --umi-outline (dark outer edge).
 * Each mark is drawn as three stacked layers: outline stroke, trim stroke, fill.
 *
 * PLACEHOLDER ARTWORK: the provided umiversity-wordmark.svg / umiversity-monogram.svg were not
 * in the repository. Replace WORDMARK_PATH / the <text> layers and MONOGRAM_PATH with the
 * paths from those files, keeping the three-layer structure and the CSS variables.
 */

export const MONOGRAM_PATH =
  "M17 16H43V24H40V58Q40 70 50 70Q60 70 60 58V24H57V16H83V24H77V62Q77 88 50 88Q23 88 23 62V24H17Z";

const layer = {
  outline: { fill: "none", stroke: "var(--umi-outline)", strokeWidth: 9, strokeLinejoin: "round" as const },
  trim: { fill: "none", stroke: "var(--umi-trim)", strokeWidth: 5, strokeLinejoin: "round" as const },
  fill: { fill: "var(--umi-fill)" },
};

// The wordmark renders small (28-36px tall), so its edge strokes are lighter than the monogram's.
const wordLayer = {
  outline: { ...layer.outline, strokeWidth: 7 },
  trim: { ...layer.trim, strokeWidth: 3.5 },
  fill: layer.fill,
};

export function Wordmark({ className }: { className?: string }) {
  const text = {
    x: 8,
    y: 44,
    textLength: 304,
    lengthAdjust: "spacingAndGlyphs" as const,
    fontFamily: "var(--font-graduate), var(--font-source-sans), sans-serif",
    fontSize: 40,
  };
  return (
    <svg viewBox="0 0 320 56" className={className} aria-hidden="true" focusable="false">
      <text {...text} {...wordLayer.outline}>
        UMIVERSITY
      </text>
      <text {...text} {...wordLayer.trim}>
        UMIVERSITY
      </text>
      <text {...text} {...wordLayer.fill}>
        UMIVERSITY
      </text>
    </svg>
  );
}

export function Monogram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <path d={MONOGRAM_PATH} {...layer.outline} />
      <path d={MONOGRAM_PATH} {...layer.trim} />
      <path d={MONOGRAM_PATH} {...layer.fill} />
    </svg>
  );
}
