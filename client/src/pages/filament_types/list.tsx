import { EditOutlined, EyeOutlined, FilterOutlined, PlusSquareOutlined } from "@ant-design/icons";
import { List, useTable } from "@refinedev/antd";
import { useInvalidate, useNavigation, useTranslate } from "@refinedev/core";
import { Button, Dropdown, Table } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ActionsColumn,
  CustomFieldColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
} from "../../components/column";
import { useLiveify } from "../../components/liveify";
import { removeUndefined } from "../../utils/filtering";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { TableState, useInitialTableState, useStoreInitialState } from "../../utils/saveload";
import { IFilamentType } from "./model";

dayjs.extend(utc);

const namespace = "filamentTypeList-v1";

const allColumns: (keyof IFilamentType & string)[] = [
  "id",
  "name",
  "density",
  "settings_extruder_temp",
  "settings_bed_temp",
  "comment",
];

export const FilamentTypeList = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const extraFields = useGetFields(EntityType.filament_type);

  const allColumnsWithExtraFields = [...allColumns, ...(extraFields.data?.map((field) => "extra." + field.key) ?? [])];

  const initialState = useInitialTableState(namespace);

  const { tableProps, sorters, setSorters, filters, setFilters, currentPage, pageSize, setCurrentPage } =
    useTable<IFilamentType>({
      syncWithLocation: false,
      pagination: {
        mode: "server",
        currentPage: initialState.pagination.currentPage,
        pageSize: initialState.pagination.pageSize,
      },
      sorters: { mode: "server", initial: initialState.sorters },
      filters: { mode: "server", initial: initialState.filters },
      liveMode: "manual",
      onLiveEvent(event) {
        if (event.type === "created" || event.type === "deleted") {
          invalidate({ resource: "filament_type", invalidates: ["list"] });
        }
      },
    });

  const [showColumns, setShowColumns] = useState<string[]>(initialState.showColumns ?? allColumns);

  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  const queryDataSource: IFilamentType[] = useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource],
  );
  const dataSource = useLiveify("filament_type", queryDataSource, useCallback((record: IFilamentType) => record, []));

  if (tableProps.pagination) {
    tableProps.pagination.showSizeChanger = true;
  }

  const { editUrl, showUrl, cloneUrl } = useNavigation();
  const actions = (record: IFilamentType) => [
    { name: t("buttons.show"), icon: <EyeOutlined />, link: showUrl("filament_type", record.id) },
    { name: t("buttons.edit"), icon: <EditOutlined />, link: editUrl("filament_type", record.id) },
    { name: t("buttons.clone"), icon: <PlusSquareOutlined />, link: cloneUrl("filament_type", record.id) },
  ];

  const commonProps = { t, navigate, actions, dataSource, tableState, sorter: true };

  return (
    <List
      headerButtons={({ defaultButtons }) => (
        <>
          <Button
            type="primary"
            icon={<FilterOutlined />}
            onClick={() => {
              setFilters([], "replace");
              setSorters([{ field: "id", order: "asc" }]);
              setCurrentPage(1);
            }}
          >
            {t("buttons.clearFilters")}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: allColumnsWithExtraFields.map((column_id) => {
                if (column_id.indexOf("extra.") === 0) {
                  const extraField = extraFields.data?.find((field) => "extra." + field.key === column_id);
                  return { key: column_id, label: extraField?.name ?? column_id };
                }
                return { key: column_id, label: t(`filament_type.fields.${column_id}`) };
              }),
              selectedKeys: showColumns,
              selectable: true,
              multiple: true,
              onDeselect: (keys) => setShowColumns(keys.selectedKeys),
              onSelect: (keys) => setShowColumns(keys.selectedKeys),
            }}
          >
            <Button type="primary" icon={<EditOutlined />}>
              {t("buttons.hideColumns")}
            </Button>
          </Dropdown>
          {defaultButtons}
        </>
      )}
    >
      <Table
        {...tableProps}
        sticky
        tableLayout="auto"
        scroll={{ x: "max-content" }}
        dataSource={dataSource}
        rowKey="id"
        columns={removeUndefined([
          SortedColumn({ ...commonProps, id: "id", i18ncat: "filament_type", width: 70 }),
          SortedColumn({ ...commonProps, id: "name", i18ncat: "filament_type" }),
          NumberColumn({ ...commonProps, id: "density", i18ncat: "filament_type", unit: "g/cm³", maxDecimals: 2, width: 120 }),
          NumberColumn({ ...commonProps, id: "settings_extruder_temp", i18ncat: "filament_type", unit: "°C", maxDecimals: 0, width: 140 }),
          NumberColumn({ ...commonProps, id: "settings_bed_temp", i18ncat: "filament_type", unit: "°C", maxDecimals: 0, width: 120 }),
          ...(extraFields.data?.map((field) => CustomFieldColumn({ ...commonProps, field })) ?? []),
          RichColumn({ ...commonProps, id: "comment", i18ncat: "filament_type" }),
          ActionsColumn<IFilamentType>(t("table.actions"), actions),
        ])}
      />
    </List>
  );
};

export default FilamentTypeList;
