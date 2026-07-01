import crypto from 'crypto'

export type MpEnv = 'sandbox' | 'production'

export interface MpCredentials {
    clientId: string
    clientSecret: string
    accessToken: string
    publicKey: string
    env: MpEnv
}

function requireVar(name: string): string {
    const v = process.env[name]
    if (!v || v.trim() === '') throw new Error(`Variable de entorno requerida faltante: ${name}`)
    return v.trim()
}

export function getMpCredentials(): MpCredentials {
    const env = (process.env.MP_ENV ?? 'sandbox').trim() as MpEnv

    if (env !== 'sandbox' && env !== 'production') {
        throw new Error(`MP_ENV debe ser 'sandbox' o 'production', recibido: '${env}'`)
    }

    if (env === 'production') {
        return {
            clientId:     requireVar('MP_PROD_CLIENT_ID'),
            clientSecret: requireVar('MP_PROD_CLIENT_SECRET'),
            accessToken:  requireVar('MP_PROD_ACCESS_TOKEN'),
            publicKey:    requireVar('MP_PROD_PUBLIC_KEY'),
            env:          'production',
        }
    }

    return {
        clientId:     requireVar('MP_TEST_CLIENT_ID'),
        clientSecret: process.env.MP_TEST_CLIENT_SECRET?.trim() ?? '', // requerido en Parte 1 (OAuth), opcional ahora
        accessToken:  requireVar('MP_TEST_ACCESS_TOKEN'),
        publicKey:    requireVar('MP_TEST_PUBLIC_KEY'),
        env:          'sandbox',
    }
}

// URL pública para que MP notifique pagos. MP no puede llamar a localhost:
// si no hay URL pública (MP_WEBHOOK_URL con ngrok, o BACKEND_URL https) se
// devuelve undefined y el pago se confirma al volver del checkout
// (POST /api/pagos/confirmar).
export function getMpNotificationUrl(): string | undefined {
    const explicit = process.env.MP_WEBHOOK_URL?.trim()
    if (explicit && explicit.startsWith('https://') && !explicit.includes('TU_NGROK')) return explicit
    const backend = (process.env.BACKEND_URL ?? '').trim()
    if (backend.startsWith('https://')) return `${backend}/api/pagos/webhook`
    return undefined
}

// back_urls del checkout. MP solo muestra el botón "Volver al sitio" y el
// contador de auto_return cuando son HTTPS. En producción apuntan directo al
// frontend; en local apuntan al puente https del backend (puerto 8443), que
// redirige al frontend http.
export function getMpBackUrls(): { success: string; failure: string; pending: string } {
    const frontend = (process.env.FRONTEND_URL ?? 'http://localhost:5173').trim()
    if (frontend.startsWith('https://')) {
        return {
            success: `${frontend}/pago/exito`,
            failure: `${frontend}/pago/fallo`,
            pending: `${frontend}/pago/pendiente`,
        }
    }
    const puerto = (process.env.MP_RETORNO_PORT ?? '8443').trim()
    const base = `https://localhost:${puerto}/api/pagos/retorno`
    return {
        success: `${base}/exito`,
        failure: `${base}/fallo`,
        pending: `${base}/pendiente`,
    }
}

export function getMpEncryptionKey(): Buffer {
    const hex = requireVar('MP_TOKEN_ENCRYPTION_KEY')
    if (hex.length !== 64) throw new Error('MP_TOKEN_ENCRYPTION_KEY debe ser 64 caracteres hex (32 bytes)')
    return Buffer.from(hex, 'hex')
}

// AES-256-GCM — cifra un token OAuth antes de guardarlo en DB
export function encryptToken(plaintext: string): string {
    const key = getMpEncryptionKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    // formato: iv(12):tag(16):ciphertext — todo en hex
    return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

// AES-256-GCM — descifra un token OAuth leído de DB
export function decryptToken(stored: string): string {
    const key = getMpEncryptionKey()
    const parts = stored.split(':')
    if (parts.length !== 3) throw new Error('Token cifrado con formato inválido')
    const iv        = Buffer.from(parts[0], 'hex')
    const tag       = Buffer.from(parts[1], 'hex')
    const encrypted = Buffer.from(parts[2], 'hex')
    const decipher  = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted) + decipher.final('utf8')
}
