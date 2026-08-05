import cron from 'node-cron';
import User from '../modules/user/user.model';

export const setupCronJobs = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('Running subscription expiry cron job...');
      const now = new Date();

      const result = await User.updateMany(
        {
          isPremium: true,
          'subscription.expiresAt': { $lt: now },
        },
        {
          $set: {
            isPremium: false,
            'subscription.status': 'expired',
          },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`Successfully expired ${result.modifiedCount} subscriptions.`);
      }
    } catch (error) {
      console.error('Error running subscription expiry cron job:', error);
    }
  });
};
