import type { ZyndPaymentInfo } from '@/lib/types';

export interface AgentEvent {
  type: 'tool_call' | 'tool_result' | 'final' | 'done' | 'error' | 'superplane';
  tool?: string;
  input?: Record<string, unknown>;
  summary?: string;
  content?: string;
  iterationCount?: number;
  error?: string;
  status?: string;
}

export interface StreamQueryOptions {
  baseUrl: string;
  query: string;
  targetPath: string;
  onEvent: (event: AgentEvent) => void;
  onError: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onPaymentRequired?: (info: ZyndPaymentInfo) => void;
  onServiceUnavailable?: (message: string) => void;
  paymentHeader?: { name: string; value: string };
}

export function streamQuery(options: StreamQueryOptions): { close: () => void } {
  const {
    baseUrl,
    query,
    targetPath,
    onEvent,
    onError,
    onOpen,
    onClose,
    onPaymentRequired,
    onServiceUnavailable,
    paymentHeader,
  } = options;

  const params = new URLSearchParams({ query, targetPath });
  const url = `${baseUrl}/query/stream?${params.toString()}`;

  const controller = new AbortController();
  let completed = false;

  async function run() {
    let response: Response;

    const fetchHeaders: Record<string, string> = { Accept: 'text/event-stream' };
    if (paymentHeader) {
      fetchHeaders[paymentHeader.name] = paymentHeader.value;
    }

    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: fetchHeaders,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onError(err instanceof Error ? err : new Error(String(err)));
      onClose?.();
      return;
    }

    if (response.status === 402) {
      try {
        const body = await response.json();
        const info: ZyndPaymentInfo = {
          price: body.price ?? '0.01',
          currency: body.currency ?? 'USDC',
          walletAddress: body.walletAddress ?? '',
          agentId: body.agentId ?? '',
          paymentHeader: body.paymentHeader ?? 'x-payment',
        };
        onPaymentRequired?.(info);
      } catch {
        onPaymentRequired?.({ price: '0.01', currency: 'USDC', walletAddress: '', agentId: '', paymentHeader: 'x-payment' });
      }
      onClose?.();
      return;
    }

    if (response.status === 503) {
      try {
        const body = await response.json();
        onServiceUnavailable?.(body.error ?? 'Service unavailable');
      } catch {
        onServiceUnavailable?.('Service unavailable');
      }
      onClose?.();
      return;
    }

    if (!response.ok) {
      onError(new Error(`SSE connection failed with status ${response.status}`));
      onClose?.();
      return;
    }

    if (!response.body) {
      onError(new Error('SSE response has no body'));
      onClose?.();
      return;
    }

    onOpen?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          let parsed: AgentEvent;
          try {
            parsed = JSON.parse(data);
          } catch {
            onError(new Error(`Failed to parse SSE event: ${data}`));
            reader.cancel();
            onClose?.();
            return;
          }

          if (parsed.type === 'done') {
            completed = true;
          }
          onEvent(parsed);
        }
      }

      if (!completed) {
        onError(new Error('SSE stream ended without a done event'));
      }
      onClose?.();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      onError(err instanceof Error ? err : new Error(String(err)));
      onClose?.();
    }
  }

  run();

  return {
    close() {
      controller.abort();
      if (!completed) {
        onClose?.();
      }
    },
  };
}
