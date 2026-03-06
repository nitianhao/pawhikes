import "server-only";
import { init } from "@instantdb/admin";
import schema from "./schema";

const appId = process.env.INSTANTDB_APP_ID;
const adminToken = process.env.INSTANTDB_ADMIN_TOKEN;

if (!appId?.trim()) {
  throw new Error(
    "Missing INSTANTDB_APP_ID. Add it to .env.local (create an InstantDB app and paste the App ID)."
  );
}
if (!adminToken?.trim()) {
  throw new Error(
    "Missing INSTANTDB_ADMIN_TOKEN. Add it to .env.local (from your InstantDB app dashboard)."
  );
}

export const adminDb = init({
  appId,
  adminToken,
  schema,
});
