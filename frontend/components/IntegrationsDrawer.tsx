'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Cloud,
  CreditCard,
  Zap,
  Server,
  ShieldAlert,
} from 'lucide-react';
import type {
  ApifyStatus,
  ZyndStatus,
  SuperplaneStatus,
  IntegrationStatus,
  ZyndPaymentInfo,
} from '@/lib/types';

type BackendStatus = 'checking' | 'connected' | 'error';

interface IntegrationsDrawerProps {
  open: boolean;
  onClose: () => void;
  backendStatus: BackendStatus;
  integrations: IntegrationStatus;
  zyndPaymentInfo: ZyndPaymentInfo | null;
}

const APIFY_LABEL: Record<ApifyStatus, string> = {
  unknown:        'unknown',
  not_configured: 'not configured',
  ready:          'ready',
  importing:      'importing',
  imported:       'imported',
  error:          'error',
};

const ZYND_LABEL: Record<ZyndStatus, string> = {
  demo_mode:        'demo mode',
  enabled:          'enabled',
  payment_required: 'payment required',
  error:            'error',
};

const SUPERPLANE_LABEL: Record<SuperplaneStatus, string> = {
  disabled:      'disabled',
  pending:       'pending',
  event_emitted: 'event emitted',
  event_failed:  'event failed',
};

const BACKEND_LABEL: Record<BackendStatus, string> = {
  checking:  'connecting',
  connected: 'connected',
  error:     'unavailable',
};

interface IntegrationRowProps {
  icon: React.ReactNode;
  name: string;
  status: string;
  statusLabel: string;
}

function IntegrationRow({ icon, name, status, statusLabel }: IntegrationRowProps) {
  return (
    <div className="integration-row">
      <div className="integration-row__name">
        <span className="integration-row__icon" aria-hidden="true">
          {icon}
        </span>
        {name}
      </div>
      <span className={`status-badge status-badge--${status}`}>{statusLabel}</span>
    </div>
  );
}

function PaymentCard({ info }: { info: ZyndPaymentInfo }) {
  const truncate = (s: string, max = 22) =>
    !s ? '—' : s.length <= max ? s : `${s.slice(0, 8)}…${s.slice(-8)}`;

  return (
    <div className="payment-card" role="alert">
      <div className="payment-card__title">
        <ShieldAlert size={14} aria-hidden="true" />
        Payment required
      </div>
      <div className="payment-card__sub">
        This agent is gated behind an x402 micropayment. Submit the payment header to unlock streaming.
      </div>
      <div className="payment-row">
        <span className="payment-row__label">Price</span>
        <span className="payment-row__value payment-row__price">
          {info.price} {info.currency}
        </span>
      </div>
      <div className="payment-row">
        <span className="payment-row__label">Wallet</span>
        <span className="payment-row__value" title={info.walletAddress || ''}>
          {truncate(info.walletAddress)}
        </span>
      </div>
      <div className="payment-row">
        <span className="payment-row__label">Agent ID</span>
        <span className="payment-row__value" title={info.agentId || ''}>
          {truncate(info.agentId)}
        </span>
      </div>
      <div className="payment-row">
        <span className="payment-row__label">Header</span>
        <span className="payment-row__value">{info.paymentHeader}</span>
      </div>
    </div>
  );
}

export default function IntegrationsDrawer({
  open,
  onClose,
  backendStatus,
  integrations,
  zyndPaymentInfo,
}: IntegrationsDrawerProps) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="drawer-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            aria-hidden="true"
          />
          <motion.aside
            key="drawer"
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Integrations panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="drawer__header">
              <div className="drawer__title">Integrations</div>
              <button
                type="button"
                className="drawer__close"
                onClick={onClose}
                aria-label="Close integrations panel"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="drawer__scroll">
              <section className="drawer-section">
                <div className="drawer-section__title">Backend</div>
                <IntegrationRow
                  icon={<Server size={13} />}
                  name="Agent server"
                  status={backendStatus}
                  statusLabel={BACKEND_LABEL[backendStatus]}
                />
              </section>

              <section className="drawer-section">
                <div className="drawer-section__title">Sponsor integrations</div>
                <IntegrationRow
                  icon={<Cloud size={13} />}
                  name="Apify"
                  status={integrations.apify}
                  statusLabel={APIFY_LABEL[integrations.apify]}
                />
                <IntegrationRow
                  icon={<CreditCard size={13} />}
                  name="Zynd x402"
                  status={integrations.zynd}
                  statusLabel={ZYND_LABEL[integrations.zynd]}
                />
                <IntegrationRow
                  icon={<Zap size={13} />}
                  name="Superplane"
                  status={integrations.superplane}
                  statusLabel={SUPERPLANE_LABEL[integrations.superplane]}
                />
              </section>

              {integrations.zynd === 'payment_required' && zyndPaymentInfo && (
                <section className="drawer-section">
                  <div className="drawer-section__title">Action required</div>
                  <PaymentCard info={zyndPaymentInfo} />
                </section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
