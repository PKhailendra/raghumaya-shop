import { Router } from 'express';
import { z } from 'zod';
import * as c from './auth.controller';
import * as v from './auth.validation';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { authRateLimit } from '../../middleware/common';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });
const searchQuery = v.paginationSchema.extend({ search: z.string().trim().max(100).optional() });

/* Public */
r.post('/register-shop-owner', authRateLimit, validateRequest({ body: v.registerShopOwnerSchema }), c.registerShopOwner);
r.post('/login', authRateLimit, validateRequest({ body: v.loginSchema }), c.login);
r.post('/refresh', authRateLimit, validateRequest({ body: v.refreshSchema }), c.refresh);
r.post('/forgot-password', authRateLimit, validateRequest({ body: v.forgotPasswordSchema }), c.forgotPassword);
r.post('/reset-password', authRateLimit, validateRequest({ body: v.resetPasswordSchema }), c.resetPassword);
r.post('/otp/request', authRateLimit, validateRequest({ body: v.otpRequestSchema }), c.otpRequest);
r.post('/otp/verify', authRateLimit, validateRequest({ body: v.otpVerifySchema }), c.otpVerify);
r.post('/email/verify', authRateLimit, validateRequest({ body: v.verifyCodeSchema }), c.emailVerify);
r.post('/sms/verify', authRateLimit, validateRequest({ body: v.verifyCodeSchema }), c.smsVerify);
r.post('/2fa/challenge/send', authRateLimit, validateRequest({ body: v.twoFaChallengeSendSchema }), c.twoFaChallengeSend);
r.post('/2fa/challenge/verify', authRateLimit, validateRequest({ body: v.twoFaChallengeVerifySchema }), c.twoFaChallengeVerify);

/* Authenticated */
r.post('/shop-users', authenticate, validateRequest({ body: v.createShopUserSchema }), c.createShopUser);
r.post('/logout', authenticate, validateRequest({ body: v.logoutSchema }), c.logout);
r.post('/change-password', authenticate, validateRequest({ body: v.changePasswordSchema }), c.changePassword);
r.post('/email/request-verification', authenticate, c.emailRequestVerification);
r.post('/sms/request-verification', authenticate, c.smsRequestVerification);
r.post('/profile/change-request', authenticate, validateRequest({ body: v.profileChangeRequestSchema }), c.requestProfileChange);

r.get('/devices', authenticate, c.listDevices);
r.get('/devices/fingerprint', authenticate, c.devicesFingerprint);
r.delete('/devices/:id', authenticate, validateRequest({ params: uuidParam }), c.revokeDevice);
r.get('/sessions', authenticate, c.listSessions);

r.get('/2fa/status', authenticate, c.twoFaStatus);
r.patch('/2fa/methods', authenticate, validateRequest({ body: v.twoFaMethodsSchema }), c.twoFaUpdateMethods);
r.post('/2fa/authenticator/setup', authenticate, c.twoFaAuthenticatorSetup);
r.post('/2fa/authenticator/verify', authenticate, validateRequest({ body: v.twoFaAuthenticatorVerifySchema }), c.twoFaAuthenticatorVerify);
r.post('/2fa/backup-codes/regenerate', authenticate, c.twoFaBackupCodesRegenerate);

/* Super admin: platform admin management */
r.post('/admins', authenticate, requireSuperAdmin, validateRequest({ body: v.createAdminSchema }), c.createAdmin);
r.get('/admins', authenticate, requireSuperAdmin, validateRequest({ query: searchQuery }), c.listAdmins);
r.patch('/admins/:id', authenticate, requireSuperAdmin, validateRequest({ params: uuidParam, body: v.updateAdminSchema }), c.updateAdmin);
r.delete('/admins/:id', authenticate, requireSuperAdmin, validateRequest({ params: uuidParam }), c.deleteAdmin);

export default r;
