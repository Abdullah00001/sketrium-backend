# Skatrium Flutter Marketplace Payment Integration Guide

Backend Base URL:
`https://api.skatrium.com`

API Prefix:
`/api/v1`

Environment:
`Stripe Sandbox / Test Mode`

Backend Source Commit:
`826740787fc394d25523346ac7c0f677c85bae6d`

---

## Quick Start Summary

Skatrium is a fully operational platform with existing users, active subscriptions, user roles, product listings, event hosting, and shopping cart management.

This guide defines the API contract for the **Stripe Marketplace Payment System**, which introduces:
1. **Role-Specific Seller Stripe Connect**: Onboarding for Merchants (`MARCHANT`) and Event Organizers (`ORGANIZER`).
2. **Customer Stripe PaymentSheet**: Native checkout integration for buyers using `flutter_stripe`.
3. **Backend Reservation & Payment Engine**: Atomic stock holds and event capacity management with automatic expiration handling.
4. **Asynchronous Seller Transfers**: Automated payout splitting to connected seller accounts after payment success.

### Normal Product Payment Flow
`Existing Cart` $\rightarrow$ `POST /api/v1/marketplace/payments/checkout/cart` $\rightarrow$ Receive `paymentId` $\rightarrow$ `POST /api/v1/marketplace/payments/:paymentId/create-intent` $\rightarrow$ Receive `clientSecret` $\rightarrow$ Present `PaymentSheet` $\rightarrow$ Poll `GET /api/v1/marketplace/payments/:paymentId/status` $\rightarrow$ Order Confirmed (`SUCCEEDED`) $\rightarrow$ Backend clears purchased cart items & transfers merchant payouts asynchronously.

### Normal Event Payment Flow
`Event Detail` $\rightarrow$ `POST /api/v1/marketplace/payments/checkout/event` $\rightarrow$ Receive `paymentId` $\rightarrow$ `POST /api/v1/marketplace/payments/:paymentId/create-intent` $\rightarrow$ Receive `clientSecret` $\rightarrow$ Present `PaymentSheet` $\rightarrow$ Poll `GET /api/v1/marketplace/payments/:paymentId/status` $\rightarrow$ Ticket Confirmed (`SUCCEEDED`) $\rightarrow$ Backend transfers organizer payout asynchronously.

---

## 1. Seller & Organizer Stripe Connect APIs

Skatrium uses role-specific Stripe Connect accounts. **Merchant** Connect accounts and **Organizer** Connect accounts are completely independent:
* Merchant Connect Account ID: `MerchantProfile.stripeConnectedAccountId`
* Organizer Connect Account ID: `OrganizerProfile.stripeConnectedAccountId`

> [!IMPORTANT]
> The backend database and authorization checks explicitly expect the merchant wire role string **`MARCHANT`** (spelled with an **'A'**). Flutter MUST pass **`MARCHANT`** for merchant role parameters.

---

### Endpoint: Initiate Merchant Onboarding
### Authentication
Required (`Authorization: Bearer <accessToken>`). User must hold `MARCHANT` permissions.

### Request
`POST /api/v1/connect/merchant/onboard`

### Request Example
```http
POST /api/v1/connect/merchant/onboard HTTP/1.1
Host: api.skatrium.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsIn...
Content-Type: application/json

{}
```

### Response
Returns a custom single-use Stripe Express onboarding account link.

### Response Example
```json
{
  "success": true,
  "message": "Merchant onboarding account link generated successfully.",
  "data": {
    "url": "https://connect.stripe.com/setup/s/acct_1P1234567890/...",
    "accountCreationStatus": "CREATED",
    "onboardingStatus": "ONBOARDING_REQUIRED",
    "stripeConnectedAccountId": "acct_1P1234567890"
  }
}
```

