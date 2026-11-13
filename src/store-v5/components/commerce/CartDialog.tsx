import React, { useState, useEffect } from 'react';
import type { CartLine, SiteIR } from '../../compiler/types';
import { money } from '../../compiler/compile';
import { subtotal, total } from '../../capabilities/cart';
import { cartMessage, waUrl } from '../../whatsapp/messages';
import { isDummyPhone } from '../../compiler/public-compiler';
import { DialogShell } from '../base/DialogShell';
import { QuantityControl } from '../base/QuantityControl';

export type CartDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  cart: CartLine[];
  onUpdateQuantity: (key: string, quantity: number) => void;
  onRemoveItem: (key: string) => void;
  onClearCart: () => void;
  site: SiteIR;
  initialStep?: 'cart' | 'review';
  initialMessage?: string;
  onSimulateCheckout?: (message: string, cart: CartLine[]) => void;
};

export const CartDialog: React.FC<CartDialogProps> = ({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  site,
  initialStep = 'cart',
  initialMessage = '',
  onSimulateCheckout
}) => {
  const [step, setStep] = useState<'cart' | 'review'>(initialStep);
  const [editedMessage, setEditedMessage] = useState('');
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      const msg = initialStep === 'review' && initialMessage.trim()
        ? initialMessage
        : cartMessage(site, cart);
      setEditedMessage(msg);
      setPhoneWarning(null);
    }
  }, [isOpen, initialStep, initialMessage, cart, site]);

  const cartSubtotal = subtotal(cart);
  const cartTotal = total(cart, site.rules);
  const dummy = isDummyPhone(site.whatsapp?.phoneE164);

  const handleGoToReview = () => {
    if (dummy) {
      setPhoneWarning('Número de WhatsApp de demonstração. Conecte um número oficial no painel antes de publicar.');
    }
    const msg = cartMessage(site, cart);
    setEditedMessage(msg);
    setStep('review');
  };

  const handleOpenWhatsApp = () => {
    if (site.whatsapp?.demoMode) return;
    try {
      const url = waUrl(site.whatsapp.phoneE164, editedMessage);
      window.open(url, '_blank', 'noopener,noreferrer');
      onClose();
    } catch (e) {
      alert(String(e));
    }
  };

  const modalTitle = step === 'cart' ? 'Sua sacola' : 'Revisar mensagem';

  return (
    <DialogShell
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      maxWidthPx={640}
      maxHeightDvh={90}
      className="cart-dialog cart-section"
    >
      {step === 'cart' ? (
        <div className="cart-dialog__step-cart">
          {cart.length === 0 ? (
            <div className="cart-dialog__empty">
              <p>Sua sacola está vazia.</p>
              <button
                type="button"
                className="cart-dialog__continue-btn"
                onClick={onClose}
              >
                ← Continuar comprando
              </button>
            </div>
          ) : (
            <>
              <div className="cart-dialog__lines">
                {cart.map(item => (
                  <div key={item.key} className="cart-dialog__line">
                    <div className="cart-dialog__item-info">
                      <strong className="cart-dialog__item-name">
                        {item.name}
                        {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                      </strong>
                      <span className="cart-dialog__item-unit">
                        {money(item.priceCents)} cada
                      </span>
                    </div>

                    <QuantityControl
                      value={item.quantity}
                      max={Math.min(item.stock, site.rules?.maxPerItem || item.stock)}
                      step={site.rules?.quantityStep || 1}
                      onChange={q => onUpdateQuantity(item.key, q)}
                    />

                    <div className="cart-dialog__item-total">
                      <strong>{money(item.priceCents * item.quantity)}</strong>
                    </div>

                    <button
                      type="button"
                      className="cart-dialog__remove-btn"
                      aria-label={`Remover ${item.name}`}
                      onClick={() => onRemoveItem(item.key)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="cart-dialog__summary cart-summary">
                <div className="cart-dialog__summary-row">
                  <span>Subtotal</span>
                  <strong>{money(cartSubtotal)}</strong>
                </div>
                <div className="cart-dialog__summary-row cart-dialog__summary-row--total">
                  <span>Total estimado</span>
                  <strong>{money(cartTotal)}</strong>
                </div>

                <div className="cart-dialog__actions">
                  <button
                    type="button"
                    className="cart-dialog__checkout-btn"
                    onClick={handleGoToReview}
                  >
                    {site.rules?.checkoutMode === 'whatsapp_quote'
                      ? 'Solicitar orçamento pelo WhatsApp'
                      : 'Finalizar pelo WhatsApp'}
                  </button>
                  <button
                    type="button"
                    className="cart-dialog__continue-btn"
                    onClick={onClose}
                  >
                    ← Continuar comprando
                  </button>
                  <button
                    type="button"
                    className="cart-dialog__clear-btn"
                    onClick={onClearCart}
                  >
                    Esvaziar sacola
                  </button>
                </div>
                <p className="cart-dialog__disclaimer">
                  Os valores e o estoque precisam de confirmação pela loja.
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="cart-dialog__step-review">
          <div className="cart-dialog__review-lead">
            <p>Destino configurado: {site.whatsapp.phoneE164}</p>
            <p>
              Confira a mensagem pronta que será enviada para o WhatsApp da loja para
              confirmar seu pedido:
            </p>
          </div>

          <label className="cart-dialog__message-label">
            <span>Mensagem de WhatsApp</span>
            <textarea
              className="cart-dialog__message-textarea"
              rows={8}
              value={editedMessage}
              onChange={e => setEditedMessage(e.target.value)}
              aria-label="Mensagem de WhatsApp"
            />
          </label>

          <div className="cart-dialog__review-total">
            <span>Total a pagar:</span>
            <strong>{money(cartTotal)}</strong>
          </div>

          {phoneWarning && (
            <div className="cart-dialog__warning" role="alert">
              ⚠️ {phoneWarning}
            </div>
          )}

          <div className="cart-dialog__review-actions">
            <button
              type="button"
              className="cart-dialog__back-btn"
              onClick={() => setStep('cart')}
            >
              ← Voltar à sacola
            </button>
            {onSimulateCheckout && (
              <button
                type="button"
                className="cart-dialog__simulate-btn"
                style={{
                  background: '#0867e8',
                  color: '#fff',
                  border: 0,
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontWeight: 700,
                }}
                disabled={!editedMessage.trim()}
                onClick={() => {
                  onSimulateCheckout(editedMessage, cart);
                  onClose();
                }}
              >
                Testar Fluxo A no WhatsApp
              </button>
            )}
            <button
              type="button"
              className="cart-dialog__send-whatsapp-btn"
              disabled={site.whatsapp?.demoMode || !editedMessage.trim()}
              onClick={handleOpenWhatsApp}
            >
              {site.whatsapp?.demoMode ? 'Modo demo: sem envio' : 'Abrir WhatsApp'}
            </button>
          </div>
        </div>
      )}
    </DialogShell>
  );
};
