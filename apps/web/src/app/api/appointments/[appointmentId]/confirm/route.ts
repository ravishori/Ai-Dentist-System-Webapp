import { handleAppointmentConfirm } from "@dentalcare/application";
import { getAppointmentService } from "../../../../../infrastructure/appointment/service";
import { postAppointmentCommand } from "../../../../../infrastructure/appointment/command-route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
): Promise<Response> {
  const { appointmentId } = await context.params;
  return postAppointmentCommand(request, appointmentId, "appointment_confirm", (input) =>
    handleAppointmentConfirm(getAppointmentService(), input),
  );
}