### Status Codes
* `200 OK`: Onboarding link generated successfully.
* `401 Unauthorized`: Missing or invalid JWT.
* `403 Forbidden`: User does not hold merchant subscription/role access.
* `409 Conflict`: Multiple Stripe accounts match profile metadata (manual reconciliation required).

### Flutter Integration Notes
Open `data.url` in external browser using `url_launcher`. Stripe will redirect to `skatrium://connect-return` when finished.

---

### Endpoint: Get Merchant Connect Status
### Authentication
Required (`Authorization: Bearer <accessToken>`).

### Request
`GET /api/v1/connect/merchant/status`

### Request Example
```http
GET /api/v1/connect/merchant/status HTTP/1.1
Host: api.skatrium.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsIn...
```

### Response
Returns current authoritative Stripe Connect status telemetry for the merchant.

### Response Example
```json
{
  "success": true,
  "message": "Merchant Stripe Connect status retrieved successfully.",
  "data": {
    "role": "MARCHANT",
    "stripeConnectedAccountId": "acct_1P1234567890",
    "accountCreationStatus": "CREATED",
    "onboardingStatus": "READY",
    "detailsSubmitted": true,
    "payoutsEnabled": true,
    "transfersCapability": "active",
    "currentlyDue": [],
    "pastDue": [],
    "eventuallyDue": [],
    "disabledReason": null,
    "stripeLastSyncedAt": "2026-09-21T13:30:00.000Z"
  }
}
```

### Status Codes
* `200 OK`: Status retrieved successfully.
* `401 Unauthorized`: Token missing or invalid.

### Flutter Integration Notes
Evaluated `onboardingStatus` enum values:
* `NOT_CREATED` / `NOT_STARTED`: Account not created. Show "Set Up Payouts" button.
* `ONBOARDING_REQUIRED`: Incomplete info. Show "Resume Setup" button.
* `UNDER_REVIEW`: Details submitted. Stripe reviewing documents. Show "Under Review" status badge.
* `READY`: Fully verified (`detailsSubmitted: true`, `payoutsEnabled: true`). Enable selling features!
* `RESTRICTED`: Requirements past due. Prompt user to update info.
* `DISABLED`: Account rejected/disabled by Stripe. Show support contact message.
* `STATUS_EVALUATION_ERROR`: Transient evaluation error. Show retry button.

---

### Endpoint: Initiate Organizer Onboarding
### Authentication
Required (`Authorization: Bearer <accessToken>`).

### Request
`POST /api/v1/connect/organizer/onboard`

### Request Example
```http
POST /api/v1/connect/organizer/onboard HTTP/1.1
Host: api.skatrium.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsIn...
Content-Type: application/json

{}
```

### Response Example
```json
{
  "success": true,
  "message": "Organizer onboarding account link generated successfully.",
  "data": {
    "url": "https://connect.stripe.com/setup/s/acct_1Q9876543210/...",
    "accountCreationStatus": "CREATED",
    "onboardingStatus": "ONBOARDING_REQUIRED",
    "stripeConnectedAccountId": "acct_1Q9876543210"
  }
}
```

### Status Codes
* `200 OK`: Onboarding link generated successfully.

---

### Endpoint: Get Organizer Connect Status
### Authentication
Required (`Authorization: Bearer <accessToken>`).

### Request
`GET /api/v1/connect/organizer/status`

### Request Example
```http
GET /api/v1/connect/organizer/status HTTP/1.1
Host: api.skatrium.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsIn...
```

### Response Example
```json
{
  "success": true,
  "message": "Organizer Stripe Connect status retrieved successfully.",
  "data": {
    "role": "ORGANIZER",
    "stripeConnectedAccountId": "acct_1Q9876543210",
    "accountCreationStatus": "CREATED",
    "onboardingStatus": "READY",
    "detailsSubmitted": true,
    "payoutsEnabled": true,
    "transfersCapability": "active"
  }
}
```

