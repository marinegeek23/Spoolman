import { useTranslate } from "@refinedev/core";
import { FormInstance } from "antd";
import { FormAssistModal } from "../../components/formAssistModal";

/**
 * Assist modal for the vendor create/edit forms.
 */
export function VendorAssistModal(props: {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: FormInstance<any>;
  onFilled: (formFields: string[]) => void;
}) {
  const t = useTranslate();
  return (
    <FormAssistModal
      {...props}
      task="vendor"
      title="Look up vendor"
      placeholder="e.g. Sunlu, or the brand's website"
      fields={[
        { key: "name", label: t("vendor.fields.name") },
        { key: "empty_spool_weight", label: t("vendor.fields.empty_spool_weight") },
      ]}
      defaultQuery={(values) => (values.name as string) ?? ""}
    />
  );
}
