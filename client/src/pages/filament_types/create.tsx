import { Create, useForm } from "@refinedev/antd";
import { HttpError, IResourceComponentsProps, useTranslate } from "@refinedev/core";
import { Button, Form, Input, InputNumber, Typography } from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useEffect } from "react";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { formatNumberOnUserInput, numberParser } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IFilamentType, IFilamentTypeParsedExtras } from "./model";

dayjs.extend(utc);

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

export const FilamentTypeCreate = (props: IResourceComponentsProps & CreateOrCloneProps) => {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.filament_type);

  const { form, formProps, formLoading, onFinish, redirect } = useForm<
    IFilamentType,
    HttpError,
    IFilamentTypeParsedExtras,
    IFilamentTypeParsedExtras
  >();

  if (!formProps.initialValues) {
    formProps.initialValues = {};
  }

  if (props.mode === "clone") {
    formProps.initialValues = ParsedExtras(formProps.initialValues);
  }

  const handleSubmit = async (redirectTo: "list" | "create") => {
    const values = StringifiedExtras(await form.validateFields());
    await onFinish(values);
    redirect(redirectTo);
  };

  useEffect(() => {
    extraFields.data?.forEach((field) => {
      if (formProps.initialValues && field.default_value) {
        const parsedValue = JSON.parse(field.default_value as string);
        form.setFieldsValue({ extra: { [field.key]: parsedValue } });
      }
    });
  }, [form, extraFields.data, formProps.initialValues]);

  return (
    <Create
      title={props.mode === "create" ? t("filament_type.titles.create") : t("filament_type.titles.clone")}
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
        <Form.Item label={t("filament_type.fields.name")} name={["name"]} rules={[{ required: true }]}>
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament_type.fields.density")}
          help={t("filament_type.fields_help.density")}
          name={["density"]}
          rules={[{ required: false, type: "number", min: 0, max: 100 }]}
        >
          <InputNumber addonAfter="g/cm³" precision={2} formatter={formatNumberOnUserInput} parser={numberParser} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item
          label={t("filament_type.fields.settings_extruder_temp")}
          name={["settings_extruder_temp"]}
          rules={[{ required: false, type: "number", min: 0 }]}
        >
          <InputNumber addonAfter="°C" precision={0} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item
          label={t("filament_type.fields.settings_bed_temp")}
          name={["settings_bed_temp"]}
          rules={[{ required: false, type: "number", min: 0 }]}
        >
          <InputNumber addonAfter="°C" precision={0} style={{ width: 200 }} />
        </Form.Item>
        <Form.Item label={t("filament_type.fields.comment")} name={["comment"]} rules={[{ required: false }]}>
          <TextArea maxLength={1024} />
        </Form.Item>
        <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
        {extraFields.data?.map((field, index) => (
          <ExtraFieldFormItem key={index} field={field} />
        ))}
      </Form>
    </Create>
  );
};

export default FilamentTypeCreate;
