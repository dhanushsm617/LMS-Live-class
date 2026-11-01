import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { errMsg, useMockConfirmMutation, usePaymentStatusQuery } from '../services/api.js';
import { ErrorBox, Spinner } from '../components/ui.jsx';
import { formatMoney } from '../utils/format.js';

/**
 * Stand-in for Stripe Checkout when no Stripe key is configured (PAYMENT_MODE=mock).
 * It walks the same server path as a real payment: pending Payment → fulfil → enrollment.
 */
export function MockCheckout() {
  const { paymentId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [confirm, { isLoading }] = useMockConfirmMutation();
  const [error, setError] = useState(null);

  const pay = async (e) => {
    e.preventDefault();
    try {
      await confirm(paymentId).unwrap();
      navigate(`/checkout/success?payment=${paymentId}`, { replace: true });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <form className="card pad auth stack" onSubmit={pay}>
      <div className="alert alert-warn small">Test mode – no real money moves. Add a Stripe test key on the server to use real Stripe Checkout.</div>
      <h1 className="h-sm">Checkout</h1>
      {state?.courseTitle && <p><strong>{state.courseTitle}</strong></p>}
      {state?.amount !== undefined && <div className="price big">{formatMoney(state.amount, state.currency)}</div>}
      <label>Card number<input defaultValue="4242 4242 4242 4242" inputMode="numeric" aria-label="Card number" /></label>
      <div className="grid-2">
        <label>Expiry<input defaultValue="12 / 34" /></label>
        <label>CVC<input defaultValue="123" /></label>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <button className="btn btn-primary block" disabled={isLoading}>{isLoading ? 'Processing…' : 'Pay now'}</button>
    </form>
  );
}

/** Polls until the webhook (or server-side Stripe verification) marks the payment as paid. */
export function CheckoutSuccess() {
  const [search] = useSearchParams();
  const paymentId = search.get('payment');
  const { data, error } = usePaymentStatusQuery(paymentId, { skip: !paymentId, pollingInterval: 2000 });

  if (!paymentId) return <ErrorBox>Missing payment reference.</ErrorBox>;
  if (error) return <ErrorBox error={error} />;
  if (!data || data.status === 'pending') return <Spinner label="Confirming your payment…" />;
  if (data.status !== 'paid') return <ErrorBox>Payment {data.status}. You have not been charged – please try again.</ErrorBox>;

  return (
    <div className="card pad auth stack center">
      <div className="cert-seal" aria-hidden="true">✓</div>
      <h1 className="h-sm">Payment successful</h1>
      <p className="muted">You’re enrolled in <strong>{data.course?.title}</strong>.</p>
      <Link className="btn btn-primary" to={`/learn/${data.course?._id}`}>Start learning</Link>
    </div>
  );
}
