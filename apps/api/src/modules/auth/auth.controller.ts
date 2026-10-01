import type { Request, Response } from 'express';
import * as service from './auth.service';
import * as twofa from './twofa.service';
import { ctxFromReq } from '../ctx';
import { deviceInfoFromReq } from './auth.service';
import { asyncHandler, HttpError } from '../../middleware/errorHandler';

const device = (req: Request) => deviceInfoFromReq(req);
const client = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined });

export const registerShopOwner = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.registerShopOwner(req.body, device(req), {
    actor: { actorType: 'account', permissions: [] },
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });
  res.status(201).json(result);
});

export const createShopUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.createShopUser(ctxFromReq(req), req.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.login(req.body, device(req), client(req)));
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.logout(ctxFromReq(req), req.body, device(req)));
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.refresh(req.body.refreshToken, device(req), client(req)));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.changePassword(ctxFromReq(req), req.body));
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.forgotPassword(req.body.emailOrPhone));
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.resetPassword(req.body.token, req.body.newPassword));
});

export const otpRequest = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.otpRequest(req.body.emailOrPhone));
});

export const otpVerify = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.otpVerify(req.body.emailOrPhone, req.body.code, device(req), client(req)));
});

export const emailRequestVerification = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.emailRequestVerification(ctxFromReq(req)));
});

export const emailVerify = asyncHandler(async (req: Request, res: Response) => {
  if (!req.body.email) throw new HttpError(400, 'EMAIL_REQUIRED', 'Email is required');
  res.json(await service.emailVerify(req.body.email, req.body.code));
});

export const smsRequestVerification = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.smsRequestVerification(ctxFromReq(req)));
});

export const smsVerify = asyncHandler(async (req: Request, res: Response) => {
  if (!req.body.phone) throw new HttpError(400, 'PHONE_REQUIRED', 'Phone is required');
  res.json(await service.smsVerify(req.body.phone, req.body.code));
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.createAdmin(ctxFromReq(req), req.body));
});

export const listAdmins = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, search } = req.query as unknown as { page: number; limit: number; search?: string };
  res.json(await service.listAdmins(page, limit, search));
});

export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.updateAdmin(ctxFromReq(req), req.params.id, req.body));
});

export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.deleteAdmin(ctxFromReq(req), req.params.id));
});

export const listDevices = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.listDevices(ctxFromReq(req)) });
});

export const devicesFingerprint = asyncHandler(async (req: Request, res: Response) => {
  res.json(service.fingerprintFromReq(req));
});

export const revokeDevice = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.revokeDevice(ctxFromReq(req), req.params.id));
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await service.listSessions(ctxFromReq(req)) });
});

export const requestProfileChange = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await service.requestProfileChange(ctxFromReq(req), req.body));
});

/* ------------------------------ 2FA ------------------------------ */

export const twoFaStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json(await twofa.getStatus(ctxFromReq(req)));
});

export const twoFaUpdateMethods = asyncHandler(async (req: Request, res: Response) => {
  res.json(await twofa.updateMethods(ctxFromReq(req), req.body));
});

export const twoFaAuthenticatorSetup = asyncHandler(async (req: Request, res: Response) => {
  res.json(await twofa.setupAuthenticator(ctxFromReq(req), req));
});

export const twoFaAuthenticatorVerify = asyncHandler(async (req: Request, res: Response) => {
  res.json(await twofa.verifyAuthenticator(ctxFromReq(req), req.body.token));
});

export const twoFaBackupCodesRegenerate = asyncHandler(async (req: Request, res: Response) => {
  res.json(await twofa.regenerateBackupCodes(ctxFromReq(req)));
});

export const twoFaChallengeSend = asyncHandler(async (req: Request, res: Response) => {
  res.json(await twofa.challengeSend(req.body.challengeToken, req.body.method));
});

export const twoFaChallengeVerify = asyncHandler(async (req: Request, res: Response) => {
  res.json(await twofa.challengeVerify(req, req.body));
});
