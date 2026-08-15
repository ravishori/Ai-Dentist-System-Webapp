import { handlePractitionerAssignBranch } from "@dentalcare/application";
import { getPractitionerService } from "../../../../../infrastructure/practitioner/service";
import { postPractitionerCommand } from "../../../../../infrastructure/practitioner/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ practitionerId: string }> },
): Promise<Response> {
  const { practitionerId } = await context.params;
  return postPractitionerCommand(request, "practitioner_assign_branch", (input) =>
    handlePractitionerAssignBranch(getPractitionerService(), { ...input, practitionerId }),
  );
}
