import { useTranslate } from "@refinedev/core";
import { FormInstance } from "antd";
import { FormAssistModal } from "../../components/formAssistModal";

/**
 * Assist modal for the filament type create/edit forms.
 */
export function FilamentTypeAssistModal(props: {
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
      task="filament_type"
      title="Look up material"
      placeholder="e.g. PETG, PLA Silk, PA6-CF"
      fields={[
        { key: "name", label: t("filament_type.fields.name") },
        { key: "density", label: t("filament_type.fields.density") },
        { key: "settings_extruder_temp", label: t("filament_type.fields.settings_extruder_temp") },
        { key: "settings_bed_temp", label: t("filament_type.fields.settings_bed_temp") },
        { key: "comment", label: t("filament_type.fields.comment"), onlyIfEmpty: true },
      ]}
      defaultQuery={(values) => (values.name as string) ?? ""}
    />
  );
}
