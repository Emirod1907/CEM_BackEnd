// Probador de SMTP: valida las credenciales y envía un correo de prueba.
// Uso: npx ts-node src/scripts/testEmail.ts [destinatario]
import dotenv from 'dotenv'
dotenv.config()

import nodemailer from 'nodemailer'

async function main() {
    const destino = process.argv[2] || process.env.EMAIL_USER || ''
    const user = (process.env.EMAIL_USER || '').trim()
    const pass = (process.env.EMAIL_PASS || '').trim()

    console.log('Host:', process.env.EMAIL_HOST || 'smtp.gmail.com')
    console.log('User:', user)
    console.log('Pass length:', pass.length)
    console.log('Destino de prueba:', destino)

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_PORT === '465',
        auth: { user, pass },
    })

    console.log('\n1) Verificando conexión SMTP…')
    await transporter.verify()
    console.log('   ✅ SMTP OK — credenciales válidas')

    console.log('\n2) Enviando correo de prueba…')
    const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"Dream Events (no responder)" <${user}>`,
        to: destino,
        subject: '✅ Prueba de correo — Dream Events',
        html: '<h2>Dream Events</h2><p>Si ves este correo, el envío de mails ya funciona. 🎉</p>',
    })
    console.log('   ✅ Enviado. messageId:', info.messageId)
    console.log('   Revisá la casilla:', destino)
}

main().catch((err) => {
    console.error('\n❌ Falló:', err?.message || err)
    if (String(err?.message).includes('BadCredentials') || err?.responseCode === 535) {
        console.error('   → Credenciales rechazadas. Verificá que EMAIL_PASS sea la Contraseña de aplicación (16 caracteres, sin espacios) de EMAIL_USER.')
    }
    process.exit(1)
})
