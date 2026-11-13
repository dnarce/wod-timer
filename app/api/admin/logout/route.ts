import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/server/admin";

export async function POST() {
  (await cookies()).delete(ADMIN_COOKIE);
  return Response.json({ ok: true });
}
