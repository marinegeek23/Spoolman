import { Create, useForm, useSelect, useThemedLayoutContext } from "@refinedev/antd";
import { HttpError, IResourceComponentsProps, useInvalidate, useTranslate } from "@refinedev/core";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Checkbox, Col, ColorPicker, Divider, Form, Input, InputNumber, Modal, Radio, Row, Select, Space, Typography, theme } from "antd";
import TextArea from "antd/es/input/TextArea";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSavedState } from "../../utils/saveload";
import { getAPIURL } from "../../utils/url";
import { useGetPrintSettings } from "../printing/printing";
import SpoolQRCodePrintingDialog from "../printing/spoolQrCodePrintingDialog";
import { ExtraFieldFormItem, ParsedExtras, StringifiedExtras } from "../../components/extraFields";
import { FilamentImportModal } from "../../components/filamentImportModal";
import { MultiColorPicker } from "../../components/multiColorPicker";
import { formatNumberOnUserInput, numberParser, numberParserAllowEmpty } from "../../utils/parsing";
import { ExternalFilament } from "../../utils/queryExternalDB";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { getCurrencySymbol, useCurrency } from "../../utils/settings";
import { getOrCreateVendorFromExternal } from "../vendors/functions";
import { IFilamentType } from "../filament_types/model";
import { IVendor } from "../vendors/model";
import { IFilament, IFilamentParsedExtras } from "./model";

dayjs.extend(utc);

const NAMED_COLORS: [string, number, number, number][] = [
  ["White", 255, 255, 255],
  ["Black", 0, 0, 0],
  ["Light Gray", 200, 200, 200],
  ["Gray", 128, 128, 128],
  ["Dark Gray", 64, 64, 64],
  ["Silver", 192, 192, 192],
  ["Red", 220, 20, 20],
  ["Dark Red", 139, 0, 0],
  ["Orange", 255, 100, 0],
  ["Yellow", 255, 215, 0],
  ["Lime", 0, 210, 80],
  ["Green", 0, 160, 0],
  ["Dark Green", 0, 80, 0],
  ["Teal", 0, 130, 130],
  ["Cyan", 0, 200, 210],
  ["Sky Blue", 100, 170, 240],
  ["Blue", 0, 80, 200],
  ["Dark Blue", 0, 0, 140],
  ["Purple", 120, 0, 180],
  ["Violet", 148, 0, 211],
  ["Pink", 255, 130, 180],
  ["Hot Pink", 255, 20, 147],
  ["Magenta", 210, 0, 170],
  ["Brown", 140, 70, 20],
  ["Beige", 210, 190, 150],
  ["Gold", 255, 195, 0],
];

function hexToColorName(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "Color";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  let closest = "Color";
  let minDist = Infinity;
  for (const [name, nr, ng, nb] of NAMED_COLORS) {
    const rMean = (r + nr) / 2;
    const dr = r - nr,
      dg = g - ng,
      db = b - nb;
    const dist = Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
    if (dist < minDist) {
      minDist = dist;
      closest = name;
    }
  }
  return closest;
}

function generateFilamentName(
  vendor: string | undefined,
  material: string | undefined,
  colorType: "single" | "multi",
  colorHex: string | undefined,
  multiColorHexes: string | undefined,
): string {
  const parts: string[] = [];
  if (vendor) parts.push(vendor);
  if (material) parts.push(material);
  if (colorType === "single" && colorHex) {
    parts.push(hexToColorName(colorHex));
  } else if (colorType === "multi" && multiColorHexes) {
    const hexes = multiColorHexes.split(",").filter(Boolean);
    if (hexes.length > 0) parts.push(hexes.map(hexToColorName).join("/"));
  }
  return parts.join(" ");
}

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

type IFilamentRequest = Omit<IFilamentParsedExtras, "id" | "registered"> & {
  vendor_id: number;
};