> [!CAUTION]
> Returning from Stripe onboarding via custom scheme `skatrium://connect-return` does **NOT** mean the account is `READY`.
> Flutter **MUST** re-query `GET /api/v1/connect/merchant/status` (or `organizer/status`) after returning from the browser.

---

## 2. Existing Cart APIs

Marketplace product checkout uses the existing server-side `Cart`.

> [!WARNING]
> Marketplace product checkout does **NOT** accept a product list, quantities, prices, or merchant IDs from Flutter.
> The backend loads the user's existing Cart automatically and derives the checkout from it.

---

### Endpoint: Add Item to Cart
### Request
`POST /api/v1/card/addto-card`

### Request Example
```json
{
  "productId": "66e8f1a2b3c4d5e6f7a8b9c1",
  "currency": "USD",
  "quantity": 2,
  "color": "Black",
  "size": "L"
}
```

### Response Example (`200 OK`)
```json
{
  "success": true,
  "message": "Product added to cart",
  "data": {
    "_id": "66e8f1a2b3c4d5e6f7a8b9c2",
    "items": [
      {
        "_id": "66e8f1a2b3c4d5e6f7a8b9c3",
        "product": {
          "_id": "66e8f1a2b3c4d5e6f7a8b9c1",
          "name": "Skatrium Pro Deck",
          "price": 59.99,
          "discountPrice": 49.99,
          "shippingCost": 5.00,
          "currency": "USD",
          "host": "66e8f1a2b3c4d5e6f7a8b9c9"
        },
        "quantity": 2
      }
    ],
    "subtotal": 99.98,
    "shippingFee": 10.00,
    "total": 109.98,
    "totalQuantity": 2
  }
}
```

---

### Endpoint: Get User Cart
### Request
`GET /api/v1/card/get-cart`

---

### Endpoint: Update Cart Item Quantity
### Request
`PUT /api/v1/card/update-cart`

### Request Example
```json
{
  "productId": "66e8f1a2b3c4d5e6f7a8b9c1",
  "quantity": 3,
  "color": "Black",
  "size": "L"
}
```

---

### Endpoint: Remove Item from Cart
### Request
`DELETE /api/v1/card/remove-from-cart/:productId`

---

## 3. Product Cart Checkout

### Endpoint
`POST /api/v1/marketplace/payments/checkout/cart`

### Authentication
Required (`Authorization: Bearer <accessToken>`).

### Request Payload
```json
{
  "clientCheckoutIdempotencyKey": "chk_prod_987654321",
  "shippingAddress": {
    "street": "123 Skate Ave",
    "city": "Austin",
    "state": "TX",
    "zip": "78701",
    "country": "US"
  }
}
```

### Processing Logic
1. Loads user's existing `Cart` from database. Throws `400 Bad Request` if empty.
2. Validates product availability and stock.
3. Groups items by seller (`product.host`) and asserts every merchant has a `READY` Stripe Connect account.
4. Calculates authoritative total price in cents (subtotal + shipping).
5. Creates pending `Payment` record (`paymentType: "PRODUCT_CART"`, `status: "PENDING"`).
6. Atomically reserves stock on each product and creates `ReservationRecord` items with a 30-minute expiration TTL.

### Response Example (`201 Created`)
```json
{
  "success": true,
  "message": "Product cart checkout created successfully",
  "data": {
    "payment": {
      "_id": "66e8f1a2b3c4d5e6f7a8b9d0",
      "userId": "66e8f1a2b3c4d5e6f7a8b9c0",
      "paymentType": "PRODUCT_CART",
      "currency": "USD",
      "amount": 10998,
      "status": "PENDING",
      "clientCheckoutIdempotencyKey": "chk_prod_987654321",
      "createdAt": "2026-09-21T13:30:00.000Z"
    },
    "reservations": [
      {
        "_id": "66e8f1a2b3c4d5e6f7a8b9d1",
        "paymentId": "66e8f1a2b3c4d5e6f7a8b9d0",
        "reservationType": "PRODUCT",
        "targetId": "66e8f1a2b3c4d5e6f7a8b9c1",
        "quantity": 2,
        "status": "RESERVED",
        "expiresAt": "2026-09-21T14:00:00.000Z"
      }
    ]
  }
}
```

