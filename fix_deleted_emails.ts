import mongoose from 'mongoose';
import User from './src/app/modules/user/user.model';
import config from './src/app/config';

async function run() {
  await mongoose.connect(config.database_url as string);
  try {
    const deletedUsers = await User.find({ isDeleted: true }).setOptions({ skipFilter: true }); // We might need to query the raw collection
    
    // Better to use native driver to bypass all Mongoose hooks
    const db = mongoose.connection.db;
    const users = await db!.collection('users').find({ isDeleted: true, email: { $not: /-deleted-/ } }).toArray();
    
    for (const user of users) {
       const newEmail = `${user.email}-deleted-${Date.now()}`;
       await db!.collection('users').updateOne({ _id: user._id }, { $set: { email: newEmail } });
       console.log(`Updated deleted user ${user.email} -> ${newEmail}`);
    }
    console.log(`Fixed ${users.length} deleted accounts.`);
  } finally {
    await mongoose.disconnect();
  }
}
run().catch(console.dir);
