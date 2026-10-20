import { useQuery } from "@tanstack/react-query";
import { getAPIURL } from "./url";

export interface AssistStatus {
  enabled: boolean;
  model: string;
}

export interface AssistSource {
  title: string;
  url: string;
}

export interface AssistResult<F> {
  fields: F;
  notes: string;
  sources: AssistSource[];
  model: string;
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
}

export function useAssistStatus() {
  return useQuery<AssistStatus>({
    queryKey: ["assistStatus"],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch(getAPIURL() + "/assist/status");
      if (!response.ok) {
        return { enabled: false, model: "" };
      }
      return response.json();
    },
  });
}

/**
 * Run an assist lookup. Throws an Error with the server's message on failure.
 */
export async function runAssist<F>(task: string, body: object, signal?: AbortSignal): Promise<AssistResult<F>> {
  const response = await fetch(`${getAPIURL()}/assist/${task}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message ?? `Assist request failed (${response.status})`);
  }
  return response.json();
}

/**
 * Rough cost estimate in USD, for showing next to a result.
 */
export function estimateAssistCost(result: AssistResult<unknown>): number {
  const prices: Record<string, [number, number]> = {
    "claude-opus-5-5": [4, 20],
    "claude-sonnet-5-5": [2, 10],
    "claude-haiku-5-5": [0.1, 0.5],
  };
  const [inPrice, outPrice] = prices[result.model] ?? [4, 20];
  return (result.input_tokens * inPrice + result.output_tokens * outPrice) / 1_000_000 + result.web_searches * 0.01;
}
