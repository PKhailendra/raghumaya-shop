import { Router } from 'express';
import { z } from 'zod';
import * as c from './shops.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  createShopSchema,
  updateShopSchema,
  switchShopSchema,
  inviteMemberSchema,
  updateMemberSchema,
  paginationSchema,
} from '@raghumaya/shared';

const r = Router();
const shopParam = z.object({ id: z.string().uuid() });
const memberParam = z.object({ id: z.string().uuid(), memberId: z.string().uuid() });

r.use(authenticate);

r.post('/', validateRequest({ body: createShopSchema }), c.createShop);
r.get('/', c.myShops);
r.post('/switch', validateRequest({ body: switchShopSchema }), c.switchShop);

r.get('/:id', validateRequest({ params: shopParam }), c.getShop);
r.patch(
  '/:id',
  requireShopContext,
  requirePermission('SHOP_UPDATE'),
  validateRequest({ params: shopParam, body: updateShopSchema }),
  c.updateShop,
);

r.get('/:id/members', requireShopContext, requirePermission('EMPLOYEE_VIEW'), validateRequest({ params: shopParam, query: paginationSchema }), c.listMembers);
r.post('/:id/members/invite', requireShopContext, requirePermission('EMPLOYEE_CREATE'), validateRequest({ params: shopParam, body: inviteMemberSchema }), c.inviteMember);
r.patch('/:id/members/:memberId', requireShopContext, requirePermission('EMPLOYEE_UPDATE'), validateRequest({ params: memberParam, body: updateMemberSchema }), c.updateMember);
r.delete('/:id/members/:memberId', requireShopContext, requirePermission('EMPLOYEE_DELETE'), validateRequest({ params: memberParam }), c.removeMember);

export default r;
