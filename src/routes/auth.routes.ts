import { Router } from "express";
import type { RequestHandler } from "express";
import { deletePersona, getPersona, getPersonas, postPersona, putPersona } from "../controllers/persona.controller";
import { register , login, logout, verify, googleCallback, selectRole, completeProfile, completeRegistration } from '../controllers/auth.controller';
import passport from '../config/passport';
import { authLimiter } from '../middlewares/rateLimiter';
import authRequired from '../middlewares/validateToken';

const router = Router()

const developmentOnly: RequestHandler = (_req, res, next) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).end();
  }

  return next();
};

router.post('/debug', developmentOnly, (req, res) => {
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
router.post('/complete-registration', authRequired, completeRegistration)

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