import { handlePractitionerVerification } from "@dentalcare/application";
import { identityFrom } from "../../../../../infrastructure/practitioner/http";
import { requestedOrganizationId } from "../../../../../infrastructure/http/organization";
import { getPractitionerService } from "../../../../../infrastructure/practitioner/service";
import { identityJsonResponse, readJsonBody } from "../../../../../infrastructure/identity/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ practitionerId: string }> };

/** Privileged — PRACTICE_ADMIN sets verificationStatus. */
export async function PATCH(request: Request, context: Params): Promise<Response> {
  const { practitionerId } = await context.params;
  const body = await readJsonBody(request);
  const result = await handlePractitionerVerification(
    getPractitionerService(),
    await identityFrom(),
    requestedOrganizationId(request),
    practitionerId,
    body,
  );
  return identityJsonResponse(result, "practitioner_verify");
}
