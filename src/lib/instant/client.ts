import { init } from "@instantdb/react";
import schema from "./schema";

const appId = process.env.NEXT_PUBLIC_INSTANTDB_APP_ID;
if (!appId?.trim()) {
  throw new Error(
    "Missing NEXT_PUBLIC_INSTANTDB_APP_ID. Add it to .env.local (same value as INSTANTDB_APP_ID for the client)."
  );
}

export const db = init({
  appId,
  schema,
});
