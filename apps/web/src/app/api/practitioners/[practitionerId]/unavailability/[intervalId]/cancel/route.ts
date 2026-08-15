import { handlePractitionerCancelUnavailability } from "@dentalcare/application";
import { getPractitionerService } from "../../../../../../../infrastructure/practitioner/service";
import { postPractitionerCommand } from "../../../../../../../infrastructure/practitioner/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ practitionerId: string; intervalId: string }> },
): Promise<Response> {
  const { practitionerId, intervalId } = await context.params;
  return postPractitionerCommand(request, "practitioner_cancel_unavailability", (input) =>
    handlePractitionerCancelUnavailability(getPractitionerService(), {
      ...input,
      practitionerId,
      intervalId,
    }),
  );
}
