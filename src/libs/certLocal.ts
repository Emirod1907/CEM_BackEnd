import fs from 'fs'
import path from 'path'

// Certificado autofirmado para el puente HTTPS local (back_urls de MercadoPago).
// Se genera una sola vez y se persiste en certs/ para que el navegador
// recuerde la excepción de seguridad entre reinicios del servidor.
export async function obtenerCertificadoLocal(): Promise<{ key: string; cert: string }> {
    const dir = path.join(__dirname, '..', '..', 'certs')
    const keyPath = path.join(dir, 'localhost-key.pem')
    const certPath = path.join(dir, 'localhost-cert.pem')

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
            key: fs.readFileSync(keyPath, 'utf8'),
            cert: fs.readFileSync(certPath, 'utf8'),
        }
    }

    const selfsigned = require('selfsigned')
    const pems = await selfsigned.generate(
        [{ name: 'commonName', value: 'localhost' }],
        {
            days: 3650,
            keySize: 2048,
            extensions: [{
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: 'localhost' },  // DNS
                    { type: 7, ip: '127.0.0.1' },     // IP
                ],
            }],
        }
    )

    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(keyPath, pems.private)
    fs.writeFileSync(certPath, pems.cert)

    return { key: pems.private, cert: pems.cert }
}
