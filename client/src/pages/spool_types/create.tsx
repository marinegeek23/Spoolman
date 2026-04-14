import { PlusOutlined } from "@ant-design/icons";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { HttpError, IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Button, Form, Input, InputNumber, Modal, Select } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useEffect, useMemo, useState } from "react";
import { getAPIURL } from "../../utils/url";
import { IVendor } from "../vendors/model";
import { ISpoolType, ISpoolTypeCategory } from "./model";

dayjs.extend(utc);

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

type ISpoolTypeRequest = {
  vendor_id: number;
  spool_type_category_id?: number;
  weight?: number;
  color?: string;
};

export const SpoolTypeCreate = (props: IResourceComponentsProps & CreateOrCloneProps) => {
  const t = useTranslate();

  const { form, formProps, formLoading, onFinish, redirect } = useForm<
    ISpoolType,
    HttpError,
    ISpoolTypeRequest
  >();

  if (!formProps.initialValues) {
    formProps.initialValues = {};
  }

  if (props.mode === "clone") {
    if (formProps.initialValues.vendor) {
      formProps.initialValues.vendor_id = formProps.initialValues.vendor.id;
    }
    if (formProps.initialValues.category) {
      formProps.initialValues.spool_type_category_id = formProps.initialValues.category.id;
    }
  }

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
        form.setFieldValue("spool_type_category_id", newCat.id);
        setQuickCatOpen(false);
        setQuickCatName("");
      }
    } finally {
      setQuickCatLoading(false);
    }
  };

  const handleSubmit = async (redirectTo: "list" | "create") => {
    const values = await form.validateFields();
    await onFinish(values);
    redirect(redirectTo);
  };

  return (
    <Create
      title={props.mode === "create" ? t("spool_type.titles.create") : t("spool_type.titles.clone")}
      isLoading={formLoading}
      footerButtons={() => (
        <>
          <Button type="primary" onClick={() => handleSubmit("list")}>
            {t("buttons.save")}
          </Button>
          <Button type="primary" onClick={() => handleSubmit("create")}>
            {t("buttons.saveAndAdd")}
          </Button>
        </>
      )}
    >
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
    </Create>
  );
};

export default SpoolTypeCreate;
