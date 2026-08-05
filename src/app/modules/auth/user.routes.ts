import { Router } from "express";
import auth from "../../middleware/auth.middleware";
import validateRequest from "../../middleware/validateRequest";
import { USER_ROLE } from "../user/user.constant";
import { authValidation } from "./auth.validation"; 
import { authControllers } from "./user.controller";
import { authServices, changeLanguage } from "./user.service";



const router = Router();

router.post('/userRegistration',validateRequest(authValidation.requestOtpZodSchema), authControllers.userRegistration,);
router.post("/verify-email", authControllers.verifyEmailController);
router.post('/resend-otp', authControllers.resendOtpController);


router.post('/login',validateRequest(authValidation.loginZodSchema), authControllers.login,);
router.post( '/refresh-token',validateRequest(authValidation.refreshTokenValidationSchema),authControllers.refreshToken,);
router.post('/google', authControllers.googleLogin);
router.post('/facebook', authControllers.facebookLogin);
router.post('/linkedin', authControllers.linkedInLogin);
router.post('/appleLogin', authControllers.appleLogin);

router.post('/codeVerification', authControllers.codeVerification,);
router.post('/userVerifyOtp', authControllers.verifyOtpController,);

router.patch('/change-password',auth(USER_ROLE.USER, USER_ROLE.MARCHANT),authControllers.changePassword,);
router.patch('/reset-password', authControllers.resetPassword);
// For organizer login
router.post('/organizer-login', validateRequest(authValidation.loginZodSchema), authControllers.ornagizerlogin);

//forget password এর জন্য OTP পাঠানোর route
router.post('/send-otp',validateRequest(authValidation.requestOtpZodSchema), authControllers.sendOtp,);
router.post('/verify-otp',validateRequest(authValidation.verifyEmailZodSchemar), authControllers.verifyOtpOnly,);
router.patch('/forget-password', authServices.verifyOtpAndResetPassword,);

// Language change route
router.patch('/change-language', auth(USER_ROLE.USER,), changeLanguage);



export const authRoutes = router;
