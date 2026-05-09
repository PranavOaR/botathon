import { Router } from 'express';

export function createIntegrationsRouter(): Router {
  const router = Router();

  router.get('/integrations/status', (_req, res) => {
    const apifyApiToken = process.env['APIFY_API_TOKEN'] ?? '';
    const apifyActorId = process.env['APIFY_ACTOR_ID'] ?? '';
    const githubToken = process.env['GITHUB_TOKEN'] ?? '';

    const apifyHasApiToken = apifyApiToken.length > 0;
    const apifyHasActorId = apifyActorId.length > 0;
    const apifyConfigured = apifyHasApiToken && apifyHasActorId;

    const zyndEnabled = process.env['X402_ENABLED'] === 'true';
    const zyndWalletAddress = process.env['X402_WALLET_ADDRESS'] ?? '';
    const zyndAgentId = process.env['ZYND_AGENT_ID'] ?? '';
    const zyndConfigured = zyndEnabled && zyndWalletAddress.length > 0 && zyndAgentId.length > 0;

    const superplaneEnabled = process.env['SUPERPLANE_ENABLED'] === 'true';
    const superplaneApiToken = process.env['SUPERPLANE_API_TOKEN'] ?? '';
    const superplaneCanvasId = process.env['SUPERPLANE_CANVAS_ID'] ?? '';
    const superplaneHasApiToken = superplaneApiToken.length > 0;
    const superplaneHasCanvasId = superplaneCanvasId.length > 0;
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
