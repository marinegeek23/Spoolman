import { useInvalidate, useTranslate } from "@refinedev/core";
import { FormInstance } from "antd";
import { ReactNode } from "react";
import { AssistModal, AssistRow } from "../../components/assistModal";
import { AssistResult, runAssist } from "../../utils/assist";
import { getAPIURL } from "../../utils/url";
import { IFilamentType } from "../filament_types/model";

interface FilamentAssistFields {
  vendor: string | null;
  name: string | null;
  material: string | null;
  density: number | null;
  diameter: number | null;
  weight: number | null;
  spool_weight: number | null;
  price: number | null;
  settings_extruder_temp: number | null;
  settings_bed_temp: number | null;
  color_hex: string | null;
  color_hexes: string[] | null;
  multi_color_direction: "coaxial" | "longitudinal" | null;
}

type FilamentAssistResult = AssistResult<FilamentAssistFields>;

const NUMBER_FIELDS = [
  "density",
  "diameter",
  "weight",
  "spool_weight",
  "price",
  "settings_extruder_temp",
  "settings_bed_temp",
] as const;

interface VendorOption {
  label: string;
  value: number;
}

function normalizeHex(hex: string): string {
  return hex.replace("#", "").toLowerCase().slice(0, 6);
}

function Swatches(props: { hexes: string[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {props.hexes.map((hex, i) => (
        <span
          key={i}
          title={`#${hex}`}
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            border: "1px solid rgba(128,128,128,0.5)",
            background: `#${hex}`,
          }}
        />
      ))}
      <span style={{ marginLeft: 4 }}>{props.hexes.map((h) => `#${h}`).join(", ")}</span>
    </span>
  );
}

