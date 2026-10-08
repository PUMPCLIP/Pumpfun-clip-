'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import bs58 from 'bs58';
import { QRCodeSVG } from 'qrcode.react';
import styles from './sol-tip-modal.module.css';

type Props = { onClose: () => void };

const RECEIVER = process.env.NEXT_PUBLIC_SOLANA_WALLET_ADDRESS?.trim() ?? '';
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function isSolanaAddress(value: string): boolean {
  if (!BASE58_ADDRESS.test(value) || value === SYSTEM_PROGRAM) return false;
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

export default function SolTipModal({ onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const recipientValid = useMemo(() => isSolanaAddress(RECEIVER), []);
  const amountValid = amount === '' || (
    amount.length <= 24 && /^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(amount) &&
    Number.isFinite(Number(amount)) && Number(amount) > 0
  );

  const paymentUri = useMemo(() => {
    if (!recipientValid || !amountValid) return '';
    const params = [
      ...(amount ? [`amount=${encodeURIComponent(amount)}`] : []),
      `label=${encodeURIComponent('PumpClip')}`,
      `message=${encodeURIComponent('Support the PumpClip creator network')}`,
    ];
    return `solana:${RECEIVER}?${params.join('&')}`;
  }, [amount, amountValid, recipientValid]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const copyAddress = async () => {
    if (!recipientValid) return;
    try {
      await navigator.clipboard.writeText(RECEIVER);
      setCopyStatus('Address copied. Verify it in your wallet before sending.');
    } catch {
      setCopyStatus('Clipboard access is unavailable. Select the address above to copy it.');
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="sol-tip-title">
        <button ref={closeButton} className={styles.close} type="button" onClick={onClose} aria-label="Close SOL tip dialog">×</button>
        <header className={styles.header}>
          <p className={styles.kicker}>SOLANA PAY / DIRECT TRANSFER</p>
          <h2 id="sol-tip-title">Send SOL</h2>
          <p className={styles.intro}>
            Send a self-custodial tip to PumpClip’s configured receiving wallet. PumpClip does not hold, escrow, split, or reverse this transfer; it is not routed to individual campaign creators.
          </p>
        </header>

        {!RECEIVER ? (
          <div className={styles.configNotice} role="status">
            <strong>Tips are not configured yet.</strong>
            <span>Set <code>NEXT_PUBLIC_SOLANA_WALLET_ADDRESS</code> in Render and rebuild. No payment link is generated until a recipient is configured.</span>
          </div>
        ) : !recipientValid ? (
          <div className={styles.configNotice} role="alert">
            <strong>The configured recipient is not a valid Solana address.</strong>
            <span>Check <code>NEXT_PUBLIC_SOLANA_WALLET_ADDRESS</code> in Render. Payments are disabled until it contains a valid base58 public key.</span>
          </div>
        ) : (
          <>
            <div className={styles.tipLayout}>
              <div className={styles.qrColumn}>
                <div className={styles.qrFrame} aria-label={paymentUri ? 'Solana Pay QR code' : 'QR code unavailable'}>
                  {paymentUri ? <QRCodeSVG value={paymentUri} size={220} level="M" includeMargin title="Scan to send SOL" /> : <span className={styles.qrPlaceholder}>Correct the amount above to generate a payment QR code.</span>}
                </div>
                <p className={styles.qrHint}>Scan with Phantom, Solflare, or another Solana Pay-compatible wallet.</p>
                {paymentUri && <a className={styles.walletLink} href={paymentUri}>Open in Solana wallet ↗</a>}
              </div>

              <div className={styles.details}>
                <label className={styles.label} htmlFor="sol-tip-amount">Tip amount <span>(optional, SOL)</span></label>
                <input
                  id="sol-tip-amount"
                  className={styles.amountInput}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  placeholder="Leave blank for wallet prompt"
                  aria-invalid={!amountValid}
                  aria-describedby="sol-tip-amount-help sol-tip-amount-error"
                />
                <small id="sol-tip-amount-help" className={styles.help}>Use a positive decimal with up to 9 decimal places, or leave blank and enter the amount in your wallet.</small>
                {!amountValid && <p id="sol-tip-amount-error" className={styles.error} role="alert">Enter a positive SOL amount with up to 9 decimal places, or leave the amount blank.</p>}

                <label className={styles.label} htmlFor="sol-tip-recipient">Receiving wallet</label>
                <textarea
                  id="sol-tip-recipient"
                  className={styles.address}
                  value={RECEIVER}
                  readOnly
                  rows={2}
                  onFocus={event => event.currentTarget.select()}
                  aria-label="Configured Solana receiving wallet address"
                />
                <button className={styles.copyButton} type="button" onClick={copyAddress}>Copy address</button>
                <p className={styles.copyStatus} aria-live="polite">{copyStatus}</p>

                <div className={styles.warning}>
                  Confirm the recipient, amount, network, and fees in your wallet before approving. On-chain transfers are irreversible. This page does not detect or confirm payments.
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
