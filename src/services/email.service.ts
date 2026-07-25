import { google } from 'googleapis';
import MailComposer from 'nodemailer/lib/mail-composer';
import { logger } from '../libs/logger';

// Envío de correos por la API REST de Gmail (HTTPS, puerto 443). Se usa en vez de
// SMTP porque Railway bloquea los puertos SMTP salientes (25/465/587) y la conexión
// a smtp.gmail.com termina en ETIMEDOUT. La Gmail API va por 443, que nunca se bloquea.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER; // Gmail que autorizó y desde el que se envía

// Remitente mostrado en los correos. Debe coincidir con la cuenta autenticada
// (EMAIL_USER); el nombre visible indica que es una casilla que no se responde.
const REMITENTE = () => process.env.EMAIL_FROM || `"Dream Events (no responder)" <${EMAIL_USER}>`;

// Valores de ejemplo del .env.example que NO sirven para autenticarse.
const PLACEHOLDERS_EMAIL = ['TU_EMAIL', 'TU_PASSWORD', 'TU_APP', 'CHANGEME', 'YOUR_EMAIL', 'XXXX'];

// True solo si están las credenciales de la Gmail API (client id/secret + refresh token + remitente).
export const emailConfigurado = (): boolean => {
    const vals = [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, EMAIL_USER].map(v => (v || '').trim());
    if (vals.some(v => !v)) return false;
    const esPlaceholder = (v: string) => PLACEHOLDERS_EMAIL.some(p => v.toUpperCase().includes(p));
    return !vals.some(esPlaceholder);
};

// Cliente de Gmail (OAuth2 con refresh token). Se crea una sola vez.
let oauthClient: InstanceType<typeof google.auth.OAuth2> | null = null;
let gmailClient: ReturnType<typeof google.gmail> | null = null;
const getGmail = () => {
    if (!gmailClient) {
        oauthClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
        oauthClient.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
        gmailClient = google.gmail({ version: 'v1', auth: oauthClient });
    }
    return gmailClient;
};

interface CorreoParams {
    to: string;
    subject: string;
    html: string;
    attachments?: any[];
}

// Compone el MIME con MailComposer (soporta HTML y adjuntos inline/cid). build()
// es por callback, así que lo envolvemos en una promesa.
const construirMime = (opts: any): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        new MailComposer(opts).compile().build((err: Error | null, message: Buffer) => {
            if (err) reject(err); else resolve(message);
        });
    });

// Envía un correo por la API de Gmail (mensaje raw en base64url).
const enviarCorreo = async ({ to, subject, html, attachments }: CorreoParams): Promise<void> => {
    const mime = await construirMime({ from: REMITENTE(), to, subject, html, attachments });
    const raw = mime.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await getGmail().users.messages.send({ userId: 'me', requestBody: { raw } });
};

// Verificación al arranque: avisa si la Gmail API no está configurada o el token no sirve,
// en vez de fallar en silencio recién cuando se dispara el primer correo.
export const verificarEmail = async (): Promise<void> => {
    if (!emailConfigurado()) {
        logger.warn('[Email] Gmail API NO configurada: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / EMAIL_USER. '
            + 'Los correos (invitaciones, entradas, cupones) NO se enviarán.');
        return;
    }
    try {
        getGmail(); // crea el cliente OAuth2
        // getAccessToken() refresca el access token con el refresh token: valida
        // client id/secret + refresh token SIN requerir scope de lectura. No se usa
        // getProfile() porque el token es send-only (gmail.send) y daría 403 de scope.
        await oauthClient!.getAccessToken();
        logger.info(`[Email] Gmail API OK — envíos habilitados desde ${EMAIL_USER}`);
    } catch (err: any) {
        logger.error('[Email] Gmail API rechazó las credenciales — los correos no se enviarán. '
            + 'Revisá que GMAIL_REFRESH_TOKEN sea válido y que GOOGLE_CLIENT_ID/SECRET coincidan con los usados al generarlo.',
            { code: err?.code, error: err?.message });
    }
};

interface EntradaEmailParams {
    toEmail: string;
    nombre: string;
    eventoNombre: string;
    eventoFecha: string;
    token: string;
    qrDataUrl: string;
}