async function postJSON<T>(path: string, body: object): Promise<T> {
  const res = await fetch(getAPIURL() + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to create ${path.slice(1)} (${res.status})`);
  }
  return res.json();
}

/**
 * Assist modal for the filament create/edit forms: looks up the filament on the web and fills in the form.
 */
export function FilamentAssistModal(props: {
  open: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: FormInstance<any>;
  vendors: VendorOption[];
  filamentTypes: IFilamentType[];
  currency: string;
  colorType: "single" | "multi";
  setColorType: (type: "single" | "multi") => void;
  onFilled: (formFields: string[]) => void;
}) {
  const t = useTranslate();
  const invalidate = useInvalidate();
  const { form, vendors, filamentTypes } = props;

  const findVendor = (name: string) => vendors.find((v) => v.label.toLowerCase() === name.toLowerCase());
  const findType = (name: string) => filamentTypes.find((ft) => ft.name.toLowerCase() === name.toLowerCase());

  const currentValues = () => {
    const values = form.getFieldsValue(true);
    const vendor = vendors.find((v) => v.value === values.vendor_id)?.label;
    return { ...values, vendor };
  };

  const defaultQuery = () => {
    if (!props.open) return "";
    const values = currentValues();
    if (values.name) {
      return values.vendor && !values.name.toLowerCase().startsWith(values.vendor.toLowerCase())
        ? `${values.vendor} ${values.name}`
        : values.name;
    }
    return [values.vendor, values.material].filter(Boolean).join(" ");
  };

  const lookup = (query: string, signal: AbortSignal) => {
    const values = currentValues();
    const current: Record<string, unknown> = {
      vendor: values.vendor,
      name: values.name,
      material: values.material,
      density: values.density,
      diameter: values.diameter,
      weight: values.weight,
      spool_weight: values.spool_weight,
      price: values.price,
      settings_extruder_temp: values.settings_extruder_temp,
      settings_bed_temp: values.settings_bed_temp,
    };
    if (props.colorType === "single") {
      current.color_hex = values.color_hex;
    } else {
      current.color_hexes = values.multi_color_hexes?.split(",");
      current.multi_color_direction = values.multi_color_direction;
    }
    return runAssist<FilamentAssistFields>(
      "filament",
      {
        query,
        current,
        vendors: vendors.map((v) => v.label),
        materials: filamentTypes.map((ft) => ft.name),
        currency: props.currency,
      },
      signal,
    ) as Promise<FilamentAssistResult>;
  };

  const buildRows = (result: FilamentAssistResult): AssistRow[] => {
    const f = result.fields;
    const values = currentValues();
    const rows: AssistRow[] = [];
    const add = (key: string, label: string, current: ReactNode, suggested: ReactNode, differs: boolean) =>
      rows.push({ key, label, current: current || undefined, suggested, defaultChecked: differs });

    if (f.vendor) {
      const existing = findVendor(f.vendor);
      add(
        "vendor",
        t("filament.fields.vendor"),
        values.vendor,
        existing ? existing.label : `${f.vendor} (new vendor)`,
        existing?.value !== values.vendor_id,
      );
    }
    if (f.material) {
      const existing = findType(f.material);
      add(
        "material",
        t("filament.fields.material"),
        values.material,
        existing ? existing.name : `${f.material} (new type)`,
        existing?.name !== values.material,
      );
    }
    if (f.name) {
      add("name", t("filament.fields.name"), values.name, f.name, f.name !== values.name);
    }

    const hexes = (f.color_hexes ?? []).map(normalizeHex);
    const currentHexes: string[] =
      props.colorType === "multi"
        ? (values.multi_color_hexes ?? "").split(",").filter(Boolean)
        : values.color_hex
          ? [normalizeHex(values.color_hex)]
          : [];
    if (hexes.length > 1) {
      add(
        "color",
        t("filament.fields.color_hex"),
        currentHexes.length ? <Swatches hexes={currentHexes} /> : undefined,
        <>
          <Swatches hexes={hexes} /> ({f.multi_color_direction ?? "coaxial"})
        </>,
        hexes.join(",") !== currentHexes.join(","),
      );
    } else if (f.color_hex || hexes.length === 1) {
      const hex = f.color_hex ? normalizeHex(f.color_hex) : hexes[0];
      add(
        "color",
        t("filament.fields.color_hex"),
        currentHexes.length ? <Swatches hexes={currentHexes} /> : undefined,
        <Swatches hexes={[hex]} />,
        currentHexes.join(",") !== hex,
      );
    }

    for (const key of NUMBER_FIELDS) {
      const value = f[key];
      if (value !== null && value !== undefined) {
        add(key, t(`filament.fields.${key}`), values[key], value, Number(values[key]) !== value);
      }
    }
    return rows;
  };

  const onApply = async (result: FilamentAssistResult, keys: string[]) => {
    const f = result.fields;
    const filled: string[] = [];

    // Vendor and material first: changing them triggers effects on the page (auto-name, type defaults)
    // that the remaining fields should then override.
    if (keys.includes("vendor") && f.vendor) {
      let vendorId = findVendor(f.vendor)?.value;
      if (vendorId === undefined) {
        vendorId = (await postJSON<{ id: number }>("/vendor", { name: f.vendor })).id;
        await invalidate({ resource: "vendor", invalidates: ["list"] });
      }
      form.setFieldValue("vendor_id", vendorId);
      filled.push("vendor_id");
    }
    if (keys.includes("material") && f.material) {
      let type = findType(f.material);
      if (!type) {
        type = await postJSON<IFilamentType>("/filament_type", { name: f.material });
        await invalidate({ resource: "filament_type", invalidates: ["list"] });
      }
      form.setFieldValue("filament_type_id", type.id);
      form.setFieldValue("material", type.name);
      filled.push("filament_type_id");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const values: Record<string, unknown> = {};
    if (keys.includes("name") && f.name) {
      values.name = f.name;
      filled.push("name");
    }
    if (keys.includes("color")) {
      const hexes = (f.color_hexes ?? []).map(normalizeHex);
      if (hexes.length > 1) {
        props.setColorType("multi");
        values.multi_color_hexes = hexes.join(",");
        values.multi_color_direction = f.multi_color_direction ?? "coaxial";
        filled.push("multi_color_hexes", "multi_color_direction");
      } else {
        props.setColorType("single");
        values.color_hex = f.color_hex ? normalizeHex(f.color_hex) : hexes[0];
        filled.push("color_hex");
      }
    }
    for (const key of NUMBER_FIELDS) {
      if (keys.includes(key) && f[key] !== null) {
        values[key] = f[key];
        filled.push(key);
      }
    }
    form.setFieldsValue(values);
    props.onFilled(filled);
  };

  return (
    <AssistModal
      open={props.open}
      onClose={props.onClose}
      title="Look up filament"
      placeholder="e.g. Elegoo Rapid PETG Grey, or a product page URL"
      defaultQuery={defaultQuery()}
      lookup={lookup}
      buildRows={buildRows}
      onApply={onApply}
    />
  );
}
