import { notFound } from "next/navigation";
import { TabPage } from "@/components/TabPage";
import { FormFill } from "@/components/FormFill";
import { currentRole } from "@/lib/guard";
import { getSubmission, getTemplate } from "@/lib/forms";
import { featureEnabled } from "@/config/barn";

export const metadata = { title: "Form" };

/**
 * One form, filled in and signed.
 *
 * There is no ownership check here and none is needed: getSubmission() runs on
 * the caller's session, and the row policy returns nothing for a submission
 * belonging to another family — so another family's form is a 404, not a
 * forbidden page.
 */
export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await currentRole();
  if (!featureEnabled("forms")) notFound();
  if (role !== "parent") notFound();

  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission) notFound();

  const template = await getTemplate(submission.template_id);
  if (!template) notFound();

  return (
    <TabPage title={template.name} back="/more/forms">
      {template.description && (
        <p className="text-caption text-muted">{template.description}</p>
      )}

      <FormFill submission={submission} template={template} />
    </TabPage>
  );
}