export const FilamentCreate = (props: IResourceComponentsProps & CreateOrCloneProps) => {
  const t = useTranslate();
  const { token } = theme.useToken();
  const { siderCollapsed } = useThemedLayoutContext();
  const siderWidth = siderCollapsed ? 80 : 200;
  const extraFields = useGetFields(EntityType.filament);
  const currency = useCurrency();
  const [isImportExtOpen, setIsImportExtOpen] = useState(false);
  const invalidate = useInvalidate();
  const [colorType, setColorType] = useState<"single" | "multi">("single");

  const { form, formProps, formLoading, onFinish, redirect } = useForm<
    IFilament,
    HttpError,
    IFilamentRequest,
    IFilamentParsedExtras
  >({ redirect: false });

  if (!formProps.initialValues) {
    formProps.initialValues = {};
  }

  if (props.mode === "clone") {
    // Fix the vendor_id
    if (formProps.initialValues.vendor) {
      formProps.initialValues.vendor_id = formProps.initialValues.vendor.id;
    }

    // Parse the extra fields from string values into real types
    formProps.initialValues = ParsedExtras(formProps.initialValues);
  }

  const watchedMaterial = Form.useWatch("material", form);

  const MATERIAL_DENSITIES: [string, number][] = [
    ["PETG", 1.27],
    ["PLA", 1.24],
    ["ABS", 1.04],
    ["ASA", 1.07],
    ["PET", 1.38],
    ["TPU", 1.21],
    ["PA6", 1.13],
  ];

  useEffect(() => {
    if (props.mode !== "create" || !watchedMaterial) return;
    const upper = watchedMaterial.toUpperCase();
    for (const [material, density] of MATERIAL_DENSITIES) {
      if (upper.includes(material)) {
        form.setFieldValue("density", density);
        break;
      }
    }
  }, [watchedMaterial]);

  const { selectProps: vendorSelect } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
    pagination: { mode: "off" },
  });

  const { selectProps: filamentTypeSelect, query: filamentTypeQuery } = useSelect<IFilamentType>({
    resource: "filament_type",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "id", order: "desc" }],
  });

  const watchedFilamentTypeId = Form.useWatch("filament_type_id", form);

  useEffect(() => {
    if (props.mode !== "create" || !watchedFilamentTypeId) return;
    const ft = filamentTypeQuery.data?.data?.find((item) => item.id === watchedFilamentTypeId);
    if (!ft) return;
    form.setFieldValue("material", ft.name);
    if (ft.density) form.setFieldValue("density", ft.density);
    if (ft.settings_extruder_temp) form.setFieldValue("settings_extruder_temp", ft.settings_extruder_temp);
    if (ft.settings_bed_temp) form.setFieldValue("settings_bed_temp", ft.settings_bed_temp);
  }, [watchedFilamentTypeId]);

  const watchedColorHex = Form.useWatch("color_hex", form);
  const watchedMultiColorHexes = Form.useWatch("multi_color_hexes", form);
  const watchedVendorId = Form.useWatch("vendor_id", form);
  const lastAutoName = useRef("");

  const watchedVendorName = vendorSelect.options?.find((o) => o.value === watchedVendorId)?.label as string | undefined;

  useEffect(() => {
    if (props.mode !== "create") return;
    const newName = generateFilamentName(watchedVendorName, watchedMaterial, colorType, watchedColorHex, watchedMultiColorHexes);
    if (!newName) return;
    const currentName = (form.getFieldValue("name") as string) ?? "";
    if (currentName && currentName !== lastAutoName.current) return;
    if (newName === lastAutoName.current) return;
    lastAutoName.current = newName;
    form.setFieldValue("name", newName);
  }, [watchedVendorName, watchedMaterial, colorType, watchedColorHex, watchedMultiColorHexes]);

  // Autofill spool_weight from spool type when vendor changes (create mode only)
  useEffect(() => {
    if (props.mode !== "create" || !watchedVendorId) return;
    const currentSpoolWeight = form.getFieldValue("spool_weight") as number | undefined;
    if (currentSpoolWeight) return;
    fetch(getAPIURL() + `/spool_type?vendor_id=${watchedVendorId}&limit=1`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { weight?: number }[]) => {
        if (data.length > 0 && data[0].weight) {
          form.setFieldValue("spool_weight", data[0].weight);
        }
      })
      .catch(() => undefined);
  }, [watchedVendorId]);

  const [spoolQuantity, setSpoolQuantity] = useState(1);
  const [addToPrintQueue, setAddToPrintQueue] = useState(true);
  const [, setPrintQueue] = useSavedState<number[]>("printQueue", []);
  const [selectedPrintPresetId, setSelectedPrintPresetId] = useState<string | undefined>(undefined);
  const [printModalSpoolIds, setPrintModalSpoolIds] = useState<number[]>([]);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const redirectAfterPrintRef = useRef<"list" | "create">("list");
  const printPresets = useGetPrintSettings();

  const [ftSortOrder, setFtSortOrder] = useState<"lastAdded" | "alphAsc" | "alphDesc">("lastAdded");

  const sortedFilamentTypeOptions = useMemo(() => {
    const opts = filamentTypeSelect.options ?? [];
    if (ftSortOrder === "alphAsc") {
      return [...opts].sort((a, b) =>
        (a.label as string).localeCompare(b.label as string, undefined, { sensitivity: "base" }),
      );
    } else if (ftSortOrder === "alphDesc") {
      return [...opts].sort((a, b) =>
        (b.label as string).localeCompare(a.label as string, undefined, { sensitivity: "base" }),
      );
    }
    return opts; // lastAdded: keep server order (id desc)
  }, [filamentTypeSelect.options, ftSortOrder]);

  const [quickTypeOpen, setQuickTypeOpen] = useState(false);
  const [quickTypeName, setQuickTypeName] = useState("");
  const [quickTypeLoading, setQuickTypeLoading] = useState(false);

  const handleQuickCreateFilamentType = async () => {
    if (!quickTypeName.trim()) return;
    setQuickTypeLoading(true);
    try {
      const res = await fetch(getAPIURL() + "/filament_type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: quickTypeName.trim() }),
      });
      if (res.ok) {
        const newType = await res.json();
        await invalidate({ resource: "filament_type", invalidates: ["list"] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (form as any).setFieldValue("filament_type_id", newType.id);
        form.setFieldValue("material", newType.name);
        setQuickTypeOpen(false);
        setQuickTypeName("");
      }
    } finally {
      setQuickTypeLoading(false);
    }
  };

  const handleSubmit = async (redirectTo: "list" | "create") => {
    const values = StringifiedExtras(await form.validateFields());
    const result = await onFinish(values);
    const filamentId = (result as { data?: { id?: number } })?.data?.id;

    const spoolIds: number[] = [];
    if (filamentId && spoolQuantity > 0) {
      for (let i = 0; i < spoolQuantity; i++) {
        const res = await fetch(getAPIURL() + "/spool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filament_id: filamentId }),
        });
        if (res.ok) {
          const spool = await res.json();
          if (spool?.id) spoolIds.push(spool.id);
        }
      }
      if (addToPrintQueue && spoolIds.length > 0) {
        setPrintQueue((prev) => [...prev, ...spoolIds]);
      }
    }

    if (selectedPrintPresetId && spoolIds.length > 0) {
      localStorage.setItem("selectedPreset", JSON.stringify(selectedPrintPresetId));
      redirectAfterPrintRef.current = redirectTo;
      setPrintModalSpoolIds(spoolIds);
      setPrintModalOpen(true);
    } else {
      redirect(redirectTo);
    }
  };

  const importFilament = async (filament: ExternalFilament) => {
    const vendor = await getOrCreateVendorFromExternal(filament.manufacturer);
    await invalidate({
      resource: "vendor",
      invalidates: ["list", "detail"],
    });

    setColorType(filament.color_hexes ? "multi" : "single");

    form.setFieldsValue({
      name: filament.name,
      vendor_id: vendor.id,
      material: filament.material,
      density: filament.density,
      diameter: filament.diameter,
      weight: filament.weight,
      spool_weight: filament.spool_weight || undefined,
      color_hex: filament.color_hex,
      multi_color_hexes: filament.color_hexes?.join(",") || undefined,
      multi_color_direction: filament.multi_color_direction,
      settings_extruder_temp: filament.extruder_temp || undefined,
      settings_bed_temp: filament.bed_temp || undefined,
    });
  };

  // Use useEffect to update the form's initialValues when the extra fields are loaded
  // This is necessary because the form is rendered before the extra fields are loaded
  useEffect(() => {
    extraFields.data?.forEach((field) => {
      if (formProps.initialValues && field.default_value) {
        const parsedValue = JSON.parse(field.default_value as string);
        form.setFieldsValue({ extra: { [field.key]: parsedValue } });
      }
    });
  }, [form, extraFields.data, formProps.initialValues]);

  const fixedBarStyle = {
    position: "fixed" as const,
    top: 64,
    left: siderWidth,
    right: 0,
    zIndex: 10,
    backgroundColor: token.colorBgContainer,
    borderBottom: `1px solid ${token.colorBorderSecondary}`,
    padding: "8px 24px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "left 0.2s",
  };

  return (
    <>
      <div style={fixedBarStyle}>
        <Button type="primary" onClick={() => setIsImportExtOpen(true)}>
          {t("filament.form.import_external")}
        </Button>
        <Button type="primary" onClick={() => handleSubmit("list")}>
          {t("buttons.save")}
        </Button>
        <Button type="primary" onClick={() => handleSubmit("create")}>
          {t("buttons.saveAndAdd")}
        </Button>
      </div>
      <Create
        title={props.mode === "create" ? t("filament.titles.create") : t("filament.titles.clone")}
        isLoading={formLoading}
        wrapperProps={{ style: { paddingTop: 48 } }}
        headerButtons={() => null}
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
      <FilamentImportModal
        isOpen={isImportExtOpen}
        onImport={(value) => {
          setIsImportExtOpen(false);
          importFilament(value);
        }}
        onClose={() => setIsImportExtOpen(false)}
      />
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("filament.fields.vendor")}
          name={["vendor_id"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select
            {...vendorSelect}
            allowClear
            filterSort={(a, b) => {
              return a?.label && b?.label
                ? (a.label as string).localeCompare(b.label as string, undefined, { sensitivity: "base" })
                : 0;
            }}
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.material")}
          help={t("filament.fields_help.material")}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Form.Item name={["filament_type_id"]} rules={[{ required: true }]} noStyle>
              <Select
                {...filamentTypeSelect}
                options={sortedFilamentTypeOptions}
                allowClear
                placeholder="Select a material type"
                style={{ width: 220 }}
                filterOption={(input, option) =>
                  typeof option?.label === "string" && option.label.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setQuickTypeOpen(true)}
            >
              New Type
            </Button>
            <Radio.Group
              size="small"
              value={ftSortOrder}
              onChange={(e) => setFtSortOrder(e.target.value)}
              optionType="button"
              options={[
                { label: "Last Added", value: "lastAdded" },
                { label: "A→Z", value: "alphAsc" },
                { label: "Z→A", value: "alphDesc" },
              ]}
            />
          </div>
        </Form.Item>
        <Form.Item name={["material"]} hidden>
          <Input />
        </Form.Item>
        <Modal
          title="Create Filament Type"
          open={quickTypeOpen}
          onCancel={() => { setQuickTypeOpen(false); setQuickTypeName(""); }}
          onOk={handleQuickCreateFilamentType}
          okText="Create"
          confirmLoading={quickTypeLoading}
          okButtonProps={{ disabled: !quickTypeName.trim() }}
        >
          <Form layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="Name" required>
              <Input
                value={quickTypeName}
                onChange={(e) => setQuickTypeName(e.target.value)}
                onPressEnter={handleQuickCreateFilamentType}
                maxLength={64}
                autoFocus
                placeholder="e.g. PLA, PETG, ABS"
              />
            </Form.Item>
          </Form>
        </Modal>
        <Form.Item label={t("filament.fields.color_hex")}>
          <Radio.Group
            onChange={(value) => {
              setColorType(value.target.value);
            }}
            defaultValue={colorType}
            value={colorType}
          >
            <Radio.Button value={"single"}>{t("filament.fields.single_color")}</Radio.Button>
            <Radio.Button value={"multi"}>{t("filament.fields.multi_color")}</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {colorType == "single" && (
          <Form.Item
            name={"color_hex"}
            rules={[
              {
                required: false,
              },
            ]}
            getValueFromEvent={(e) => {
              return e?.toHex();
            }}
          >
            <ColorPicker format="hex" />
          </Form.Item>
        )}
        {colorType == "multi" && (
          <Form.Item
            name={"multi_color_direction"}
            help={t("filament.fields_help.multi_color_direction")}
            rules={[
              {
                required: true,
              },
            ]}
            initialValue={"coaxial"}
          >
            <Radio.Group>
              <Radio.Button value={"coaxial"}>{t("filament.fields.coaxial")}</Radio.Button>
              <Radio.Button value={"longitudinal"}>{t("filament.fields.longitudinal")}</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}
        {colorType == "multi" && (
          <Form.Item
            name={"multi_color_hexes"}
            rules={[
              {
                required: false,
              },
            ]}
          >
            <MultiColorPicker min={2} max={14} />
          </Form.Item>
        )}
        <Form.Item
          label={t("filament.fields.name")}
          help={t("filament.fields_help.name")}
          name={["name"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Row gutter={24}>
          <Col xs={24} sm={12}>
            <Form.Item
              label={t("filament.fields.density")}
              name={["density"]}
              rules={[{ required: true, type: "number", min: 0, max: 100 }]}
            >
              <InputNumber addonAfter="g/cm³" precision={2} formatter={formatNumberOnUserInput} parser={numberParser} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label={t("filament.fields.diameter")}
              name={["diameter"]}
              initialValue={1.75}
              rules={[{ required: true, type: "number", min: 0, max: 10 }]}
            >
              <InputNumber addonAfter="mm" precision={2} formatter={formatNumberOnUserInput} parser={numberParser} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label={t("filament.fields.weight")}
              help={t("filament.fields_help.weight")}
              name={["weight"]}
              initialValue={1000}
              rules={[{ required: false, type: "number", min: 0 }]}
            >
              <InputNumber addonAfter="g" precision={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label={t("filament.fields.spool_weight")}
              help={t("filament.fields_help.spool_weight")}
              name={["spool_weight"]}
              rules={[{ required: false, type: "number", min: 0 }]}
            >
              <InputNumber addonAfter="g" precision={1} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label={t("filament.fields.price")}
              help={t("filament.fields_help.price")}
              name={["price"]}
              rules={[{ required: false, type: "number", min: 0 }]}
            >
              <InputNumber
                addonAfter={getCurrencySymbol(undefined, currency)}
                precision={2}
                formatter={formatNumberOnUserInput}
                parser={numberParserAllowEmpty}
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item
              label={t("filament.fields.settings_extruder_temp")}
              name={["settings_extruder_temp"]}
              rules={[{ required: false, type: "number", min: 0 }]}
            >
              <InputNumber addonAfter="°C" precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label={t("filament.fields.settings_bed_temp")}
              name={["settings_bed_temp"]}
              rules={[{ required: false, type: "number", min: 0 }]}
            >
              <InputNumber addonAfter="°C" precision={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Divider />
        <Typography.Title level={5}>Create Spools</Typography.Title>
        <Form.Item label="Number of spools to create" style={{ marginBottom: 8 }}>
          <InputNumber
            min={0}
            max={100}
            precision={0}
            value={spoolQuantity}
            onChange={(v) => setSpoolQuantity(v ?? 0)}
            style={{ width: 120 }}
          />
        </Form.Item>
        {spoolQuantity > 0 && (
          <Form.Item style={{ marginBottom: 8 }}>
            <Checkbox checked={addToPrintQueue} onChange={(e) => setAddToPrintQueue(e.target.checked)}>
              Add to print queue
            </Checkbox>
          </Form.Item>
        )}
        {spoolQuantity > 0 && (
          <Form.Item label="Print labels" style={{ marginBottom: 0 }}>
            <Select
              allowClear
              placeholder="Select a print preset (optional)"
              style={{ width: "50%" }}
              value={selectedPrintPresetId}
              onChange={(v) => {
                setSelectedPrintPresetId(v);
                if (v) setAddToPrintQueue(false);
              }}
              options={printPresets?.map((p) => ({
                label: p.labelSettings.printSettings.name || "Unnamed preset",
                value: p.labelSettings.printSettings.id,
              }))}
            />
          </Form.Item>
        )}
        <Modal
          open={printModalOpen}
          onCancel={() => {
            setPrintModalOpen(false);
            redirect(redirectAfterPrintRef.current);
          }}
          width="95vw"
          style={{ top: 20 }}
          title="Print Labels"
          footer={
            <Button
              type="primary"
              onClick={() => {
                setPrintModalOpen(false);
                redirect(redirectAfterPrintRef.current);
              }}
            >
              Done
            </Button>
          }
          destroyOnHidden
        >
          <SpoolQRCodePrintingDialog
            spoolIds={printModalSpoolIds}
            onClose={() => {
              setPrintModalOpen(false);
              redirect(redirectAfterPrintRef.current);
            }}
          />
        </Modal>
        <Divider />
        <Form.Item
          label={t("filament.fields.comment")}
          name={["comment"]}
          rules={[{ required: false }]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
        <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
        {extraFields.data?.map((field, index) => (
          <ExtraFieldFormItem key={index} field={field} />
        ))}
      </Form>
      </Create>
    </>
  );
};

export default FilamentCreate;
