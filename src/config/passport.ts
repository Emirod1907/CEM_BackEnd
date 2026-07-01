import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import Persona from '../models/persona';
import Rol from '../models/rol';
import { sendRegistrationConfirmationEmail } from '../services/email.service';
import { logger } from '../libs/logger';

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            callbackURL: `${process.env.BACKEND_URL || 'http://localhost:8000'}/api/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('No se pudo obtener el email de Google'), undefined);
                }

                // Buscar por google_id primero
                let persona = await Persona.findOne({ where: { google_id: profile.id } });

                if (!persona) {
                    // Buscar si ya existe una cuenta con ese email (registro manual)
                    persona = await Persona.findOne({ where: { email } });

                    if (persona) {
                        // Vincular la cuenta de Google al usuario existente
                        await persona.update({ google_id: profile.id });
                    } else {
                        // Crear nueva persona desde Google — sin rol asignado, el usuario lo elegirá
                        const nombre_usuario = `google_${profile.id.substring(0, 10)}`;
                        const nombreNuevo = profile.name?.givenName || profile.displayName.split(' ')[0];

                        persona = await Persona.create({
                            google_id: profile.id,
                            nombre: nombreNuevo,
                            apellido: profile.name?.familyName || profile.displayName.split(' ').slice(1).join(' ') || '-',
                            email,
                            nombre_usuario,
                            rol_id: undefined,
                        } as any);

                        // Enviar email de confirmación de registro (sin bloquear el flujo)
                        sendRegistrationConfirmationEmail(email, nombreNuevo).catch((err) =>
                            logger.error('[Passport] Error al enviar email de confirmación', { error: String(err) })
                        );
                    }
                }

                return done(null, persona);
            } catch (error) {
                return done(error as Error, undefined);
            }
        }
    )
);

export default passport;
