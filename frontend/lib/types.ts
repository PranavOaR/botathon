export type TargetMode = 'local' | 'github';

export type ApifyStatus = 'unknown' | 'not_configured' | 'ready' | 'importing' | 'imported' | 'error';
export type ZyndStatus = 'demo_mode' | 'enabled' | 'payment_required' | 'error';
export type SuperplaneStatus = 'disabled' | 'pending' | 'event_emitted' | 'event_failed';

export interface IntegrationStatus {
  apify: ApifyStatus;
  zynd: ZyndStatus;
  superplane: SuperplaneStatus;
}