export const sendEntradaEmail = async ({
    toEmail, nombre, eventoNombre, eventoFecha, token, qrDataUrl
}: EntradaEmailParams): Promise<void> => {
    // Convertir data URL a buffer para adjuntar como CID
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '')
    const qrBuffer = Buffer.from(base64Data, 'base64')

    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Tu entrada — ${eventoNombre}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Poppins',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);">

        <!-- Header -->
        <tr>
            <td style="background:linear-gradient(to right,#770981,#1882da);padding:36px 30px;text-align:center;">
                <h1 style="margin:0;color:#fff;font-family:'Raleway',Arial,sans-serif;font-size:26px;letter-spacing:2px;">Dream Events</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Hacé realidad tu evento soñado</p>
            </td>
        </tr>

        <!-- Confirmación -->
        <tr>
            <td style="padding:32px 40px 16px;text-align:center;">
                <div style="width:64px;height:64px;background:linear-gradient(135deg,#770981,#1882da);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                    <span style="font-size:30px;line-height:64px;color:#fff;">🎟️</span>
                </div>
                <h2 style="margin:0 0 8px;color:#333;font-family:'Raleway',Arial,sans-serif;font-size:20px;">¡Tu entrada está confirmada!</h2>
                <p style="margin:0;color:#555;font-size:14px;line-height:1.7;">
                    Hola <strong>${nombre}</strong>, tu asistencia al evento fue registrada exitosamente.
                </p>
            </td>
        </tr>

        <!-- Detalle del evento -->
        <tr>
            <td style="padding:8px 40px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:14px 18px;background:#f9f4ff;border-radius:10px;border-left:4px solid #770981;">
                            <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#333;font-family:'Raleway',Arial,sans-serif;">📅 ${eventoNombre}</p>
                            <p style="margin:0;font-size:13px;color:#666;">${eventoFecha}</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Separador -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #eee;"/></td></tr>

        <!-- QR -->
        <tr>
            <td style="padding:24px 40px;text-align:center;">
                <p style="margin:0 0 16px;color:#444;font-size:14px;font-weight:600;">Presentá este código QR en la entrada del evento:</p>
                <img src="cid:qrcode" alt="QR de acceso" width="220" height="220"
                     style="border:8px solid #f4f0ff;border-radius:12px;display:block;margin:0 auto;"/>
                <p style="margin:14px 0 0;font-size:11px;color:#aaa;font-family:monospace;">Token: ${token.substring(0, 16)}...</p>
            </td>
        </tr>

        <!-- Nota -->
        <tr>
            <td style="padding:0 40px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:12px 16px;background:#fff8e1;border-radius:8px;border-left:4px solid #e67e00;">
                            <p style="margin:0;font-size:13px;color:#555;">
                                ⚠️ <strong>Importante:</strong> Este código es personal e intransferible.
                                Solo puede ser utilizado una vez en el acceso al evento.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Separador -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #eee;"/></td></tr>

        <!-- Footer -->
        <tr>
            <td style="padding:20px 40px;text-align:center;">
                <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
                    &copy; ${new Date().getFullYear()} Dream Events. Todos los derechos reservados.
                </p>
            </td>
        </tr>

    </table>
    </td></tr>
