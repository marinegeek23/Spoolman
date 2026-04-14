import { EditOutlined, EyeOutlined, FileOutlined, FilterOutlined, PlusSquareOutlined } from "@ant-design/icons";
import { List, useTable } from "@refinedev/antd";
import { useInvalidate, useNavigation, useTranslate } from "@refinedev/core";
import { Button, Dropdown, Input, InputNumber, Select, Table } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ActionsColumn,
  CustomFieldColumn,
  DateColumn,
  FilteredQueryColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
  SpoolIconColumn,
} from "../../components/column";
import { useLiveify } from "../../components/liveify";
import {
  useSpoolmanArticleNumbers,
  useSpoolmanFilamentNames,
  useSpoolmanMaterials,
  useSpoolmanVendors,
} from "../../components/otherModels";
import { removeUndefined } from "../../utils/filtering";
import { getAPIURL } from "../../utils/url";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { TableState, useInitialTableState, useStoreInitialState } from "../../utils/saveload";
import { useCurrencyFormatter } from "../../utils/settings";
import { IFilament } from "./model";

dayjs.extend(utc);

interface IFilamentCollapsed extends Omit<IFilament, "vendor"> {
  "vendor.name": string | null;
}

function collapseFilament(element: IFilament): IFilamentCollapsed {
  let vendor_name: string | null;
  if (element.vendor) {
    vendor_name = element.vendor.name;
  } else {
    vendor_name = null;
  }
  return { ...element, "vendor.name": vendor_name };
}

function translateColumnI18nKey(columnName: string): string {
  columnName = columnName.replace(".", "_");
  return `filament.fields.${columnName}`;
}

const namespace = "filamentList-v2";

const allColumns: (keyof IFilamentCollapsed & string)[] = [
  "id",
  "vendor.name",
  "name",
  "material",
  "price",
  "density",
  "diameter",
  "weight",
  "spool_weight",
  "article_number",
  "settings_extruder_temp",
  "settings_bed_temp",
  "registered",
  "comment",
];
const defaultColumns = allColumns.filter(
  (column_id) => ["registered", "density", "diameter", "article_number"].indexOf(column_id) === -1,
);

