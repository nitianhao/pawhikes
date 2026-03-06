export function getPath(obj: any, path: string): any {
  const parts = String(path ?? "").split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur?.[p];
  }
  return cur;
}

export function hasPath(obj: any, path: string): boolean {
  const v = getPath(obj, path);
  return v !== null && v !== undefined;
}

export function listTopLevelKeys(obj: any): string[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.keys(obj);
}

