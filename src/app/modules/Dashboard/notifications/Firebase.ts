// import * as admin from "firebase-admin";
// import config from "../../../config";

// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert({
//       projectId: config.firebase_project_id,
//       clientEmail: config.firebase_client_email,
//       privateKey: (config.firebase_private_key as string)?.replace(/\\n/g, "\n"),
//     }),
//   });
// }

// export default admin;

import * as admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

export default admin;
