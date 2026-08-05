/* eslint-disable @typescript-eslint/ban-ts-comment */
import dns from 'dns';
// Force Google DNS servers before any connection attempt
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

import mongoose from 'mongoose';
import app from './app';
import config from './app/config';
import { startupLogger } from './app/utils/startupLogger';
import { setupCronJobs } from './app/utils/cronJobs';

const port = Number(config.port) || 1212;

const startServer = async () => {
  try {
    setupCronJobs();

    await mongoose.connect(config.database_url as string);
    console.log('Database connected');

    app.listen(port, '0.0.0.0', () => {
      startupLogger(Number(port));
    });
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: any) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: any) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
