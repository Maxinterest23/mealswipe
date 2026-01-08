export function formatQuantity(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }

  const scaled = value * 10;
  if (!Number.isFinite(scaled)) {
    return '0';
  }

  const truncated = scaled < 0 ? Math.ceil(scaled) : Math.floor(scaled);
  let rounded = truncated / 10;
  if (Object.is(rounded, -0)) {
    rounded = 0;
  }

  const fixed = rounded.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}
