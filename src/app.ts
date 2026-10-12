// import cookieParser from 'cookie-parser';
// import cors from 'cors';
// import express, { Application, Request, Response } from 'express';
// import helmet from 'helmet';
// import globalErrorHandler from './app/middleware/globalErrorhandler';
// import notFound from './app/middleware/notfound';
// import router from './app/routes';
// import config from './app/config';
// // import globalErrorHandler from './app/middleware/globalErrorhandler';
// // import notFound from './app/middleware/notfound';
// // import router from './app/routes';

// const app: Application = express();
// app.use(express.static('public'));
// app.use(express.urlencoded({ extended: true }));
// app.use(helmet());
// //parsers
// app.use(express.json());
// app.use(cookieParser());
// // app.use(
// //   cors({
// //     origin: true,
// //     credentials: true,
// //     methods: ['GET', 'POST', 'DELETE', 'PATCH'],
// //   }),
// // );

// // app.use(cors({
// //   origin: [config.frontend_url as string, config.backend_url as string], // React dev URLs
// //   credentials: true,
// // }));





// app.use(
//   cors({
//     origin: "*",
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
//     credentials: false, // ✅ origin "*" হলে credentials false রাখুন
//   })
// );











// // application routes
// app.use('/api/v1', router);
// app.get('/', (req: Request, res: Response) => {
//   res.send('server is running');
// });
// app.use(globalErrorHandler);

// //Not Found
// app.use(notFound);

// export default app;



import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import globalErrorHandler from './app/middleware/globalErrorhandler';
import notFound from './app/middleware/notfound';
import router from './app/routes';
import config from './app/config';
import { Event } from './app/modules/event/event.model';
import morgan from 'morgan';
import { requestContextMiddleware } from './app/configs/requestContext.configs';
import { morganMessageFormat, streamConfig } from './app/configs/morgan.configs';

const app: Application = express();


app.use(express.static('public'));
app.use(helmet());


app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
    credentials: false, 
  })
);


app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
})); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize request context and logging
app.use(requestContextMiddleware);
app.use(morgan(morganMessageFormat, { stream: streamConfig }));

app.use('/api/v1', router);

// Aliases for RevenueCat integrations
import { PaymentController } from './app/modules/subPayment/subpayment.controller';
import auth from './app/middleware/auth.middleware';
import { USER_ROLE } from './app/modules/user/user.constant';

app.post('/webhooks/revenuecat', PaymentController.revenueCatWebhook);
app.post(
  '/subscriptions/sync',
  auth(
    USER_ROLE.admin,
    USER_ROLE.MARCHANT,
    USER_ROLE.KAATEDJ,
    USER_ROLE.ORGANIZER,
    USER_ROLE.USER,
  ),
  PaymentController.syncSubscription,
);

import { onboardingTokenStore } from './app/modules/stripeConnect/stripeConnect.tokenStore';
import { stripeConnectService } from './app/modules/stripeConnect/stripeConnect.service';

const renderStripeConnectCallback = async (req: Request, res: Response) => {
  const role = (req.query.role as string) || '';
  const token = req.query.token as string;
  let status = (req.query.status as string) || '';

  if (token) {
    try {
      const payload = onboardingTokenStore.consumeToken(token);
      if (payload) {
        const statusResult = await stripeConnectService.getSellerStatus(
          payload.userId,
          payload.role,
        );
        status = statusResult.onboardingStatus;
      }
    } catch (e) {
      // Ignore token consumption errors for UI rendering
    }
  }

  if (!status) {
    status = 'READY';
  }

  // Preserve all relevant query parameters
  const queryParams = new URLSearchParams();
  if (role) queryParams.set('role', role);
  if (status) queryParams.set('status', status);
  if (req.query.refresh) queryParams.set('refresh', String(req.query.refresh));
  const queryString = queryParams.toString();

  const isReady = status === 'READY';
  const schemeUrl = `skatrium://connect-return${queryString ? '?' + queryString : ''}`;
  const intentUrl = `intent://connect-return${queryString ? '?' + queryString : ''}#Intent;scheme=skatrium;package=com.skatriumltd.skatriumapp;end`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Return to Skatrium</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0F0F11;
      color: #FFFFFF;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .card {
      background: #1A1A1E;
      border: 1px solid #2E2E36;
      border-radius: 24px;
      padding: 36px 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .brand {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #C7923E;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .icon-wrapper {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: ${isReady ? 'rgba(34, 197, 94, 0.15)' : 'rgba(199, 146, 62, 0.15)'};
      color: ${isReady ? '#22C55E' : '#C7923E'};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 34px;
      font-weight: bold;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #FFFFFF;
    }
    p {
      font-size: 14px;
      color: #A0A0AB;
      line-height: 1.5;
      margin-bottom: 28px;
    }
    .btn {
      display: block;
      background: #C7923E;
      color: #FFFFFF;
      font-weight: 700;
      font-size: 16px;
      padding: 16px 24px;
      border-radius: 14px;
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .btn:active {
      opacity: 0.85;
    }
    .hint {
      margin-top: 18px;
      font-size: 12px;
      color: #6C6C78;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Skatrium</div>
    <div class="icon-wrapper">
      ${isReady ? '&#10003;' : '&#8505;'}
    </div>
    <h1>${isReady ? 'Payout Setup Complete' : 'Session Completed'}</h1>
    <p>Returning you to the Skatrium app...</p>
    <a id="returnBtn" href="${intentUrl}" class="btn">
      Return to Skatrium
    </a>
    <div class="hint">
      If the app does not open automatically, tap the button above.
    </div>
  </div>

  <script>
    const isAndroid = /Android/i.test(navigator.userAgent);
    const intentUrl = "${intentUrl}";
    const schemeUrl = "${schemeUrl}";
    const targetUrl = isAndroid ? intentUrl : schemeUrl;

    const btn = document.getElementById("returnBtn");
    if (btn) {
      btn.setAttribute("href", targetUrl);
    }

    // Immediate redirect
    try {
      window.location.href = targetUrl;
    } catch(e) {}

    // Fallback on Android if intent scheme is not intercepted immediately
    if (isAndroid) {
      setTimeout(function() {
        try {
          window.location.href = schemeUrl;
        } catch(e) {}
      }, 1500);
    }

    setTimeout(function() {
      try { window.close(); } catch(e) {}
    }, 2500);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
};

app.get('/connect/return', renderStripeConnectCallback);
app.get('/connect/refresh', renderStripeConnectCallback);
app.get('/stripe-connect-callback', renderStripeConnectCallback);
app.get('/api/v1/stripe-connect-callback', renderStripeConnectCallback);

app.get('/', (req: Request, res: Response) => {
  res.send('Server is running perfectly!');
});


app.use(globalErrorHandler);

app.use(notFound);

export default app;