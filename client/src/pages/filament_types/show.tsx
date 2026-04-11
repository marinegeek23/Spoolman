import { NumberField, Show, TextField } from "@refinedev/antd";
import { useShow, useTranslate } from "@refinedev/core";
import { Typography } from "antd";
import { ExtraFieldDisplay } from "../../components/extraFields";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IFilamentType } from "./model";

const { Title } = Typography;

export const FilamentTypeShow = () => {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.filament_type);

  const { query } = useShow<IFilamentType>({ liveMode: "auto" });
  const { data, isLoading } = query;
  const record = data?.data;

  const formatTitle = (item: IFilamentType) =>
    t("filament_type.titles.show_title", { id: item.id, name: item.name, interpolation: { escapeValue: false } });

  return (
    <Show isLoading={isLoading} title={record ? formatTitle(record) : ""}>
      <Title level={5}>{t("filament_type.fields.id")}</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>{t("filament_type.fields.name")}</Title>
      <TextField value={record?.name} />
      {record?.density !== undefined && (
        <>
          <Title level={5}>{t("filament_type.fields.density")}</Title>
          <TextField value={`${record.density} g/cm³`} />
        </>
      )}
      {record?.settings_extruder_temp !== undefined && (
        <>
          <Title level={5}>{t("filament_type.fields.settings_extruder_temp")}</Title>
          <TextField value={`${record.settings_extruder_temp} °C`} />
        </>
      )}
      {record?.settings_bed_temp !== undefined && (
        <>
          <Title level={5}>{t("filament_type.fields.settings_bed_temp")}</Title>
          <TextField value={`${record.settings_bed_temp} °C`} />
        </>
      )}
      {record?.comment && (
        <>
          <Title level={5}>{t("filament_type.fields.comment")}</Title>
          <TextField value={record.comment} />
        </>
      )}
      <Title level={4}>{t("settings.extra_fields.tab")}</Title>
      {extraFields?.data?.map((field, index) => (
        <ExtraFieldDisplay key={index} field={field} value={record?.extra[field.key]} />
      ))}
    </Show>
  );
};

export default FilamentTypeShow;
