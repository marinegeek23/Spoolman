import { useTranslate } from "@refinedev/core";
import { FormInstance } from "antd";
import { FormAssistModal } from "../../components/formAssistModal";
import { getAPIURL } from "../../utils/url";
import { ISpoolTypeCategory } from "./model";

/**
 * Assist modal for the spool type create/edit forms.
 */
export function SpoolTypeAssistModal(props: {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: FormInstance<any>;
  onFilled: (formFields: string[]) => void;
  vendors: { label: string; value: number }[];
  categories: ISpoolTypeCategory[];
  setCategories: (update: (prev: ISpoolTypeCategory[]) => ISpoolTypeCategory[]) => void;
}) {
  const t = useTranslate();
  const { form, vendors, categories } = props;

  const vendorName = () => vendors.find((v) => v.value === form.getFieldValue("vendor_id"))?.label;
  const findCategory = (name: unknown) =>
    categories.find((c) => c.name.toLowerCase() === String(name).toLowerCase());

  const createCategory = async (name: string) => {
    const res = await fetch(getAPIURL() + "/spool_type/category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new Error(`Failed to create spool category (${res.status})`);
    }
    const newCat: ISpoolTypeCategory = await res.json();
    props.setCategories((prev) => [...prev, newCat]);
    return newCat.id;
  };

  return (
    <FormAssistModal
      open={props.open}
      onClose={props.onClose}
      form={form}
      onFilled={props.onFilled}
      task="spool_type"
      title="Look up spool type"
      placeholder="e.g. Sunlu black plastic spool"
      fields={[
        { key: "weight", label: t("spool_type.fields.weight") },
        {
          key: "category",
          label: t("spool_type.fields.category_name"),
          formField: "spool_type_category_id",
          current: (values) => categories.find((c) => c.id === values.spool_type_category_id)?.name,
          display: (name) => findCategory(name)?.name ?? `${name} (new category)`,
          toFormValue: (name) => findCategory(name)?.id ?? createCategory(String(name)),
        },
        { key: "color", label: t("spool_type.fields.color") },
      ]}
      defaultQuery={(values) => [vendorName(), values.color, "spool"].filter(Boolean).join(" ")}
      context={{
        vendor: vendorName() ?? "(not selected)",
        existing_spool_categories: categories.map((c) => c.name),
      }}
    />
  );
}
