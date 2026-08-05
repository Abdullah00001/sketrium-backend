import { Router } from 'express';
import {  socialControllers } from './social.controller';
import { USER_ROLE } from '../user/user.constant';
import auth from '../../middleware/auth.middleware';
import upload from '../../middleware/fileUpload';



const router = Router();
// POST /api/v1/auth/register  ← User + SocialLink একসাথে save
router.post('/register',  upload.single('image'),  socialControllers.register);
router.put('/profile', socialControllers.updateProfile);
router.patch('/update-profile', 
        auth(USER_ROLE.KAATEDJ,USER_ROLE.MARCHANT,USER_ROLE.ORGANIZER),
     upload.fields([{ name: 'profileImage', maxCount: 1 },{ name: 'coverImage', maxCount: 1 },]),socialControllers.updateProfile,);

router.get('/profile',auth(USER_ROLE.KAATEDJ,USER_ROLE.MARCHANT,USER_ROLE.ORGANIZER),socialControllers.getProfile,);
router.post('/verify-email', socialControllers.verifyEmailController);

export const sosaleMediaRoutes = router;
