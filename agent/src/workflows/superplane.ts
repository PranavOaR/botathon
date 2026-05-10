// ─── Types ────────────────────────────────────────────────────────────────────

export type SuperplaneEmitResult = 'emitted' | 'failed' | 'disabled' | 'not_configured';

export interface InvestigationPayload {
  sessionId: string;
  query: string;
  targetPath: string;
  repoUrl?: string;
  filesRead: string[];
  iterationCount: number;
  timestamp: string;
}

interface SuperplaneEvent {
  type: 'filemind.investigation.completed';
  canvasId: string;
  payload: InvestigationPayload;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSuperplaneConfig(): {
  enabled: boolean;
  apiToken: string | undefined;
  canvasId: string | undefined;
  endpoint: string;
} {
  return {
    enabled: process.env['SUPERPLANE_ENABLED'] === 'true',
    apiToken: process.env['SUPERPLANE_API_TOKEN'],
    canvasId: process.env['SUPERPLANE_CANVAS_ID'],
    // TODO: Confirm exact Superplane endpoint URL once API docs are available
    endpoint: process.env['SUPERPLANE_ENDPOINT'] ?? 'https://api.superplane.dev/v1/events',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Emits a `filemind.investigation.completed` event to Superplane.
 *
 * Never throws. Returns a result indicating what happened.
 * Feature-flagged via SUPERPLANE_ENABLED env var.
 *
 * TODO: Adjust request body shape once official Superplane API is confirmed.
 */
export async function emitInvestigationCompleted(
  payload: InvestigationPayload
): Promise<SuperplaneEmitResult> {
  const config = getSuperplaneConfig();

  if (!config.enabled) {
    return 'disabled';
  }

  if (!config.apiToken || !config.canvasId) {
    console.warn(
      '[superplane] SUPERPLANE_API_TOKEN and SUPERPLANE_CANVAS_ID must be set ' +
      'when SUPERPLANE_ENABLED=true — skipping event emit'
    );
    return 'not_configured';
  }

  const event: SuperplaneEvent = {
    type: 'filemind.investigation.completed',
    canvasId: config.canvasId,
    payload,
  };

  try {
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      console.warn(
        `[superplane] Event emit failed (${res.status}): ${body}`
      );
      return 'failed';
    }

    console.log(`[superplane] Emitted investigation.completed for session ${payload.sessionId}`);
    return 'emitted';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[superplane] Network error emitting event: ${message}`);
    return 'failed';
  }
}

/**
 * Extract a GitHub repo URL from a local remote path, if applicable.
 * Paths under .filemind/remote/<owner>-<repo>-<branch> can be reverse-parsed.
 * Returns undefined for local paths.
 */
export function extractRepoUrl(targetPath: string): string | undefined {
  const remoteMarker = '.filemind/remote/';
  const idx = targetPath.indexOf(remoteMarker);
  if (idx === -1) return undefined;

  const slug = targetPath.slice(idx + remoteMarker.length);
  // slug format: <owner>-<repo>-<branch>
  // We can't reliably split on '-' since owner/repo names can contain hyphens,
  // so we emit the slug as a GitHub URL hint best-effort.
  return `https://github.com/${slug}`;
}
