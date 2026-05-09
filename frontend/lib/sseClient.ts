export interface AgentEvent {
  type: 'tool_call' | 'tool_result' | 'final' | 'done' | 'error';
  tool?: string;
  input?: Record<string, unknown>;
  summary?: string;
  content?: string;
  iterationCount?: number;
  error?: string;
}

export interface StreamQueryOptions {
  baseUrl: string;
  query: string;
  targetPath: string;
  onEvent: (event: AgentEvent) => void;
  onError: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function streamQuery(options: StreamQueryOptions): { close: () => void } {
  const { baseUrl, query, targetPath, onEvent, onError, onOpen, onClose } = options;

  const params = new URLSearchParams({ query, targetPath });
  const url = `${baseUrl}/query/stream?${params.toString()}`;

  const source = new EventSource(url);

  source.onopen = () => {
    onOpen?.();
  };

  source.onmessage = (messageEvent) => {
    try {
      const parsed: AgentEvent = JSON.parse(messageEvent.data);
      onEvent(parsed);
    } catch {
      onError(new Error(`Failed to parse SSE event: ${messageEvent.data}`));
      source.close();
      onClose?.();
    }
  };

  source.onerror = () => {
    onError(new Error('SSE connection error'));
    source.close();
    onClose?.();
  };

  return {
    close() {
      source.close();
      onClose?.();
    },
  };
}
