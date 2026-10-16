import { FileOutlined, HighlightOutlined, PlusOutlined, UnorderedListOutlined, UserOutlined } from "@ant-design/icons";
import { useList, useTranslate } from "@refinedev/core";
import { Card, Col, Row, Statistic, theme, Typography } from "antd";
import { Content } from "antd/es/layout/layout";
import Title from "antd/es/typography/Title";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { CSSProperties, ReactNode, useMemo } from "react";
import { Trans } from "react-i18next";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { Link } from "react-router";
import Logo from "../../icon.svg?react";
import { IFilament } from "../filaments/model";
import { ISpool } from "../spools/model";

dayjs.extend(utc);

const { useToken } = theme;

const MATERIAL_COLORS: Record<string, string> = {
  PLA: "#4e9af1",
  PETG: "#2ecc71",
  ABS: "#e74c3c",
  TPU: "#f39c12",
  ASA: "#9b59b6",
  Nylon: "#1abc9c",
  PC: "#e67e22",
  HIPS: "#34495e",
  PVA: "#16a085",
  Wood: "#8B4513",
  Metal: "#95a5a6",
  Carbon: "#2c3e50",
};

const FALLBACK_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#34495e",
  "#16a085",
  "#d35400",
  "#7f8c8d",
  "#c0392b",
  "#2980b9",
  "#27ae60",
  "#f1c40f",
];

