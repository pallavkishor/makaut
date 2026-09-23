import { Router } from 'express';
import adminAuthRoutes from './adminAuthRoutes';
import adminStudentRoutes from './adminStudentRoutes';
import adminSubjectRoutes from './adminSubjectRoutes';
import adminNoteRoutes from './adminNoteRoutes';
import adminSubscriptionRoutes from './adminSubscriptionRoutes';
import adminChapterRoutes from './adminChapterRoutes';
import adminResourceRoutes from './adminResourceRoutes';
import adminPlanRoutes from './adminPlanRoutes';
import adminHierarchyRoutes from './adminHierarchyRoutes';

/**
 * Tasks 9.1 - 9.5: Admin API router, mounted at /api/admin
 *
 * Every sub-router applies `adminGuards` (admin JWT + live, non-idle session),
 * so the only reachable endpoint without an admin token is the login route.
 * Student tokens are rejected with 403 - the admin surface is separate from the
 * student platform.
 *
 * Mount table (all paths relative to /api/admin):
 *   /auth/*             adminAuthRoutes
 *   /students/*         adminStudentRoutes
 *   /subjects/*         adminSubjectRoutes
 *   /notes/*            adminNoteRoutes
 *   /subscriptions/*    adminSubscriptionRoutes
 *   /chapters/*         adminChapterRoutes
 *   /resources/*        adminResourceRoutes
 *   /plans/*            adminPlanRoutes
 *   /universities/*, /programs/*, /streams/*, /semesters/*, /hierarchy/tree
 *                       adminHierarchyRoutes (declares its own prefixes)
 *
 * MOUNT ORDER MATTERS: adminHierarchyRoutes is mounted at `/` because it
 * carries its own resource prefixes. A router mounted at `/` matches every
 * request path, so it MUST come last - ahead of the specific prefixes it would
 * intercept their requests and answer 404 before they were ever consulted.
 *
 * Requirements: 5.1 - 5.6, 6.1 - 6.10, 7.1 - 7.8, 8.1 - 8.11
 */
const router = Router();

// Specific prefixes first
router.use('/auth', adminAuthRoutes);
router.use('/students', adminStudentRoutes);
router.use('/subjects', adminSubjectRoutes);
router.use('/notes', adminNoteRoutes);
router.use('/subscriptions', adminSubscriptionRoutes);
router.use('/chapters', adminChapterRoutes);
router.use('/resources', adminResourceRoutes);
router.use('/plans', adminPlanRoutes);

// Root-mounted last: declares /universities, /programs, /streams, /semesters,
// /hierarchy/tree itself. Must not precede the prefixed routers above.
router.use('/', adminHierarchyRoutes);

export default router;
