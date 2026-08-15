import { handlePractitionerReplaceSchedule } from "@dentalcare/application";
import { getPractitionerService } from "../../../../../../../infrastructure/practitioner/service";
import { postPractitionerCommand } from "../../../../../../../infrastructure/practitioner/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ practitionerId: string; scheduleId: string }> },
): Promise<Response> {
  const { practitionerId, scheduleId } = await context.params;
  return postPractitionerCommand(request, "practitioner_replace_schedule", (input) =>
    handlePractitionerReplaceSchedule(getPractitionerService(), {
      ...input,
      practitionerId,
      scheduleId,
    }),
  );
}
