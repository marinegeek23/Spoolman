import { NumberField, Show, TextField } from "@refinedev/antd";
import { useShow, useTranslate } from "@refinedev/core";
import { Typography } from "antd";
import { ISpoolType } from "./model";

const { Title } = Typography;

export const SpoolTypeShow = () => {
  const t = useTranslate();

  const { query } = useShow<ISpoolType>({ liveMode: "auto" });
  const { data, isLoading } = query;
  const record = data?.data;

  const formatTitle = (item: ISpoolType) =>
    t("spool_type.titles.show_title", {
      id: item.id,
      vendor: item.vendor.name,
      interpolation: { escapeValue: false },
    });

  return (
    <Show isLoading={isLoading} title={record ? formatTitle(record) : ""}>
      <Title level={5}>{t("spool_type.fields.id")}</Title>
      <NumberField value={record?.id ?? ""} />
      <Title level={5}>{t("spool_type.fields.vendor_name")}</Title>
      <TextField value={record?.vendor.name} />
      {record?.category && (
        <>
          <Title level={5}>{t("spool_type.fields.category_name")}</Title>
          <TextField value={record.category.name} />
        </>
      )}
      {record?.weight !== undefined && (
        <>
          <Title level={5}>{t("spool_type.fields.weight")}</Title>
          <TextField value={`${record.weight} g`} />
        </>
      )}
      {record?.color && (
        <>
          <Title level={5}>{t("spool_type.fields.color")}</Title>
          <TextField value={record.color} />
        </>
      )}
    </Show>
  );
};

export default SpoolTypeShow;
