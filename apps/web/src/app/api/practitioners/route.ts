import { handlePractitionerCreate, handlePractitionerList } from "@dentalcare/application";
import { requestedOrganizationId } from "../../../infrastructure/http/organization";
import { getPractitionerService } from "../../../infrastructure/practitioner/service";
import {
  identityFrom,
  jsonResponse,
  postPractitionerCommand,
} from "../../../infrastructure/practitioner/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const result = await handlePractitionerList(getPractitionerService(), {
    identity: await identityFrom(),
    organizationId: requestedOrganizationId(request),
  });
  return jsonResponse(result, "practitioner_list");
}

export async function POST(request: Request): Promise<Response> {
  return postPractitionerCommand(request, "practitioner_create", (input) =>
    handlePractitionerCreate(getPractitionerService(), input),
  );
}
