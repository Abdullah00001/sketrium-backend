import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });


export default {
     ip_address: process.env.IP_ADDRESS,
     frontend_url: process.env.FONTEND_URL,
     backend_url: process.env.BACKEND_URL,
     reset_pass_expire_time: process.env.RESET_TOKEN_EXPIRE_TIME,
     database_url: process.env.DATABASE_URL,
     node_env: process.env.NODE_ENV,
     port: process.env.PORT,
     google_maps_api_key: process.env.GOOGLE_MAPS_API,
     
     firebase_project_id: process.env.FIREBASE_PROJECT_ID,
     firebase_client_email: process.env.FIREBASE_CLIENT_EMAIL,
     firebase_private_key: process.env.FIREBASE_PRIVATE_KEY,
     bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
     socket_port: process.env.SOCKET_PORT,
     allowed_origins: process.env.ALLOWED_ORIGINS,
      google: {
          service_account_path: process.env.GOOGLE_SERVICE_ACCOUNT_PATH,
     },
     // apple: {
     //      shared_secret: process.env.APPLE_SHARED_SECRET,
     // },
     jwt: {
          jwt_access_secret: process.env.JWT_SECRET,
          jwt_access_expires_in: process.env.JWT_EXPIRE_IN,
          jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
          jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRE_IN,
     },
      
     apple:{
          client_id: process.env.APPLE_CLIENT_ID,
          team_id: process.env.APPLE_TEAM_ID,
          key_id: process.env.APPLE_KEY_ID,
          shared_secret: process.env.APPLE_SHARED_SECRET,
     },

     email: {
          email_header: process.env.EMAIL_HEADER_NAME,
          from: process.env.EMAIL_FROM,
          user: process.env.EMAIL_USER,
          port: process.env.EMAIL_PORT,
          nodemailer_host_email: process.env.EMAIL_USER,
          nodemailer_host_pass: process.env.EMAIL_PASS,
     },
     express_sessoin: process.env.EXPRESS_SESSION_SECRET_KEY,
     social: {
          google_client_id: process.env.GOOGLE_CLIENT_ID,
          facebook_client_id: process.env.FACEBOOK_CLIENT_ID,
          google_client_secret: process.env.GOOGLE_CLIENT_SECRET,
          facebook_client_secret: process.env.FACEBOOK_CLIENT_SECRET,
          callback_url: process.env.GOOGLE_CALLBACK_URL,
     },
     twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
          authToken: process.env.TWILIO_AUTH_TOKEN || '',
          phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
     },
     stripe: {
          stripe_secret_key: process.env.STRIPE_SECRET_KYE,
          paymentSuccess_url: process.env.STRIPE_PAYMENT_SUCCESS_URL,
          stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
          stripe_webhook_url: process.env.STRIPE_WEBHOOK_URL,
          stripe_product_id: process.env.STRIPE_PRODUCT_ID,
     },
     super_admin: {
          email: process.env.SUPER_ADMIN_EMAIL,
          password: process.env.SUPER_ADMIN_PASSWORD,
     },
          aws: {
          region: process.env.AWS_REGION,
          bucket: process.env.AWS_BUCKET,
          access_key: process.env.AWS_ACCESS_KEY,
          secret_key: process.env.AWS_SECRET_KEY,
     }
};

