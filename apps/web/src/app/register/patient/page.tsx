import { RegistrationWizard } from "../_components/registration-wizard";

export default function PatientRegisterPage() {
  return (
    <RegistrationWizard
      purpose="PATIENT"
      title="Register as a patient"
      lead="Join your clinic with an invitation or clinic code, then verify email and mobile."
    />
  );
}
