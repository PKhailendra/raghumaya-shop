import { Router } from 'express';
import { z } from 'zod';
import * as c from './referrals.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { paginationSchema, couponCreateSchema } from '@raghumaya/shared';

const r = Router();

/* Public: validate a referral code during registration */
r.get('/validate/:code', validateRequest({ params: z.object({ code: z.string().min(1) }) }), c.validateCode);

r.use(authenticate, requireShopContext);

const view = requirePermission('REFERRAL_VIEW');
const manage = requirePermission('REFERRAL_MANAGE');

r.get('/my-code', view, c.getMyCode);
r.post('/regenerate', manage, c.regenerateCode);
r.get('/track', view, validateRequest({ query: paginationSchema }), c.trackReferral);
r.get('/dashboard', view, c.referralDashboard);
r.get('/', view, validateRequest({ query: paginationSchema.extend({ status: z.enum(['PENDING', 'CONVERTED', 'REWARDED']).optional() }) }), c.listReferrals);
r.post('/coupons', manage, validateRequest({ body: couponCreateSchema }), c.createCoupon);
r.get('/coupons', view, validateRequest({ query: paginationSchema }), c.listCoupons);
r.get('/coupons/validate/:code', view, validateRequest({ params: z.object({ code: z.string().min(1) }) }), c.validateCoupon);

export default r;
