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

app.get('/', (req: Request, res: Response) => {

  res.send('Server is running perfectly!');
});


app.use(globalErrorHandler);

app.use(notFound);

export default app;