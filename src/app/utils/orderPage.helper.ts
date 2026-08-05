export const generateSuccessHTML = (order: any, message?: any) => {
  const itemsHTML = order.items
    .map(
      (item: any) => `
      <div class="item">
        <img src="${item.product?.images?.[0]?.url || ''}" alt="${item.product?.name}" />
        <div class="item-info">
          <p class="item-name">${item.product?.name}</p>
          <p class="item-meta">Qty: ${item.quantity} &nbsp;|&nbsp; Color: ${item.color || '-'} &nbsp;|&nbsp; Size: ${item.size || '-'}</p>
          <p class="item-price">$${item.price} x ${item.quantity} = <strong>$${(item.price * item.quantity).toFixed(2)}</strong></p>
        </div>
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order Successful</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #1a1200; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px 32px; max-width: 480px; width: 100%; text-align: center; border: 1px solid rgba(255,255,255,0.1); }
    .icon { width: 72px; height: 72px; background: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .icon svg { width: 36px; height: 36px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: rgba(255,255,255,0.5); font-size: 14px; margin-bottom: 28px; }
    .items { text-align: left; margin-bottom: 24px; display: flex; flex-direction: column; gap: 12px; }
    .item { display: flex; gap: 12px; background: rgba(255,255,255,0.07); border-radius: 12px; padding: 12px; }
    .item img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; background: rgba(255,255,255,0.1); }
    .item-info { flex: 1; }
    .item-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .item-meta { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 4px; }
    .item-price { font-size: 13px; color: #D4920A; }
    .summary { background: rgba(255,255,255,0.07); border-radius: 12px; padding: 16px; text-align: left; margin-bottom: 24px; }
    .summary-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: rgba(255,255,255,0.6); }
    .row.total { border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 10px; color: #fff; font-weight: 700; font-size: 15px; }
    .badge { display: inline-block; background: rgba(34,197,94,0.15); color: #22c55e; border-radius: 20px; padding: 3px 12px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
    .btn { display: block; width: 100%; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; border: none; margin-top: 10px; font-family: inherit; }
    .btn-primary { background: #D4920A; color: #fff; }
    .btn-secondary { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <h1>Order Successful!</h1>
    <p class="subtitle">Your order has been placed. A confirmation has been sent.</p>
    <span class="badge">✓ Payment Confirmed</span>

    <div class="items">${itemsHTML}</div>

    <div class="summary">
      <p class="summary-title">Payment Information</p>
      <div class="row"><span>Payment Method</span><span>Stripe</span></div>
      <div class="row"><span>Payment Status</span><span style="color:#22c55e">Paid</span></div>
      <div class="row"><span>Subtotal</span><span>$${order.subtotal.toFixed(2)}</span></div>
      <div class="row"><span>Shipping Fee</span><span>$${order.shippingCost.toFixed(2)}</span></div>
      <div class="row total"><span>Total</span><span>$${order.total.toFixed(2)}</span></div>
    </div>

    <button class="btn btn-primary" onclick="window.close()">Back to Home</button>
    <button class="btn btn-secondary" onclick="window.close()">Track My Order</button>
  </div>
</body>
</html>`;
};

export const generateCancelHTML = (message: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payment Cancelled</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #1a1200; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 40px 32px; max-width: 400px; width: 100%; text-align: center; border: 1px solid rgba(255,255,255,0.1); }
    .icon { width: 72px; height: 72px; background: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .icon svg { width: 36px; height: 36px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
    .subtitle { color: rgba(255,255,255,0.5); font-size: 14px; margin-bottom: 28px; line-height: 1.6; }
    .btn { display: block; width: 100%; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; border: none; margin-top: 10px; font-family: inherit; }
    .btn-primary { background: #D4920A; color: #fff; }
    .btn-secondary { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </div>
    <h1>Payment Cancelled</h1>
    <p class="subtitle">${message}<br/>আপনার cart এ items এখনো আছে।</p>
    <button class="btn btn-primary" onclick="window.close()">Back to Cart</button>
    <button class="btn btn-secondary" onclick="window.close()">Back to Home</button>
  </div>
</body>
</html>`;
};