</table>
</body>
</html>`.trim()

    await enviarCorreo({
        to: toEmail,
        subject: `🎟️ Tu entrada para "${eventoNombre}"`,
        html: htmlContent,
        attachments: [{
            filename: 'entrada-qr.png',
            content: qrBuffer,
            cid: 'qrcode'
        }]
    })
}

export const sendServiciosNotificacion = async (
    toEmail: string,
    nombre: string,
    salonNombre: string,
    fecha: string,
): Promise<void> => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Tu evento en ${salonNombre} — Servicios disponibles</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Poppins',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);">

    <!-- Header -->
    <tr>
        <td style="background:linear-gradient(to right,#770981,#1882da);padding:36px 30px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-family:'Raleway',Arial,sans-serif;font-size:26px;letter-spacing:2px;">Dream Events</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Hacé realidad tu evento soñado</p>
        </td>
    </tr>

    <!-- Saludo -->
    <tr>
        <td style="padding:32px 40px 20px;text-align:center;">
            <div style="width:64px;height:64px;background:linear-gradient(135deg,#770981,#1882da);border-radius:50%;display:inline-block;text-align:center;line-height:64px;margin-bottom:12px;">
                <span style="font-size:30px;">🎉</span>
            </div>
            <h2 style="margin:0 0 10px;color:#333;font-family:'Raleway',Arial,sans-serif;font-size:20px;">¡Hola ${nombre}!</h2>
            <p style="margin:0;color:#555;font-size:14px;line-height:1.7;">
                Tu evento en <strong>${salonNombre}</strong> está agendado para el <strong>${fecha}</strong>.<br/>
                Queremos que sea una experiencia única, y tenemos algo especial para ofrecerte.
            </p>
        </td>
    </tr>

    <!-- Separador -->
    <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #eee;"/></td></tr>

    <!-- Servicios -->
    <tr>
        <td style="padding:24px 40px;">
            <h3 style="margin:0 0 16px;color:#770981;font-family:'Raleway',Arial,sans-serif;font-size:17px;text-align:center;">
                🌟 Potenciá tu evento con nuestros servicios adicionales
            </h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px;">
                <tr>
                    <td style="padding:12px 16px;background:#f9f5ff;border-radius:8px;border-left:4px solid #770981;">
                        <span style="font-size:20px;">🍽️</span>
                        <strong style="color:#333;font-size:14px;margin-left:8px;">Catering</strong>
                        <span style="color:#777;font-size:13px;margin-left:4px;">— Desde menús premium hasta opciones livianas</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding:12px 16px;background:#f0f8ff;border-radius:8px;border-left:4px solid #1882da;">
                        <span style="font-size:20px;">🌸</span>
                        <strong style="color:#333;font-size:14px;margin-left:8px;">Decoración</strong>
                        <span style="color:#777;font-size:13px;margin-left:4px;">— Temática personalizada, flores y arreglos</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding:12px 16px;background:#f9f5ff;border-radius:8px;border-left:4px solid #770981;">
                        <span style="font-size:20px;">🎵</span>
                        <strong style="color:#333;font-size:14px;margin-left:8px;">Audio y DJ</strong>
                        <span style="color:#777;font-size:13px;margin-left:4px;">— Sonido profesional e iluminación LED</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding:12px 16px;background:#f0f8ff;border-radius:8px;border-left:4px solid #1882da;">
                        <span style="font-size:20px;">🔐</span>
                        <strong style="color:#333;font-size:14px;margin-left:8px;">Seguridad y Mobiliario</strong>
                        <span style="color:#777;font-size:13px;margin-left:4px;">— Personal capacitado, sillas, mesas y escenarios</span>
                    </td>
                </tr>
            </table>
            <p style="margin:16px 0 0;color:#888;font-size:12px;text-align:center;font-style:italic;">
                Todos nuestros precios son competitivos y podés contratar directamente desde la plataforma.
            </p>
        </td>
    </tr>

    <!-- CTA -->
    <tr>
        <td align="center" style="padding:8px 40px 36px;">
            <a href="${frontendUrl}/eventos"
               style="display:inline-block;background:linear-gradient(to right,#770981,#1882da);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.5px;">
                Ver servicios disponibles
            </a>
        </td>
    </tr>

    <!-- Separador -->
    <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #eee;"/></td></tr>

    <!-- Footer -->
    <tr>
        <td style="padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
                Recibís este correo porque tenés un evento agendado en ${salonNombre}.<br/>
                &copy; ${new Date().getFullYear()} Dream Events. Todos los derechos reservados.
            </p>
        </td>
    </tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();

    await enviarCorreo({
        to: toEmail,
        subject: `🎉 ¡Tu evento en ${salonNombre} está confirmado! Descubrí nuestros servicios`,
        html: htmlContent,
    });
};

export const sendRegistrationConfirmationEmail = async (
    toEmail: string,
    nombre: string
): Promise<void> => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Bienvenido a Dream Events</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Poppins',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">

                    <!-- Header con gradiente del proyecto -->
                    <tr>
                        <td style="background:linear-gradient(to right, #770981, #732a95, #6c3fa7, #5761c8, #a1358d, #a71261, #9f0035);padding:40px 30px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-family:'Raleway',Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:2px;">
                                Dream Events
                            </h1>
                            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:1px;">
                                Hacé realidad tu evento soñado
                            </p>
                        </td>
                    </tr>

                    <!-- Ícono de check -->
                    <tr>
                        <td align="center" style="padding:36px 30px 10px;">
                            <div style="width:70px;height:70px;background:linear-gradient(135deg,#770981,#5761c8);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:4px;">
                                <span style="font-size:34px;line-height:70px;color:#fff;">✓</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Título y mensaje principal -->
                    <tr>
                        <td style="padding:10px 40px 20px;text-align:center;">
                            <h2 style="margin:0 0 12px;color:#333333;font-family:'Raleway',Arial,sans-serif;font-size:22px;">
                                ¡Bienvenido/a, ${nombre}!
                            </h2>
                            <p style="margin:0;color:#555555;font-size:15px;line-height:1.7;">
                                Tu cuenta en <strong>Dream Events</strong> fue creada exitosamente a través de
                                <strong style="color:#770981;">Google</strong>.
                                Ya podés acceder a todos los servicios de nuestra plataforma.
                            </p>
                        </td>
                    </tr>

                    <!-- Separador -->
                    <tr>
                        <td style="padding:0 40px;">
                            <hr style="border:none;border-top:1px solid #eeeeee;" />
                        </td>
                    </tr>

                    <!-- Detalles de la cuenta -->
                    <tr>
                        <td style="padding:24px 40px;">
                            <p style="margin:0 0 14px;color:#333333;font-size:14px;font-weight:600;">
                                Detalle de tu cuenta:
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding:10px 14px;background:#f9f5ff;border-radius:8px;border-left:4px solid #770981;">
                                        <span style="font-size:13px;color:#555;">📧 Email verificado con Google</span>
                                        <br/>
                                        <span style="font-size:13px;color:#555;">🔐 Acceso seguro mediante OAuth 2.0</span>
                                        <br/>
                                        <span style="font-size:13px;color:#555;">👤 Rol asignado: <strong>Cliente</strong></span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Botón CTA -->
                    <tr>
                        <td align="center" style="padding:10px 40px 36px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}"
                               style="display:inline-block;background:linear-gradient(to right,#770981,#5761c8);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.5px;">
                                Ingresar a Dream Events
                            </a>
                        </td>
                    </tr>

                    <!-- Separador -->
                    <tr>
                        <td style="padding:0 40px;">
                            <hr style="border:none;border-top:1px solid #eeeeee;" />
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:24px 40px;text-align:center;">
                            <p style="margin:0;color:#999999;font-size:12px;line-height:1.6;">
                                Si no creaste esta cuenta, podés ignorar este correo.<br/>
                                &copy; ${new Date().getFullYear()} Dream Events. Todos los derechos reservados.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();

    await enviarCorreo({
        to: toEmail,
        subject: '¡Bienvenido/a a Dream Events! Tu registro fue exitoso',
        html: htmlContent,
    });
};

// Notifica a un usuario que cambiaron las condiciones de comisión de su tipo de contrato
export const sendComisionActualizadaEmail = async (
    toEmail: string,
    nombre: string,
    perfilLabel: string,
    cambios: { clienteAnt: number; clienteNue: number; provAnt: number; provNue: number },
): Promise<void> => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const fila = (l: string, a: number, n: number) => a !== n
        ? `<tr><td style="padding:8px 0;color:#555;font-size:14px;">${l}</td><td style="text-align:right;font-size:14px;"><span style="color:#999;text-decoration:line-through;">${a}%</span> &nbsp;→&nbsp; <strong style="color:#770981;">${n}%</strong></td></tr>`
        : `<tr><td style="padding:8px 0;color:#555;font-size:14px;">${l}</td><td style="text-align:right;font-size:14px;color:#333;">${n}% <span style="color:#999;">(sin cambios)</span></td></tr>`;
    const html = `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Poppins',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.12);">
  <tr><td style="background:linear-gradient(to right,#770981,#1882da);padding:32px 30px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-family:'Raleway',Arial,sans-serif;font-size:24px;letter-spacing:2px;">Dream Events</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Actualización de condiciones del contrato</p>
  </td></tr>
  <tr><td style="padding:30px 40px 10px;">
    <h2 style="margin:0 0 10px;color:#333;font-family:'Raleway',Arial,sans-serif;font-size:19px;">Hola ${nombre},</h2>
    <p style="margin:0 0 6px;color:#555;font-size:14px;line-height:1.7;">
      Te informamos que se actualizaron las <strong>comisiones de la plataforma</strong> para tu tipo de contrato
      (<strong>${perfilLabel}</strong>). Estas condiciones aplican a las nuevas operaciones.
    </p>
  </td></tr>
  <tr><td style="padding:6px 40px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;">
      ${fila('Comisión cliente', cambios.clienteAnt, cambios.clienteNue)}
      ${fila('Comisión proveedor', cambios.provAnt, cambios.provNue)}
    </table>
  </td></tr>
  <tr><td style="padding:0 40px 30px;text-align:center;">
    <a href="${frontendUrl}" style="display:inline-block;background:linear-gradient(135deg,#770981,#1882da);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">Ir a Dream Events</a>
  </td></tr>
  <tr><td style="padding:16px 40px;background:#faf7fd;text-align:center;color:#9a8aa5;font-size:12px;">
    Este es un aviso automático sobre cambios en las condiciones del contrato.
  </td></tr>
