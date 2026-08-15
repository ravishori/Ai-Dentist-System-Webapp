import {
  handlePractitionerCreateSchedule,
  handlePractitionerListSchedules,
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
  const result = await handlePractitionerListSchedules(getPractitionerService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
    practitionerId,
  });
  return jsonResponse(result, "practitioner_list_schedules");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ practitionerId: string }> },
): Promise<Response> {
  const { practitionerId } = await context.params;
  return postPractitionerCommand(request, "practitioner_create_schedule", (input) =>
    handlePractitionerCreateSchedule(getPractitionerService(), { ...input, practitionerId }),
  );
}
