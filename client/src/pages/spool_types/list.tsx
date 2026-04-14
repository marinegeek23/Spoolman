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
  NumberColumn,
  SortedColumn,
} from "../../components/column";
import { useLiveify } from "../../components/liveify";
import { removeUndefined } from "../../utils/filtering";
import { TableState, useInitialTableState, useStoreInitialState } from "../../utils/saveload";
import { ISpoolType } from "./model";

dayjs.extend(utc);

const namespace = "spoolTypeList-v1";

interface ISpoolTypeCollapsed extends Omit<ISpoolType, "vendor" | "category"> {
  "vendor.name": string;
  "category.name"?: string;
}

function collapseSpoolType(item: ISpoolType): ISpoolTypeCollapsed {
  return {
    ...item,
    "vendor.name": item.vendor.name,
    "category.name": item.category?.name,
  };
}

const allColumns: (keyof ISpoolTypeCollapsed & string)[] = [
  "id",
  "vendor.name",
  "category.name",
  "weight",
  "color",
];

export const SpoolTypeList = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();
  const navigate = useNavigate();

  const initialState = useInitialTableState(namespace);

  const { tableProps, sorters, setSorters, filters, setFilters, currentPage, pageSize, setCurrentPage } =
    useTable<ISpoolTypeCollapsed>({
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
          invalidate({ resource: "spool_type", invalidates: ["list"] });
        }
      },
      queryOptions: {
        select(data) {
          return {
            total: data.total,
            data: (data.data as unknown as ISpoolType[]).map(collapseSpoolType),
          };
        },
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

  const queryDataSource: ISpoolTypeCollapsed[] = useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource],
  );
  const dataSource = useLiveify("spool_type", queryDataSource, useCallback((r: unknown) => collapseSpoolType(r as ISpoolType), []));

  if (tableProps.pagination) {
    tableProps.pagination.showSizeChanger = true;
  }

  const { editUrl, showUrl, cloneUrl } = useNavigation();
  const actions = (record: ISpoolTypeCollapsed) => [
    { name: t("buttons.show"), icon: <EyeOutlined />, link: showUrl("spool_type", record.id) },
    { name: t("buttons.edit"), icon: <EditOutlined />, link: editUrl("spool_type", record.id) },
    { name: t("buttons.clone"), icon: <PlusSquareOutlined />, link: cloneUrl("spool_type", record.id) },
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
              items: allColumns.map((column_id) => ({
                key: column_id,
                label: t(`spool_type.fields.${column_id.replace(".", "_")}`),
              })),
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
          SortedColumn({ ...commonProps, id: "id", i18ncat: "spool_type", width: 70 }),
          SortedColumn({ ...commonProps, id: "vendor.name", i18nkey: "spool_type.fields.vendor_name" }),
          SortedColumn({ ...commonProps, id: "category.name", i18nkey: "spool_type.fields.category_name", width: 140 }),
          NumberColumn({ ...commonProps, id: "weight", i18ncat: "spool_type", unit: "g", maxDecimals: 1, width: 100 }),
          SortedColumn({ ...commonProps, id: "color", i18ncat: "spool_type", width: 120 }),
          ActionsColumn<ISpoolTypeCollapsed>(t("table.actions"), actions),
        ])}
      />
    </List>
  );
};

export default SpoolTypeList;
