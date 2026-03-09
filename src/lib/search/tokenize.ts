export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[\s\-_,./():]+/).filter(Boolean);
  return [...new Set(words)];
}