export const FilamentList = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const extraFields = useGetFields(EntityType.filament);
  const currencyFormatter = useCurrencyFormatter();

  const allColumnsWithExtraFields = [...allColumns, ...(extraFields.data?.map((field) => "extra." + field.key) ?? [])];

  // Header filter state
  const [vendorFilter, setVendorFilter] = useState<string | undefined>(undefined);
  const [nameSearch, setNameSearch] = useState("");
  const [materialFilter, setMaterialFilter] = useState<string | undefined>(undefined);
  const vendorOptions = useSpoolmanVendors(true);
  const materialOptions = useSpoolmanMaterials(true);
  const materialFilterQuery = useSpoolmanMaterials();

  // Sync header filters to server-side filters (debounced for name search)
  useEffect(() => {
    const timer = setTimeout(() => {
      const otherFilters = filters.filter(
        (f) => "field" in f && !["vendor.name", "name", "material"].includes(f.field),
      );
      const newFilters = [...otherFilters];
      if (vendorFilter) newFilters.push({ field: "vendor.name", operator: "eq", value: vendorFilter });
      if (nameSearch.trim()) newFilters.push({ field: "name", operator: "eq", value: nameSearch.trim() });
      if (materialFilter) newFilters.push({ field: "material", operator: "eq", value: materialFilter });
      setFilters(newFilters, "replace");
    }, 300);
    return () => clearTimeout(timer);
  }, [vendorFilter, nameSearch, materialFilter]);

  // Load initial state
  const initialState = useInitialTableState(namespace);

  // Fetch data from the API
  // To provide the live updates, we use a custom solution (useLiveify) instead of the built-in refine "liveMode" feature.
  // This is because the built-in feature does not call the liveProvider subscriber with a list of IDs, but instead
  // calls it with a list of filters, sorters, etc. This means the server-side has to support this, which is quite hard.
  const { tableProps, sorters, setSorters, filters, setFilters, currentPage, pageSize, setCurrentPage } =
    useTable<IFilamentCollapsed>({
      syncWithLocation: false,
      pagination: {
        mode: "server",
        currentPage: initialState.pagination.currentPage,
        pageSize: initialState.pagination.pageSize,
      },
      sorters: {
        mode: "server",
        initial: initialState.sorters,
      },
      filters: {
        mode: "server",
        initial: initialState.filters,
      },
      liveMode: "manual",
      onLiveEvent(event) {
        if (event.type === "created" || event.type === "deleted") {
          // updated is handled by the liveify
          invalidate({
            resource: "filament",
            invalidates: ["list"],
          });
        }
      },
      queryOptions: {
        select(data) {
          return {
            total: data.total,
            data: data.data.map(collapseFilament),
          };
        },
      },
    });

  // Create state for the columns to show
  const [showColumns, setShowColumns] = useState<string[]>(initialState.showColumns ?? defaultColumns);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { currentPage: currentPage, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  // Collapse the dataSource to a mutable list
  const queryDataSource: IFilamentCollapsed[] = useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource],
  );
  const dataSource = useLiveify("filament", queryDataSource, collapseFilament);

  if (tableProps.pagination) {
    tableProps.pagination.showSizeChanger = true;
  }

  const { editUrl, showUrl, cloneUrl } = useNavigation();
  const filamentAddSpoolUrl = (id: number): string => `/spool/create?filament_id=${id}`;
  const actions = (record: IFilamentCollapsed) => [
    { name: t("buttons.show"), icon: <EyeOutlined />, link: showUrl("filament", record.id) },
    { name: t("buttons.edit"), icon: <EditOutlined />, link: editUrl("filament", record.id) },
    { name: t("buttons.clone"), icon: <PlusSquareOutlined />, link: cloneUrl("filament", record.id) },
    { name: t("filament.buttons.add_spool"), icon: <FileOutlined />, link: filamentAddSpoolUrl(record.id) },
  ];

  const commonProps = {
    t,
    navigate,
    actions,
    dataSource,
    tableState,
    sorter: true,
  };

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string | number | null | undefined>(undefined);
  const startEdit = (id: number, field: string, value: string | number | null | undefined) => {
    setEditingCell({ id, field });
    setEditingValue(value ?? undefined);
  };
  const cancelEdit = () => setEditingCell(null);
  const saveEdit = async (id: number, field: string, value: string | number | null | undefined) => {
    await fetch(getAPIURL() + `/filament/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value === undefined ? null : value }),
    });
    invalidate({ resource: "filament", invalidates: ["list"] });
    setEditingCell(null);
  };

  // Editable material column
  const materialColBase = FilteredQueryColumn({
    ...commonProps,
    id: "material",
    i18ncat: "filament",
    filterValueQuery: materialFilterQuery,
    width: 110,
  });
  const editableMaterialCol = materialColBase
    ? {
        ...materialColBase,
        onCell: (record: IFilamentCollapsed) => ({
          onDoubleClick: () => startEdit(record.id, "material", record.material),
          style: { cursor: "pointer" },
        }),
        render: (value: unknown, record: IFilamentCollapsed, index: number): React.ReactNode => {
          if (editingCell?.id === record.id && editingCell.field === "material") {
            return (
              <Select
                autoFocus
                size="small"
                style={{ minWidth: 120 }}
                value={editingValue as string | undefined}
                onChange={(v) => saveEdit(record.id, "material", v as string)}
                options={materialOptions.data?.map((m) => ({ label: m, value: m }))}
                showSearch
                filterOption={(input, option) =>
                  typeof option?.label === "string" && option.label.toLowerCase().includes(input.toLowerCase())
                }
              />
            );
          }
          return (materialColBase.render ? materialColBase.render(value, record, index) : value) as React.ReactNode;
        },
      }
    : undefined;

  // Editable weight column
  const weightColBase = NumberColumn({ ...commonProps, id: "weight", i18ncat: "filament", unit: "g", maxDecimals: 0, width: 100 });
  const editableWeightCol = weightColBase
    ? {
        ...weightColBase,
        onCell: (record: IFilamentCollapsed) => ({
          onDoubleClick: () => startEdit(record.id, "weight", record.weight),
          style: { cursor: "pointer" },
        }),
        render: (value: unknown, record: IFilamentCollapsed, index: number): React.ReactNode => {
          if (editingCell?.id === record.id && editingCell.field === "weight") {
            return (
              <InputNumber
                autoFocus
                size="small"
                style={{ width: 100 }}
                value={editingValue as number | undefined}
                onChange={(v) => setEditingValue(v ?? undefined)}
                onBlur={() => saveEdit(record.id, "weight", editingValue)}
                onPressEnter={() => saveEdit(record.id, "weight", editingValue)}
                onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                precision={0}
                addonAfter="g"
              />
            );
          }
          return (weightColBase.render ? weightColBase.render(value, record, index) : value) as React.ReactNode;
        },
      }
    : undefined;

  // Editable spool_weight column
  const spoolWeightColBase = NumberColumn({ ...commonProps, id: "spool_weight", i18ncat: "filament", unit: "g", maxDecimals: 0, width: 100 });
  const editableSpoolWeightCol = spoolWeightColBase
    ? {
        ...spoolWeightColBase,
        onCell: (record: IFilamentCollapsed) => ({
          onDoubleClick: () => startEdit(record.id, "spool_weight", record.spool_weight),
          style: { cursor: "pointer" },
        }),
        render: (value: unknown, record: IFilamentCollapsed, index: number): React.ReactNode => {
          if (editingCell?.id === record.id && editingCell.field === "spool_weight") {
            return (
              <InputNumber
                autoFocus
                size="small"
                style={{ width: 100 }}
                value={editingValue as number | undefined}
                onChange={(v) => setEditingValue(v ?? undefined)}
                onBlur={() => saveEdit(record.id, "spool_weight", editingValue)}
                onPressEnter={() => saveEdit(record.id, "spool_weight", editingValue)}
                onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                precision={0}
                addonAfter="g"
              />
            );
          }
          return (spoolWeightColBase.render ? spoolWeightColBase.render(value, record, index) : value) as React.ReactNode;
        },
      }
    : undefined;

  return (
    <List
      headerButtons={({ defaultButtons }) => (
        <>
          <Select
            allowClear
            placeholder="Manufacturer"
            style={{ width: 180 }}
            value={vendorFilter}
            onChange={(v) => setVendorFilter(v)}
            options={vendorOptions.data?.map((v) => ({ label: v, value: v }))}
            showSearch
            filterOption={(input, option) =>
              typeof option?.label === "string" && option.label.toLowerCase().includes(input.toLowerCase())
            }
          />
          <Input.Search
            placeholder="Search name..."
            allowClear
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            placeholder="Material"
            style={{ width: 140 }}
            value={materialFilter}
            onChange={(v) => setMaterialFilter(v)}
            options={materialOptions.data?.map((m) => ({ label: m, value: m }))}
            showSearch
            filterOption={(input, option) =>
              typeof option?.label === "string" && option.label.toLowerCase().includes(input.toLowerCase())
            }
          />
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
                  return {
                    key: column_id,
                    label: extraField?.name ?? column_id,
                  };
                }

                return {
                  key: column_id,
                  label: t(translateColumnI18nKey(column_id)),
                };
              }),
              selectedKeys: showColumns,
              selectable: true,
              multiple: true,
              onDeselect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
              onSelect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
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
      <Table<IFilamentCollapsed>
        {...tableProps}
        sticky
        tableLayout="auto"
        scroll={{ x: "max-content" }}
        dataSource={dataSource}
        rowKey="id"
        columns={removeUndefined([
          SortedColumn({
            ...commonProps,
            id: "id",
            i18ncat: "filament",
            width: 70,
          }),
          FilteredQueryColumn({
            ...commonProps,
            id: "vendor.name",
            i18nkey: "filament.fields.vendor_name",
            filterValueQuery: useSpoolmanVendors(),
          }),
          SpoolIconColumn({
            ...commonProps,
            id: "name",
            i18ncat: "filament",
            color: (record: IFilamentCollapsed) =>
              record.multi_color_hexes
                ? {
                    colors: record.multi_color_hexes.split(","),
                    vertical: record.multi_color_direction === "longitudinal",
                  }
                : record.color_hex,
            filterValueQuery: useSpoolmanFilamentNames(),
          }),
          editableMaterialCol,
          SortedColumn({
            ...commonProps,
            id: "price",
            i18ncat: "filament",
            align: "right",
            width: 80,
            render: (_, obj: IFilamentCollapsed) => {
              if (obj.price === undefined) {
                return "";
              }
              return currencyFormatter.format(obj.price);
            },
          }),
          NumberColumn({
            ...commonProps,
            id: "density",
            i18ncat: "filament",
            unit: "g/cm³",
            maxDecimals: 2,
            width: 100,
          }),
          NumberColumn({
            ...commonProps,
            id: "diameter",
            i18ncat: "filament",
            unit: "mm",
            maxDecimals: 2,
            width: 100,
          }),
          editableWeightCol,
          editableSpoolWeightCol,
          FilteredQueryColumn({
            ...commonProps,
            id: "article_number",
            i18ncat: "filament",
            filterValueQuery: useSpoolmanArticleNumbers(),
            width: 130,
          }),
          NumberColumn({
            ...commonProps,
            id: "settings_extruder_temp",
            i18ncat: "filament",
            unit: "°C",
            maxDecimals: 0,
            width: 100,
          }),
          NumberColumn({
            ...commonProps,
            id: "settings_bed_temp",
            i18ncat: "filament",
            unit: "°C",
            maxDecimals: 0,
            width: 100,
          }),
          DateColumn({
            ...commonProps,
            id: "registered",
            i18ncat: "filament",
          }),
          ...(extraFields.data?.map((field) => {
            return CustomFieldColumn({
              ...commonProps,
              field,
            });
          }) ?? []),
          RichColumn({
            ...commonProps,
            id: "comment",
            i18ncat: "filament",
            width: 150,
          }),
          ActionsColumn(t("table.actions"), actions),
        ])}
      />
    </List>
  );
};

export default FilamentList;
