import { Router } from "express";
import type { RequestHandler } from "express";
import { deletePersona, getPersona, getPersonas, postPersona, putPersona } from "../controllers/persona.controller";
import { register , login, logout, verify, googleCallback, selectRole, completeProfile } from '../controllers/auth.controller';
import passport from '../config/passport';
import { authLimiter } from '../middlewares/rateLimiter';
import authRequired from '../middlewares/validateToken';

const router = Router()

router.post('/debug', (req, res) => {
  res.json({
    headers: req.headers,
    parsedBody: req.body,
    rawBody: (req as any).rawBody
  });
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', logout );

router.get('/verify', verify )
router.post('/select-role', authRequired, selectRole)
router.post('/complete-profile', authRequired, completeProfile)

router.get(
    '/google',
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get(
    '/google/callback',
    passport.authenticate('google', {
        session: false,
        failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_auth_failed`,
    }),
    googleCallback
);

export default router;