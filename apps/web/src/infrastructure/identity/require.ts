import { getIdentityRuntime } from "./runtime";
import type { IdentityRuntime } from "./runtime";

export async function requireIdentityRuntime(): Promise<
  { ok: true; runtime: IdentityRuntime } | { ok: false; response: Response }
> {
  try {
    const runtime = await getIdentityRuntime();
    return { ok: true, runtime };
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "unavailable",
          message: "Passwordless identity is not configured in this environment.",
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    };
  }
}
