import { Router } from 'express';

function isSet(val: string): boolean {
  return val.length > 0 && !val.includes('...');
}

export function createIntegrationsRouter(): Router {
  const router = Router();

  router.get('/integrations/status', (_req, res) => {
    const apifyApiToken = (process.env['APIFY_API_TOKEN'] ?? '').trim();
    const apifyActorId = (process.env['APIFY_ACTOR_ID'] ?? '').trim();
    const githubToken = (process.env['GITHUB_TOKEN'] ?? '').trim();

    const apifyHasApiToken = isSet(apifyApiToken);
    const apifyHasActorId = isSet(apifyActorId);
    const apifyConfigured = apifyHasApiToken && apifyHasActorId;

    const zyndEnabled = process.env['X402_ENABLED'] === 'true';
    const zyndWalletAddress = (process.env['X402_WALLET_ADDRESS'] ?? '').trim();
    const zyndAgentId = (process.env['ZYND_AGENT_ID'] ?? '').trim();
    const zyndConfigured = zyndEnabled && isSet(zyndWalletAddress) && isSet(zyndAgentId);

    const superplaneEnabled = process.env['SUPERPLANE_ENABLED'] === 'true';
    const superplaneApiToken = (process.env['SUPERPLANE_API_TOKEN'] ?? '').trim();
    const superplaneCanvasId = (process.env['SUPERPLANE_CANVAS_ID'] ?? '').trim();
    const superplaneHasApiToken = isSet(superplaneApiToken);
    const superplaneHasCanvasId = isSet(superplaneCanvasId);
    const superplaneConfigured = superplaneEnabled && superplaneHasApiToken && superplaneHasCanvasId;

    res.json({
      apify: {
        configured: apifyConfigured,
        mode: apifyConfigured ? 'apify' : 'github_fallback',
        hasApiToken: apifyHasApiToken,
        hasActorId: apifyHasActorId,
        githubTokenConfigured: githubToken.length > 0,
      },
      zynd: {
        enabled: zyndEnabled,
        configured: zyndConfigured,
        price: process.env['X402_PRICE_USDC'] ?? '0.01',
        currency: 'USDC',
        walletAddress: zyndWalletAddress,
        agentId: zyndAgentId,
        paymentHeader: process.env['X402_PAYMENT_HEADER'] ?? 'x-payment',
      },
      superplane: {
        enabled: superplaneEnabled,
        configured: superplaneConfigured,
        hasApiToken: superplaneHasApiToken,
        hasCanvasId: superplaneHasCanvasId,
        endpoint: process.env['SUPERPLANE_ENDPOINT'] ?? 'https://api.superplane.dev/v1/events',
      },
    });
  });

  return router;
}