</table></td></tr></table></body></html>`;
    await enviarCorreo({
        to: toEmail,
        subject: `Cambio en las comisiones de tu contrato — ${perfilLabel}`,
        html,
    });
};

// Correo promocional de cumpleaños: ofrece un cupón de descuento para organizar
// el cumpleaños en la plataforma. Lo dispara el job diario cuponCumpleanos.
export const sendCumpleanosCuponEmail = async (
    toEmail: string,
    nombre: string,
    codigoCupon: string,
    descuentoPorcentaje: number,
): Promise<void> => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>¡Feliz cumpleaños! — Dream Events</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Poppins',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(to right,#770981,#1882da);padding:36px 30px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-family:'Raleway',Arial,sans-serif;font-size:26px;letter-spacing:2px;">Dream Events</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Hacé realidad tu evento soñado</p>
  </td></tr>

  <!-- Saludo -->
  <tr><td style="padding:34px 40px 12px;text-align:center;">
    <div style="width:70px;height:70px;background:linear-gradient(135deg,#770981,#1882da);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
      <span style="font-size:34px;line-height:70px;color:#fff;">🎂</span>
    </div>
    <h2 style="margin:0 0 8px;color:#333;font-family:'Raleway',Arial,sans-serif;font-size:22px;">¡Feliz cumpleaños, ${nombre}!</h2>
    <p style="margin:0;color:#555;font-size:14px;line-height:1.7;">
      Todo Dream Events te desea un día increíble. Y qué mejor forma de festejarlo que
      organizando <strong>tu propia fiesta de cumpleaños</strong> con nosotros.
    </p>
  </td></tr>

  <!-- Cupón -->
  <tr><td style="padding:8px 40px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:22px;background:linear-gradient(135deg,#f9f0ff,#eef4ff);border-radius:12px;border:2px dashed #770981;text-align:center;">
        <p style="margin:0 0 6px;color:#770981;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Tu regalo de cumpleaños</p>
        <p style="margin:0 0 10px;color:#1882da;font-size:34px;font-weight:800;font-family:'Raleway',Arial,sans-serif;">${descuentoPorcentaje}% OFF</p>
        <p style="margin:0 0 4px;color:#555;font-size:13px;">Usá este código al organizar tu evento:</p>
        <p style="margin:0;display:inline-block;background:#fff;border:1px solid #d9c7ee;border-radius:8px;padding:10px 18px;font-family:monospace;font-size:18px;font-weight:700;color:#770981;letter-spacing:2px;">${codigoCupon}</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- CTA -->
  <tr><td align="center" style="padding:6px 40px 34px;">
    <a href="${frontendUrl}/eventos/new" style="display:inline-block;background:linear-gradient(to right,#770981,#1882da);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:.5px;">
      Organizar mi cumpleaños
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #eee;"/></td></tr>
  <tr><td style="padding:20px 40px;text-align:center;">
    <p style="margin:0;color:#aaa;font-size:12px;line-height:1.6;">
      Recibís este correo porque hoy es tu cumpleaños según los datos de tu cuenta.<br/>
      &copy; ${new Date().getFullYear()} Dream Events. Todos los derechos reservados.
    </p>
  </td></tr>

</table></td></tr></table></body></html>`.trim();

    await enviarCorreo({
        to: toEmail,
        subject: `🎂 ¡Feliz cumple, ${nombre}! Tenés ${descuentoPorcentaje}% OFF para tu fiesta`,
        html,
    });
};