---

## 4. Multi-Merchant Checkout Behavior

A single user cart can contain products belonging to multiple merchants.

### Flutter Handling Rules
1. Flutter sends **ONE** request to `POST /api/v1/marketplace/payments/checkout/cart`.
2. Flutter does **NOT** split cart items into separate checkouts.
3. Flutter does **NOT** calculate seller transfer allocations or merchant payout totals.
4. The backend groups products by `product.host`, verifies each merchant's Stripe Connect readiness, creates seller allocations, and returns **ONE combined payment**.
5. Customer pays **ONE PaymentIntent** via PaymentSheet.
6. The backend automatically handles individual seller transfers asynchronously after payment confirmation.

---

## 5. Event Ticket Checkout

### Endpoint
`POST /api/v1/marketplace/payments/checkout/event`

### Authentication
Required (`Authorization: Bearer <accessToken>`).

### Request Payload
```json
{
  "eventId": "66e8f1a2b3c4d5e6f7a8b9e0",
  "participantCount": 2,
  "clientCheckoutIdempotencyKey": "chk_evt_123456"
}
```

### Processing Logic
1. Validates participant count (`1 <= participantCount <= 10`).
2. Validates event existence and date (`isPast === false`).
3. Evaluates available event capacity:
   $$\text{Available Capacity} = \text{maxAttendees} - (\text{confirmedParticipantCount} + \text{pendingReservationCount})$$
   Throws `409 Conflict` if capacity is exceeded.
4. Asserts organizer's `OrganizerProfile.onboardingStatus === 'READY'`.
5. Creates pending `Payment` record and atomic 30-minute ticket reservation.

### Response Example (`201 Created`)
```json
{
  "success": true,
  "message": "Event ticket checkout created successfully",
  "data": {
    "payment": {
      "_id": "66e8f1a2b3c4d5e6f7a8b9e1",
      "userId": "66e8f1a2b3c4d5e6f7a8b9c0",
      "paymentType": "EVENT_TICKET",
      "currency": "USD",
      "amount": 10000,
      "status": "PENDING",
      "clientCheckoutIdempotencyKey": "chk_evt_123456",
      "createdAt": "2026-09-21T13:30:00.000Z"
    },
    "reservations": [
      {
        "_id": "66e8f1a2b3c4d5e6f7a8b9e2",
        "paymentId": "66e8f1a2b3c4d5e6f7a8b9e1",
        "reservationType": "EVENT",
        "targetId": "66e8f1a2b3c4d5e6f7a8b9e0",
        "quantity": 2,
        "status": "RESERVED",
        "expiresAt": "2026-09-21T14:00:00.000Z"
      }
    ]
  }
}
```

---

## 6. PaymentIntent Creation & Client Secret Retrieval

### Endpoint: Create PaymentIntent
`POST /api/v1/marketplace/payments/:paymentId/create-intent`

### Request Example
```http
POST /api/v1/marketplace/payments/66e8f1a2b3c4d5e6f7a8b9d0/create-intent HTTP/1.1
Host: api.skatrium.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsIn...
Content-Type: application/json

{}
```

### Response Example (`200 OK`)
```json
{
  "success": true,
  "message": "Stripe PaymentIntent created successfully",
  "data": {
    "paymentId": "66e8f1a2b3c4d5e6f7a8b9d0",
    "paymentIntentId": "pi_3P1234567890",
    "clientSecret": "pi_3P1234567890_secret_abc123xyz",
    "status": "PENDING"
  }
}
```

---

### Endpoint: Get Client Secret (Existing Intent)
`GET /api/v1/marketplace/payments/:paymentId/client-secret`

