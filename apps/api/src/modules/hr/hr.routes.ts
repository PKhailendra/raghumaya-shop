import { Router } from 'express';
import { z } from 'zod';
import * as c from './hr.controller';
import { authenticate, requireShopContext, requirePermission } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import {
  attendanceMarkSchema,
  attendanceQuerySchema,
  salaryStructureSchema,
  salaryAdvanceSchema,
  salaryPaySchema,
  salaryQuerySchema,
  uuidSchema,
} from '@raghumaya/shared';

const r = Router();
r.use(authenticate, requireShopContext);

const attView = requirePermission('ATTENDANCE_VIEW');
const attMark = requirePermission('ATTENDANCE_MARK');
const salView = requirePermission('SALARY_VIEW');
const salManage = requirePermission('SALARY_MANAGE');

r.get('/attendance', attView, validateRequest({ query: attendanceQuerySchema }), c.getAttendance);
r.post('/attendance', attMark, validateRequest({ body: attendanceMarkSchema }), c.postAttendance);

r.get('/salary-structure', salView, c.getStructures);
r.put(
  '/salary-structure/:membershipId',
  salManage,
  validateRequest({ params: z.object({ membershipId: uuidSchema }), body: salaryStructureSchema }),
  c.putStructure,
);

r.get('/advances', salView, validateRequest({ query: salaryQuerySchema }), c.getAdvances);
r.post('/advances', salManage, validateRequest({ body: salaryAdvanceSchema }), c.postAdvance);

r.get('/salary', salView, validateRequest({ query: salaryQuerySchema }), c.getSalary);
r.get('/salary/payments', salView, validateRequest({ query: salaryQuerySchema }), c.getPayments);
r.post('/salary/pay', salManage, validateRequest({ body: salaryPaySchema }), c.postPay);

r.get('/login-sessions', attView, validateRequest({ query: salaryQuerySchema }), c.getLoginSessions);

export default r;
