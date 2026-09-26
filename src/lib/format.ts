export function money(value: number, currency = "EGP", fractionDigits = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return `${currency} ${n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function num(value: number, digits = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function pct(value: number, digits = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(digits)}%`;
}

export function signed(value: number, currency = "EGP") {
  const n = Number.isFinite(value) ? value : 0;
  return `${n >= 0 ? "+" : "-"}${money(Math.abs(n), currency)}`;
}

export function toneClass(value: number) {
  if (value > 0.004) return "text-gain";
  if (value < -0.004) return "text-loss";
  return "text-muted-foreground";
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
