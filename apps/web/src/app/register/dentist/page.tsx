import { RegistrationWizard } from "../_components/registration-wizard";

export default function DentistRegisterPage() {
  return (
    <RegistrationWizard
      purpose="PRACTITIONER"
      title="Register as a dentist"
      lead="Accept a practice invitation, verify your contacts, then wait for professional verification."
    />
  );
}
