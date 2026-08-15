import {
  handlePractitionerCreateUnavailability,
  handlePractitionerListUnavailability,
} from "@dentalcare/application";
import { requestedOrganizationId } from "../../../../../infrastructure/http/organization";
import { getPractitionerService } from "../../../../../infrastructure/practitioner/service";
import {
  identityFrom,
  jsonResponse,
  postPractitionerCommand,
} from "../../../../../infrastructure/practitioner/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ practitionerId: string }> },
): Promise<Response> {
  const { practitionerId } = await context.params;
  const result = await handlePractitionerListUnavailability(getPractitionerService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    practitionerId,
  });
  return jsonResponse(result, "practitioner_list_unavailability");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ practitionerId: string }> },
): Promise<Response> {
  const { practitionerId } = await context.params;
  return postPractitionerCommand(request, "practitioner_create_unavailability", (input) =>
    handlePractitionerCreateUnavailability(getPractitionerService(), { ...input, practitionerId }),
  );
}
