import { RobotOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Input, Modal, Space, Table, Typography } from "antd";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AssistResult, estimateAssistCost, useAssistStatus } from "../utils/assist";
import "./assist.css";

export interface AssistRow {
  key: string;
  label: string;
  current: ReactNode;
  suggested: ReactNode;
  // Whether the row starts out selected; usually true when the suggestion differs from the current value
  defaultChecked: boolean;
}

/**
 * Button that opens an assist modal. Renders nothing if assist isn't configured on the server.
 */
export function AssistButton(props: { onClick: () => void }) {
  const status = useAssistStatus();
  if (!status.data?.enabled) {
    return null;
  }
  return (
    <Button icon={<RobotOutlined />} onClick={props.onClick}>
      Assist
    </Button>
  );
}

/**
 * Tracks which form fields were filled by assist, so they can be highlighted.
 */
export function useAssistHighlight() {
  const [fields, setFields] = useState<Set<string>>(new Set());
  const highlight = useCallback((keys: string[]) => setFields((prev) => new Set([...prev, ...keys])), []);
  const cls = (key: string) => (fields.has(key) ? "assist-filled" : undefined);
  return { highlight, cls };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AssistModal<R extends AssistResult<any>>(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  defaultQuery: string;
  lookup: (query: string, signal: AbortSignal) => Promise<R>;
  buildRows: (result: R) => AssistRow[];
  onApply: (result: R, keys: string[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<R>();
  const [rows, setRows] = useState<AssistRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (props.open) {
      setQuery(props.defaultQuery);
      setError(undefined);
      setResult(undefined);
      setRows([]);
    } else {
      abortRef.current?.abort();
    }
  }, [props.open]);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  const runLookup = async () => {
    if (!query.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setElapsed(0);
    setError(undefined);
    setResult(undefined);
    try {
      const res = await props.lookup(query.trim(), controller.signal);
      const newRows = props.buildRows(res);
      setResult(res);
      setRows(newRows);
      setSelected(newRows.filter((r) => r.defaultChecked).map((r) => r.key));
    } catch (e) {
      if (!controller.signal.aborted) {
        setError((e as Error).message);
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const apply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      await props.onApply(result, selected);
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      title={
        <>
          <RobotOutlined /> {props.title}
        </>
      }
      open={props.open}
      onCancel={props.onClose}
      width={760}
      footer={[
        <Button key="cancel" onClick={props.onClose}>
          Cancel
        </Button>,
        <Button
          key="apply"
          type="primary"
          disabled={!result || selected.length === 0}
          loading={applying}
          onClick={apply}
        >
          Fill {selected.length} field{selected.length === 1 ? "" : "s"}
        </Button>,
      ]}
    >
      <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={runLookup}
          placeholder={props.placeholder}
          disabled={loading}
          autoFocus
        />
        <Button type="primary" onClick={runLookup} loading={loading}>
          {loading ? `Looking up… ${elapsed}s` : "Look up"}
        </Button>
      </Space.Compact>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      {result && (
        <>
          {result.notes && <Alert type="info" message={result.notes} style={{ marginBottom: 16 }} />}
          {rows.length === 0 ? (
            <Typography.Paragraph>No new information found.</Typography.Paragraph>
          ) : (
            <Table
              size="small"
              pagination={false}
              dataSource={rows}
              rowKey="key"
              columns={[
                {
                  key: "use",
                  width: 40,
                  render: (_, row) => (
                    <Checkbox
                      checked={selected.includes(row.key)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked ? [...prev, row.key] : prev.filter((k) => k !== row.key),
                        )
                      }
                    />
                  ),
                },
                { title: "Field", dataIndex: "label" },
                {
                  title: "Current",
                  dataIndex: "current",
                  render: (v) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
                },
                { title: "Suggested", dataIndex: "suggested" },
              ]}
            />
          )}
          {result.sources.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary">Sources: </Typography.Text>
              {result.sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && " · "}
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title || s.url}
                  </a>
                </span>
              ))}
            </div>
          )}
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
            {result.model} · {result.web_searches} search{result.web_searches === 1 ? "" : "es"} · ~$
            {estimateAssistCost(result).toFixed(3)}
          </Typography.Paragraph>
        </>
      )}
    </Modal>
  );
}
