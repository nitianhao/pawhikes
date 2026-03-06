import "server-only";

type AdminDbLike = {
  query: (query: unknown) => Promise<unknown>;
};

export async function getAdminDbSafe(): Promise<AdminDbLike | null> {
  try {
    const mod = await import("./admin");
    return (mod as any).adminDb as AdminDbLike;
  } catch {
    return null;
  }
}

export function instantDbMissingEnvMessage(): string {
  return "InstantDB is not configured. Add INSTANTDB_APP_ID and INSTANTDB_ADMIN_TOKEN to .env.local to load data.";
}

