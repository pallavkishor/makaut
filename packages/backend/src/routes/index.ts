import { Router } from 'express';
import authRoutes from './authRoutes';
import studentRoutes from './studentRoutes';
import subjectRoutes from './subjectRoutes';
import noteRoutes from './noteRoutes';
import catalogRoutes from './catalogRoutes';
import resourceRoutes from './resourceRoutes';
import engagementRoutes from './engagementRoutes';
import adminRoutes from './adminRoutes';

/**
 * API router
 * Mounts student-facing routes under /api and the admin API under /api/admin
 *
 * Mount table (all paths relative to /api):
 *   /auth/*                     authRoutes
 *   /students/*                 studentRoutes
 *   /subjects/*                 subjectRoutes
 *   /notes/*                    noteRoutes
 *   /catalog/*                  catalogRoutes
 *   /resources/*                resourceRoutes
 *   /bookmarks, /reading-progress/*   engagementRoutes (declares its own paths)
 *   /admin/*                    adminRoutes
 *
 * Mount order: engagementRoutes is mounted at `/` because it carries its own
 * `/bookmarks` and `/reading-progress` prefixes. It goes LAST so it cannot
 * shadow any of the prefixed routers above it.
 */
const router = Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/subjects', subjectRoutes);
router.use('/notes', noteRoutes);
router.use('/catalog', catalogRoutes);
router.use('/resources', resourceRoutes);
router.use('/admin', adminRoutes);

// Root-mounted last: its own paths are /bookmarks and /reading-progress/...
router.use('/', engagementRoutes);

export default router;

export { default as authRoutes } from './authRoutes';
export { default as studentRoutes } from './studentRoutes';
export { default as subjectRoutes } from './subjectRoutes';
export { default as noteRoutes } from './noteRoutes';
export { default as adminRoutes } from './adminRoutes';
export { default as adminAuthRoutes } from './adminAuthRoutes';
export { default as adminStudentRoutes } from './adminStudentRoutes';
export { default as adminSubjectRoutes } from './adminSubjectRoutes';
export { default as adminNoteRoutes } from './adminNoteRoutes';
export { default as adminSubscriptionRoutes } from './adminSubscriptionRoutes';
export { default as catalogRoutes } from './catalogRoutes';
export { default as resourceRoutes } from './resourceRoutes';
export { default as engagementRoutes } from './engagementRoutes';
export { default as adminHierarchyRoutes } from './adminHierarchyRoutes';
export { default as adminChapterRoutes } from './adminChapterRoutes';
export { default as adminResourceRoutes } from './adminResourceRoutes';
export { default as adminPlanRoutes } from './adminPlanRoutes';
