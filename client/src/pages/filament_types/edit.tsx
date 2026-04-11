import { Edit, useForm } from "@refinedev/antd";
import { HttpError, useTranslate } from "@refinedev/core";
import { Alert, Form, Input, InputNumber, Typography, message } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useEffect, useState } from "react";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { formatNumberOnUserInput, numberParser } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IFilamentType, IFilamentTypeParsedExtras } from "./model";

export const FilamentTypeEdit = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();
  const [hasChanged, setHasChanged] = useState(false);
  const extraFields = useGetFields(EntityType.filament_type);

  const { formProps, saveButtonProps } = useForm<IFilamentType, HttpError, IFilamentType, IFilamentType>({
    liveMode: "manual",
    onLiveEvent() {
      messageApi.warning(t("filament_type.form.filament_type_updated"));
      setHasChanged(true);
    },
  });

  if (formProps.initialValues) {
    formProps.initialValues = ParsedExtras(formProps.initialValues);
  }

  const originalOnFinish = formProps.onFinish;
  formProps.onFinish = (allValues: IFilamentTypeParsedExtras) => {
    if (allValues !== undefined && allValues !== null) {
      const stringifiedAllValues = StringifiedExtras<IFilamentTypeParsedExtras>(allValues);
      originalOnFinish?.({
        extra: {},
        ...stringifiedAllValues,
      });
    }
  };

  return (
    <Edit saveButtonProps={saveButtonProps}>
      {contextHolder}
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
      {hasChanged && <Alert description={t("filament_type.form.filament_type_updated")} type="warning" showIcon />}
    </Edit>
  );
};

export default FilamentTypeEdit;
