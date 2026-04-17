import { FileOutlined, HighlightOutlined, PlusOutlined, UnorderedListOutlined, UserOutlined } from "@ant-design/icons";
import { useList, useTranslate } from "@refinedev/core";
import { Card, Col, Row, Statistic, theme, Typography } from "antd";
import { Content } from "antd/es/layout/layout";
import Title from "antd/es/typography/Title";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { ReactNode, useMemo } from "react";
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
  "#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6",
  "#1abc9c","#e67e22","#34495e","#16a085","#d35400",
  "#7f8c8d","#c0392b","#2980b9","#27ae60","#f1c40f",
];

function materialColor(name: string, idx: number): string {
  const upper = name.toUpperCase();
  for (const [key, color] of Object.entries(MATERIAL_COLORS)) {
    if (upper.includes(key)) return color;
  }
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
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
}

function DonutChart({ data, total, label, size = 220 }: DonutChartProps) {
  const { token } = useToken();
  const cx = size / 2;
  const cy = size / 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 13 }}>{label}</Typography.Text>
      <div style={{ position: "relative", width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            data={data}
            cx={cx}
            cy={cy}
            innerRadius={size * 0.32}
            outerRadius={size * 0.48}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={1}
            stroke={token.colorBgContainer}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [formatWeight(value as number), name as string]}
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
            {formatWeight(total)}
          </div>
          <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Total</div>
        </div>
      </div>
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
      const hex = spool.filament?.color_hex;
      const key = hex ?? "none";
      const color = hex ? `#${hex}` : "#555555";
      const name = hex ? `#${hex}` : "No color";
      const weight = spool.remaining_weight ?? 0;
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

  const totalWeight = useMemo(
    () => colorChartData.reduce((s, d) => s + d.value, 0),
    [colorChartData]
  );

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
        maxWidth: 900,
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
          <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 24 }}>
            <DonutChart data={colorChartData} total={totalWeight} label="Color" />
            <DonutChart data={materialChartData} total={totalWeight} label="Material" />
          </div>
          <div style={{ textAlign: "center", marginTop: 12, color: token.colorTextSecondary, fontSize: 12 }}>
            Total remaining weight: {formatWeight(totalWeight)} · Non-archived spools
          </div>
        </div>
      )}

      {!hasSpools && (
        <>
          <p style={{ marginTop: 32 }}>{t("home.welcome")}</p>
          <p>
            <Trans
              i18nKey="home.description"
              components={{ helpPageLink: <Link to="/help" /> }}
            />
          </p>
        </>
      )}
    </Content>
  );
};

export default Home;
