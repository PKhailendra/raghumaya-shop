import { Router } from 'express';
import { z } from 'zod';
import * as c from './notifications.controller';
import { authenticate, requireShopContextOrAdmin, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { notificationQuerySchema } from '@raghumaya/shared';

const r = Router();
const uuidParam = z.object({ id: z.string().uuid() });

r.use(authenticate, requireShopContextOrAdmin);

const view = requirePermission('NOTIFICATION_VIEW');
const update = requirePermission('NOTIFICATION_UPDATE');

r.get('/', view, validateRequest({ query: notificationQuerySchema }), c.listNotifications);
r.post('/:id/read', update, validateRequest({ params: uuidParam }), c.markRead);
r.patch('/:id/read', update, validateRequest({ params: uuidParam }), c.markRead);
r.post('/read-all', update, c.markAllRead);
r.post('/:id/retry', update, validateRequest({ params: uuidParam }), c.retryNotification);

export default r;
