import { handlePractitionerUnassignBranch } from "@dentalcare/application";
import { getPractitionerService } from "../../../../../../../infrastructure/practitioner/service";
import { postPractitionerCommand } from "../../../../../../../infrastructure/practitioner/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ practitionerId: string; branchId: string }> },
): Promise<Response> {
  const { practitionerId, branchId } = await context.params;
  return postPractitionerCommand(request, "practitioner_unassign_branch", (input) =>
    handlePractitionerUnassignBranch(getPractitionerService(), {
      ...input,
      practitionerId,
      branchId,
    }),
  );
}