function materialColor(name: string, idx: number): string {
  const upper = name.toUpperCase();
  for (const [key, color] of Object.entries(MATERIAL_COLORS)) {
    if (upper.includes(key)) return color;
  }
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

// Sentinel color for the multicolor family; rendered as a gradient.
const MULTICOLOR = "multicolor";
const MULTICOLOR_STOPS = ["#e74c3c", "#f39c12", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6"];

// Color families in display order, with a representative slice color.
const COLOR_FAMILIES: { name: string; color: string }[] = [
  { name: "Black", color: "#1a1a1a" },
  { name: "White", color: "#f5f5f5" },
  { name: "Gray / Silver", color: "#9e9e9e" },
  { name: "Red", color: "#d32f2f" },
  { name: "Orange", color: "#f57c00" },
  { name: "Yellow / Gold", color: "#fbc02d" },
  { name: "Green", color: "#388e3c" },
  { name: "Blue", color: "#1976d2" },
  { name: "Purple", color: "#7b1fa2" },
  { name: "Pink", color: "#ec6fa8" },
  { name: "Brown / Tan", color: "#8d6e63" },
  { name: "Multicolor", color: MULTICOLOR },
  { name: "Unknown", color: "#555555" },
];

function colorFamily(hex: string | undefined, multiColorHexes: string | undefined): string {
  if (multiColorHexes) return "Multicolor";
  if (!hex || !/^[0-9a-f]{6}/i.test(hex)) return "Unknown";
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }

  if (l < 0.12) return "Black";
  if (s < 0.2) {
    if (l > 0.85) return "White";
    if (l < 0.2) return "Black";
    return "Gray / Silver";
  }
  if (l > 0.93) return "White";
  // Muted dark reds/oranges read as brown
  if ((h >= 345 || h < 40) && l < 0.45 && s < 0.4) return "Brown / Tan";
  if (h >= 18 && h < 40 && (l < 0.4 || l > 0.75 || s < 0.5)) return "Brown / Tan";
  if (h < 18 || h >= 345) return l > 0.65 ? "Pink" : "Red";
  if (h < 40) return "Orange";
  if (h < 70) return "Yellow / Gold";
  if (h < 175) return "Green";
  if (h < 250) return "Blue";
  if (h < 300) return l > 0.75 ? "Pink" : "Purple";
  if (h < 330) return l > 0.45 ? "Pink" : "Purple";
  return l > 0.45 ? "Pink" : "Red";
}

const PLA_BASE = ["pla", "pla+", "pla matte", "hs pla", "pla pro", "pla hs", "pla meta"];
const PETG_BASE = ["petg", "rapid petg", "rapid petg matte", "petg rapid"];

type MaterialGroup = "pla" | "plaSpecial" | "petg" | "petgSpecial";

function materialGroup(material: string | undefined): MaterialGroup | undefined {
  const m = (material ?? "").trim().toLowerCase();
  if (!m) return undefined;
  if (PLA_BASE.includes(m)) return "pla";
  if (PETG_BASE.includes(m)) return "petg";
  if (m === "support for pla" || m === "cope") return undefined;
  if (/\bpla\b/.test(m)) return "plaSpecial";
  if (/\bpetg\b/.test(m) || m === "pctg" || m === "pet") return "petgSpecial";
  return undefined;
}

function formatWeight(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(1)}kg`;
  return `${Math.round(g)}g`;
}

interface DonutChartProps {
  data: { name: string; value: number; color: string }[];
  total: number;
  label: string;
  size?: number;
  formatValue?: (v: number) => string;
  totalLabel?: string;
}

function DonutChart({
  data,
  total,
  label,
  size = 220,
  formatValue = formatWeight,
  totalLabel = "Total",
}: DonutChartProps) {
  const { token } = useToken();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 13 }}>{label}</Typography.Text>
      <div style={{ position: "relative", width: size, height: size }}>
        <PieChart width={size} height={size} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="multicolorGradient" x1="0" y1="0" x2="1" y2="1">
              {MULTICOLOR_STOPS.map((c, i) => (
                <stop key={i} offset={`${(i / (MULTICOLOR_STOPS.length - 1)) * 100}%`} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.32}
            outerRadius={size * 0.48}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={1}
            stroke={token.colorBgContainer}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color === MULTICOLOR ? "url(#multicolorGradient)" : entry.color} />
            ))}
          </Pie>
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [formatValue(value as number), name as string]}
            contentStyle={{
              backgroundColor: token.colorBgElevated,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadius,
              fontSize: 12,
            }}
          />
        </PieChart>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: token.colorText, lineHeight: 1.2 }}>
            {formatValue(total)}
          </div>
          <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{totalLabel}</div>
        </div>
      </div>
    </div>
  );
}

interface LegendProps {
  data: DonutChartProps["data"];
  formatValue?: (v: number) => string;
  style?: CSSProperties;
}

function Legend({ data, formatValue = formatWeight, style }: LegendProps) {
  const { token } = useToken();
  return (
    <div style={style}>
      {data.map((entry) => (
        <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background:
                entry.color === MULTICOLOR ? `linear-gradient(135deg, ${MULTICOLOR_STOPS.join(", ")})` : entry.color,
              border: `1px solid ${token.colorBorderSecondary}`,
              flexShrink: 0,
            }}
          />
          <span style={{ color: token.colorText, flexGrow: 1 }}>{entry.name}</span>
          <span style={{ color: token.colorTextSecondary, marginLeft: 8 }}>{formatValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartWithLegend({ data, total, label, size, formatValue = formatWeight, totalLabel }: DonutChartProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
      <DonutChart
        data={data}
        total={total}
        label={label}
        size={size}
        formatValue={formatValue}
        totalLabel={totalLabel}
      />
      <Legend data={data} formatValue={formatValue} style={{ paddingTop: 24, minWidth: 140 }} />
    </div>
  );
}

export const Home = () => {
  const { token } = useToken();
  const t = useTranslate();

  const spools = useList<ISpool>({
    resource: "spool",
    pagination: { pageSize: 1 },
  });
  const filaments = useList<IFilament>({
    resource: "filament",
    pagination: { pageSize: 1 },
  });
  const vendors = useList<ISpool>({
    resource: "vendor",
    pagination: { pageSize: 1 },
  });

  const allSpools = useList<ISpool>({
    resource: "spool",
    pagination: { mode: "off" },
    filters: [{ field: "allow_archived", operator: "eq", value: false }],
  });

  const hasSpools = !spools.result || spools.result.data.length > 0;

  const colorChartData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    for (const spool of allSpools.result?.data ?? []) {
      const f = spool.filament;
      const weight = spool.remaining_weight ?? 0;
      let key: string, name: string, color: string;
      if (f?.color_hex) {
        key = f.color_hex;
        color = `#${f.color_hex}`;
        name = `#${f.color_hex}`;
      } else if (f?.multi_color_hexes) {
        const dir = f.multi_color_direction ?? "coextruded";
        key = `multi_${dir}`;
        name = dir === "longitudinal" ? "Longitudinal" : "Coextruded";
        color = dir === "longitudinal" ? "#a78bfa" : "#f472b6";
      } else {
        key = "none";
        name = "No color";
        color = "#555555";
      }
      const existing = map.get(key);
      if (existing) existing.value += weight;
      else map.set(key, { name, value: weight, color });
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [allSpools.result?.data]);

  const materialChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const spool of allSpools.result?.data ?? []) {
      const mat = spool.filament?.material ?? "Unknown";
      map.set(mat, (map.get(mat) ?? 0) + (spool.remaining_weight ?? 0));
    }
    return Array.from(map.entries())
      .map(([name, value], idx) => ({ name, value, color: materialColor(name, idx) }))
      .sort((a, b) => b.value - a.value);
  }, [allSpools.result?.data]);

  const colorFamilyCharts = useMemo(() => {
    const counts: Record<MaterialGroup, Map<string, number>> = {
      pla: new Map(),
      plaSpecial: new Map(),
      petg: new Map(),
      petgSpecial: new Map(),
    };
    for (const spool of allSpools.result?.data ?? []) {
      const group = materialGroup(spool.filament?.material);
      if (!group) continue;
      const family = colorFamily(spool.filament?.color_hex, spool.filament?.multi_color_hexes);
      counts[group].set(family, (counts[group].get(family) ?? 0) + 1);
    }
    const toData = (map: Map<string, number>) => {
      const data = COLOR_FAMILIES.filter((f) => map.has(f.name))
        .map((f) => ({ name: f.name, value: map.get(f.name) ?? 0, color: f.color }))
        .sort((a, b) => b.value - a.value);
      return { data, total: data.reduce((s, d) => s + d.value, 0) };
    };
    return {
      pla: toData(counts.pla),
      plaSpecial: toData(counts.plaSpecial),
      petg: toData(counts.petg),
      petgSpecial: toData(counts.petgSpecial),
    };
  }, [allSpools.result?.data]);

  const totalWeight = useMemo(() => colorChartData.reduce((s, d) => s + d.value, 0), [colorChartData]);

  const ResourceStatsCard = (props: { loading: boolean; value: number; resource: string; icon: ReactNode }) => (
    <Col xs={12} md={6}>
      <Card
        loading={props.loading}
        actions={[
          <Link to={`/${props.resource}`} key="resource">
            <UnorderedListOutlined />
          </Link>,
          <Link to={`/${props.resource}/create`} key="create">
            <PlusOutlined />
          </Link>,
        ]}
      >
        <Statistic title={t(`${props.resource}.${props.resource}`)} value={props.value} prefix={props.icon} />
      </Card>
    </Col>
  );

  return (
    <Content
      style={{
        padding: "2em 20px",
        minHeight: 280,
        maxWidth: 1600,
        margin: "0 auto",
        backgroundColor: token.colorBgContainer,
        borderRadius: token.borderRadiusLG,
        color: token.colorText,
        fontFamily: token.fontFamily,
        fontSize: token.fontSizeLG,
        lineHeight: 1.5,
      }}
    >
      <Title
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: token.fontSizeHeading1,
        }}
      >
        <div style={{ display: "inline-block", height: "1.5em", marginRight: "0.5em" }}>
          <Logo />
        </div>
        Spoolman
      </Title>
      <Row justify="center" gutter={[16, 16]} style={{ marginTop: "3em" }}>
        <ResourceStatsCard
          resource="spool"
          value={spools.result?.total || 0}
          loading={spools.query.isLoading}
          icon={<FileOutlined />}
        />
        <ResourceStatsCard
          resource="filament"
          value={filaments.result?.total || 0}
          loading={filaments.query.isLoading}
          icon={<HighlightOutlined />}
        />
        <ResourceStatsCard
          resource="vendor"
          value={vendors.result?.total || 0}
          loading={vendors.query.isLoading}
          icon={<UserOutlined />}
        />
      </Row>

      {hasSpools && totalWeight > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 96 }}>
            <DonutChart data={colorChartData} total={totalWeight} label="Color" />
            <DonutChart data={materialChartData} total={totalWeight} label="Material" />
          </div>
          <Legend
            data={materialChartData}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              columnGap: 32,
              maxWidth: 4 * 180 + 3 * 32,
              margin: "24px auto 0",
            }}
          />
          <div style={{ textAlign: "center", marginTop: 12, color: token.colorTextSecondary, fontSize: 12 }}>
            Total remaining weight: {formatWeight(totalWeight)} · Non-archived spools
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              flexWrap: "wrap",
              gap: 32,
              marginTop: 40,
            }}
          >
            {(
              [
                ["pla", "PLA by Color"],
                ["plaSpecial", "PLA Special by Color"],
                ["petg", "PETG by Color"],
                ["petgSpecial", "PETG Special by Color"],
              ] as [MaterialGroup, string][]
            )
              .filter(([key]) => colorFamilyCharts[key].total > 0)
              .map(([key, label]) => (
                <ChartWithLegend
                  key={key}
                  data={colorFamilyCharts[key].data}
                  total={colorFamilyCharts[key].total}
                  label={label}
                  size={180}
                  formatValue={(v) => String(v)}
                  totalLabel="Spools"
                />
              ))}
          </div>
        </div>
      )}

      {!hasSpools && (
        <>
          <p style={{ marginTop: 32 }}>{t("home.welcome")}</p>
          <p>
            <Trans i18nKey="home.description" components={{ helpPageLink: <Link to="/help" /> }} />
          </p>
        </>
      )}
    </Content>
  );
};

export default Home;
