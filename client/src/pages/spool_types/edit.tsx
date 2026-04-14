import { PlusOutlined } from "@ant-design/icons";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { HttpError, useTranslate } from "@refinedev/core";
import { Alert, Button, Form, Input, InputNumber, Modal, Select, message } from "antd";
import { useEffect, useMemo, useState } from "react";
import { getAPIURL } from "../../utils/url";
import { IVendor } from "../vendors/model";
import { ISpoolType, ISpoolTypeCategory } from "./model";

export const SpoolTypeEdit = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);

  const { formProps, saveButtonProps, form } = useForm<ISpoolType, HttpError, ISpoolType>({
    liveMode: "manual",
    onLiveEvent() {
      messageApi.warning(t("spool_type.form.spool_type_updated"));
      setHasChanged(true);
    },
  });

  // Fix nested objects for form initial values
  if (formProps.initialValues) {
    if (formProps.initialValues.vendor) {
      formProps.initialValues.vendor_id = formProps.initialValues.vendor.id;
    }
    if (formProps.initialValues.category) {
      formProps.initialValues.spool_type_category_id = formProps.initialValues.category.id;
    }
  }

  // Let useForm handle submit naturally — form fields vendor_id and spool_type_category_id
  // are what the PATCH API expects, and the form is configured with those field names.

  const { selectProps: vendorSelect } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
    pagination: { mode: "off" },
  });

  // Load spool type categories
  const [categories, setCategories] = useState<ISpoolTypeCategory[]>([]);

  const loadCategories = async () => {
    const res = await fetch(getAPIURL() + "/spool_type/category");
    if (res.ok) {
      setCategories(await res.json());
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const sortedCategoryOptions = useMemo(
    () =>
      [...categories]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        .map((c) => ({ label: c.name, value: c.id })),
    [categories],
  );

  // Quick-create category modal
  const [quickCatOpen, setQuickCatOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState("");
  const [quickCatLoading, setQuickCatLoading] = useState(false);

  const handleQuickCreateCategory = async () => {
    if (!quickCatName.trim()) return;
    setQuickCatLoading(true);
    try {
      const res = await fetch(getAPIURL() + "/spool_type/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: quickCatName.trim() }),
      });
      if (res.ok) {
        const newCat: ISpoolTypeCategory = await res.json();
        setCategories((prev) => [...prev, newCat]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (form as any).setFieldValue("spool_type_category_id", newCat.id);
        setQuickCatOpen(false);
        setQuickCatName("");
      }
    } finally {
      setQuickCatLoading(false);
    }
  };

  return (
    <Edit saveButtonProps={saveButtonProps}>
      {contextHolder}
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("spool_type.fields.vendor_name")}
          name={["vendor_id"]}
          rules={[{ required: true }]}
        >
          <Select
            {...vendorSelect}
            allowClear
            showSearch
            filterSort={(a, b) =>
              a?.label && b?.label
                ? (a.label as string).localeCompare(b.label as string, undefined, { sensitivity: "base" })
                : 0
            }
            filterOption={(input, option) =>
              typeof option?.label === "string" && option.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item label={t("spool_type.fields.category_name")}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Form.Item name={["spool_type_category_id"]} noStyle>
              <Select
                allowClear
                showSearch
                placeholder={t("spool_type.fields.category_placeholder")}
                style={{ width: 220 }}
                options={sortedCategoryOptions}
                filterOption={(input, option) =>
                  typeof option?.label === "string" && option.label.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setQuickCatOpen(true)}>
              New Type
            </Button>
          </div>
        </Form.Item>
        <Form.Item
          label={t("spool_type.fields.weight")}
          name={["weight"]}
          rules={[{ required: false, type: "number", min: 0 }]}
        >
          <InputNumber addonAfter="g" precision={1} style={{ width: 180 }} />
        </Form.Item>
        <Form.Item
          label={t("spool_type.fields.color")}
          name={["color"]}
          rules={[{ required: false }]}
        >
          <Input maxLength={64} style={{ width: 220 }} placeholder="e.g. Black, Clear, White" />
        </Form.Item>
      </Form>

      <Modal
        title="Create Spool Type Category"
        open={quickCatOpen}
        onCancel={() => { setQuickCatOpen(false); setQuickCatName(""); }}
        onOk={handleQuickCreateCategory}
        okText="Create"
        confirmLoading={quickCatLoading}
        okButtonProps={{ disabled: !quickCatName.trim() }}
      >
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="Name" required>
            <Input
              value={quickCatName}
              onChange={(e) => setQuickCatName(e.target.value)}
              onPressEnter={handleQuickCreateCategory}
              maxLength={64}
              autoFocus
              placeholder="e.g. Cardboard, Plastic"
            />
          </Form.Item>
        </Form>
      </Modal>

      {hasChanged && <Alert description={t("spool_type.form.spool_type_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default SpoolTypeEdit;