### Response Example (`200 OK`)
```json
{
  "success": true,
  "message": "Client secret retrieved successfully",
  "data": {
    "clientSecret": "pi_3P1234567890_secret_abc123xyz"
  }
}
```

> [!NOTE]
> Client secrets are valid for the active payment attempt. Do not log client secrets in device analytics.

---

## 7. Stripe PaymentSheet Integration Requirements

Flutter presents the native PaymentSheet via `flutter_stripe`:

1. Initiate checkout (`POST /checkout/cart` or `/checkout/event`) $\rightarrow$ receive `paymentId`.
2. Call `POST /api/v1/marketplace/payments/:paymentId/create-intent` $\rightarrow$ receive `clientSecret`.
3. Initialize PaymentSheet: `Stripe.instance.initPaymentSheet(paymentIntentClientSecret: clientSecret)`.
4. Present PaymentSheet: `Stripe.instance.presentPaymentSheet()`.
5. On PaymentSheet close: Start polling `GET /api/v1/marketplace/payments/:paymentId/status`.

> [!IMPORTANT]
> PaymentSheet completion on device is **NOT** final payment confirmation.
> Authoritative payment success happens asynchronously when Stripe webhooks notify the backend. Flutter must poll payment status to confirm completion.

---

## 8. Authoritative Payment Status Evaluation

### Endpoint
`GET /api/v1/marketplace/payments/:paymentId/status`

### Response Example (`200 OK`)
```json
{
  "success": true,
  "message": "Payment status retrieved successfully",
  "data": {
    "paymentId": "66e8f1a2b3c4d5e6f7a8b9d0",
    "status": "SUCCEEDED",
    "amount": 10998,
    "currency": "USD",
    "paymentType": "PRODUCT_CART",
    "reconciliationReason": null,
    "createdAt": "2026-09-21T13:30:00.000Z",
    "succeededAt": "2026-09-21T13:31:00.000Z"
  }
}
```

### Supported Payment Status Enum Values

| Status | Meaning | Flutter Action | Polling Active? | Retry Allowed? | New Checkout? |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `PENDING` | Payment initialized; reservation active. | Display checkout view / PaymentSheet button. | No | Yes | No |
| `PROCESSING` | Payment submitted; Stripe webhook processing. | Show *"Processing payment..."* spinner modal. | **YES (every 2s)** | No | No |
| `SUCCEEDED` | Stripe webhook confirmed charge. | Show Order Success screen. Clear local cart view. | **STOP** | No | No |
| `FAILED` | Payment failed or card declined. | Display error message. | **STOP** | Yes | No |
| `CANCELED` | Payment explicitly canceled. | Dismiss payment modal. Return to Cart/Event screen. | **STOP** | No | Yes |
| `EXPIRED` | 30-minute stock/capacity reservation TTL expired. | Show *"Reservation Expired (30 mins elapsed)"*. | **STOP** | No | Yes |
| `RECONCILIATION_REQUIRED` | Inconsistency detected / pending review. | Show *"Pending Review"*. Show Support contact button. | **STOP** | **NO** | No |

---

## 9. Payment Failure, Cancellation & Retry Rules

The implementation strictly distinguishes 6 payment scenarios:

1. **User Cancels PaymentSheet UI**: User closes native PaymentSheet modal. `paymentId` and `clientSecret` remain active. Flutter retains checkout summary screen and allows user to tap "Pay Now" again without creating a new checkout.
2. **Card Declined (`requires_payment_method`)**: Card attempt declined. Payment remains `PENDING` and reservation remains active. Flutter displays card error and re-presents PaymentSheet using **same `clientSecret`**.
3. **Backend `FAILED`**: Backend explicitly marks payment failed. Flutter stops polling. User may retry payment sheet while reservation is active.
4. **Backend `CANCELED`**: Terminal failure. Polling stops. Flutter returns user to Cart/Event screen.
5. **Backend `EXPIRED`**: 30-minute reservation TTL elapsed. Stock/capacity released. Flutter prompts user to start a new checkout.
6. **Backend `RECONCILIATION_REQUIRED`**: Metadata/amount mismatch. Polling stops. **No auto-retry**. Flutter displays Support contact screen.

