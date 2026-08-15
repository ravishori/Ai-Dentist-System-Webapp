import { handlePractitionerGet } from "@dentalcare/application";
import { requestedOrganizationId } from "../../../../infrastructure/http/organization";
import { getPractitionerService } from "../../../../infrastructure/practitioner/service";
import { identityFrom, jsonResponse } from "../../../../infrastructure/practitioner/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ practitionerId: string }> },
): Promise<Response> {
  const { practitionerId } = await context.params;
  const result = await handlePractitionerGet(getPractitionerService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    practitionerId,
  });
  return jsonResponse(result, "practitioner_get");
}
