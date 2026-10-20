import { useTranslate } from "@refinedev/core";
import { FormInstance } from "antd";
import { FormAssistModal } from "../../components/formAssistModal";
import { useCurrency } from "../../utils/settings";

/**
 * Assist modal for the spool create/edit forms. Looks up price and weights for the selected filament.
 */
export function SpoolAssistModal(props: {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: FormInstance<any>;
  onFilled: (formFields: string[]) => void;
  filament?: { label: string; weight?: number; spool_weight?: number } | null;
}) {
  const t = useTranslate();
  const currency = useCurrency();
  const { filament } = props;

  return (
    <FormAssistModal
      open={props.open}
      onClose={props.onClose}
      form={props.form}
      onFilled={props.onFilled}
      task="spool"
      title="Look up spool"
      placeholder="e.g. Sunlu PLA+ White 1kg, or a product page URL"
      fields={[
        { key: "price", label: t("spool.fields.price") },
        { key: "initial_weight", label: t("spool.fields.initial_weight") },
        { key: "spool_weight", label: t("spool.fields.spool_weight") },
      ]}
      defaultQuery={() => filament?.label ?? ""}
      context={{
        filament: filament
          ? { name: filament.label, net_weight_g: filament.weight, empty_spool_weight_g: filament.spool_weight }
          : "(not selected)",
        currency,
      }}
    />
  );
}