---

## 10. Idempotency Rules

* Flutter generates a unique `clientCheckoutIdempotencyKey` (UUID v4) when the user initiates a **new** checkout attempt.
* Flutter MUST **NOT** generate a new idempotency key when:
  - User closes/cancels PaymentSheet UI.
  - Card is declined (`requires_payment_method`).
  - Re-retrieving `clientSecret`.
  - Polling payment status.
* Reusing an idempotency key with identical parameters returns the existing `Payment` document. Reusing a key with altered parameters returns `409 Conflict`.

---

## 11. Reservations & Stock Lifecycle

* **Reservation TTL**: **30 minutes** (`30 * 60 * 1000` ms) for both Product stock and Event capacity.
* **Payment Success**: Webhook transitions `Payment` to `SUCCEEDED`, converts reservations to confirmed orders/tickets, and performs atomic `$pull` on `Cart` for `purchasedCartItemIds`.
* **Reservation Expiration**: Expiration sweeper evaluates `expiresAt < now`. Unpaid pending payments transition to `EXPIRED` and stock/capacity is restored automatically.

---

## 12. Seller & Organizer Payout Transfers

* Customer payment success (`SUCCEEDED`) is complete as soon as Stripe confirms the customer charge.
* Background seller transfers (`TransferOperation` via BullMQ) run asynchronously after customer payment confirmation.
* Multi-merchant carts create separate seller transfers for each merchant allocation.
* Flutter does **NOT** call transfer APIs, wait for seller transfer completion, or calculate payout shares.

---

## 13. Error Handling Reference

| HTTP Status | Backend Message / Error Condition | Meaning | Flutter Action |
| :--- | :--- | :--- | :--- |
| `400` | `Cart is empty` | Checkout attempted with 0 items in cart. | Prompt user to add items to cart. |
| `400` | `... has insufficient stock` | Stock sold out or requested qty exceeds stock. | Refresh cart view and show stock error. |
| `400` | `Participant count must be between 1 and 10` | Invalid participant count for event. | Restrict quantity selector to 1..10. |
| `401` | `You are not authorized` / `Invalid token` | Missing, invalid, or expired JWT token. | Refresh access token or prompt re-login. |
| `409` | `Merchant profile for seller ... is not Stripe-ready` | Cart product seller is not Stripe-ready. | Show error: *"Seller payouts not configured."* |
| `409` | `Event capacity exceeded or event unavailable` | Event full or tickets unavailable. | Show error: *"Event tickets sold out."* |
| `409` | `Conflict: Idempotency key reused with different checkout parameters` | Modified payload sent with reused key. | Generate new idempotency key for new checkout. |
| `500` | `Internal server error` | Server exception. | Show error snackbar and allow retry. |

---

## 14. End-to-End Flow Diagrams

### Flow 1: Merchant Connect Setup
```
User switches to Merchant role
   ↓
GET /api/v1/connect/merchant/status
   ↓
Is status READY?
   ├── YES → Enable Seller Dashboard.
   └── NO  → Call POST /api/v1/connect/merchant/onboard -> Launch URL in Browser -> User completes form -> Deep link skatrium://connect-return -> App re-queries GET /api/v1/connect/merchant/status
```

### Flow 2: Product Cart Checkout & Async Transfers
```
Existing Cart
   ↓
POST /api/v1/marketplace/payments/checkout/cart (Returns paymentId)
   ↓
POST /api/v1/marketplace/payments/:paymentId/create-intent (Returns clientSecret)
   ↓
Stripe PaymentSheet -> Customer Pays
   ↓
Platform Webhook payment_intent.succeeded -> Payment status = SUCCEEDED
   ↓
Backend $pulls purchased items from Cart & enqueues Async Seller Transfers
   ↓
Flutter polls status -> Receives SUCCEEDED -> Shows Order Confirmation
```

