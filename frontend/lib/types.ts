export type TargetMode = 'local' | 'github';

export type ApifyStatus = 'unknown' | 'not_configured' | 'ready' | 'importing' | 'imported' | 'error';
export type ZyndStatus = 'demo_mode' | 'enabled' | 'payment_required' | 'error';
export type SuperplaneStatus = 'disabled' | 'pending' | 'event_emitted' | 'event_failed';

export interface IntegrationStatus {
  apify: ApifyStatus;
  zynd: ZyndStatus;
  superplane: SuperplaneStatus;
}

export interface ZyndPaymentInfo {
  price: string;
  currency: string;
  walletAddress: string;
  agentId: string;
  paymentHeader: string;
}

// Backend /integrations/status response shape
export interface BackendIntegrationsStatus {
  apify: {
    configured: boolean;
    mode: 'apify' | 'github_fallback';
    hasApiToken: boolean;
    hasActorId: boolean;
    githubTokenConfigured: boolean;
  };
  zynd: {
    enabled: boolean;
    configured: boolean;
    price: string;
    currency: string;
    walletAddress: string;
    agentId: string;
    paymentHeader: string;
  };
  superplane: {
    enabled: boolean;
    configured: boolean;
    hasApiToken: boolean;
    hasCanvasId: boolean;
    endpoint: string;
  };
}