---

## 15. DO NOT DO THESE THINGS (Strict Prohibitions)

* **Do NOT send product lists or quantities** in `POST /api/v1/marketplace/payments/checkout/cart`.
* **Do NOT send merchant IDs or seller allocations** to marketplace checkout.
* **Do NOT calculate seller payouts or transfer amounts** on mobile device.
* **Do NOT call Stripe Transfer APIs** from Flutter.
* **Do NOT call platform webhook endpoints** (`/api/v1/payments/stripe/webhook`).
* **Do NOT treat PaymentSheet completion as final payment confirmation** without checking backend status.
* **Do NOT mark payments paid locally**.
* **Do NOT create a new checkout** when PaymentSheet is canceled or card is declined (reuse `paymentId`/`clientSecret`).
* **Do NOT generate a new idempotency key** when retrying the same checkout attempt.
* **Do NOT assume returning from Connect onboarding deep link means `READY`** without re-querying backend status.

---

## 16. API Endpoint Reference Table

| Method | Endpoint | Purpose | Auth Required | Required Role | When Flutter Calls It |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `POST` | `/api/v1/connect/merchant/onboard` | Generate Merchant Connect onboarding link | Yes | `"MARCHANT"` | User taps "Set Up Payouts" as Merchant |
| `GET` | `/api/v1/connect/merchant/status` | Get Merchant Connect status | Yes | `"MARCHANT"` | Entering Merchant tab or after deep link return |
| `POST` | `/api/v1/connect/organizer/onboard` | Generate Organizer Connect onboarding link | Yes | `"ORGANIZER"` | User taps "Set Up Payouts" as Organizer |
| `GET` | `/api/v1/connect/organizer/status` | Get Organizer Connect status | Yes | `"ORGANIZER"` | Entering Organizer tab or after deep link return |
| `POST` | `/api/v1/card/addto-card` | Add item to cart | Yes | `"USER"` | User taps "Add to Cart" on product detail |
| `GET` | `/api/v1/card/get-cart` | Retrieve user cart | Yes | `"USER"` | Opening Cart screen |
| `PUT` | `/api/v1/card/update-cart` | Update item quantity in cart | Yes | `"USER"` | Adjusting quantity stepper in Cart screen |
| `DELETE`| `/api/v1/card/remove-from-cart/:productId` | Remove item from cart | Yes | `"USER"` | Swiping/tapping delete item in Cart screen |
| `POST` | `/api/v1/marketplace/payments/checkout/cart` | Initiate product cart checkout | Yes | `"USER"` | Tapping "Proceed to Checkout" in Cart screen |
| `POST` | `/api/v1/marketplace/payments/checkout/event` | Initiate event ticket checkout | Yes | `"USER"` | Tapping "Buy Tickets" on Event detail screen |
| `POST` | `/api/v1/marketplace/payments/:paymentId/create-intent` | Create Stripe PaymentIntent | Yes | `"USER"` | After receiving `paymentId` from checkout |
| `GET` | `/api/v1/marketplace/payments/:paymentId/client-secret` | Get clientSecret for payment | Yes | `"USER"` | Retrying failed card or resuming payment |
| `GET` | `/api/v1/marketplace/payments/:paymentId/status` | Get authoritative payment status | Yes | `"USER"` | After PaymentSheet closes to verify success |
| `GET` | `/api/v1/connect/return` | Stripe OAuth return handler | No | Public | Server-side handler redirecting to `skatrium://connect-return` |
| `GET` | `/api/v1/connect/refresh` | Stripe OAuth refresh handler | No | Public | Server-side handler generating fresh onboarding link |
| `POST` | `/api/v1/auth/refresh-token` | Refresh access token | No | Public | Automatically invoked on HTTP `401` |
