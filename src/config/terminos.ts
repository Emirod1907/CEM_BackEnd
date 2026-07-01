import { createHash } from 'crypto'

export const VERSION_TERMINOS = 'v1.0'

// Comisiones por defecto hasta que exista la config de precios (Feature 2)
export const COMISION_DEFAULT = 8            // % cliente (markup sobre precio base)
export const COMISION_PROVEEDOR_DEFAULT = 3  // % proveedor (descuento al liquidar)

export const TEXTO_TERMINOS = `TÉRMINOS Y CONDICIONES PARA PROVEEDORES Y DUEÑOS DE SALÓN
DREAM EVENTS — Versión ${VERSION_TERMINOS}
Fecha de vigencia: 01/06/2026

================================================================================

1. COMISIONES Y MODELO DE DOS LADOS

La plataforma Dream Events opera un modelo de comisión de dos componentes,
que el proveedor/dueño de salón conoce y acepta explícitamente al firmar el presente
contrato:

a) COMISIÓN DEL LADO CLIENTE (markup de precio):
   Un porcentaje se suma al precio base informado por el proveedor para conformar
   el precio público que ve y paga el cliente final. El monto adicional cobrado al
   cliente en concepto de comisión es retención exclusiva de la plataforma y no
   forma parte del precio acordado con el proveedor.

b) COMISIÓN DEL LADO PROVEEDOR (descuento en liquidación):
   Un porcentaje se descuenta del precio base al momento de liquidar al proveedor.
   El monto que el proveedor recibirá es: precio_base × (1 − comisión_proveedor / 100).

Ambos porcentajes quedan CONGELADOS en el presente contrato en el momento de su
aceptación. Los valores exactos aplicables a este perfil son informados en pantalla
antes de la firma y quedan registrados de forma inmutable en la base de datos junto
con este contrato.

Si la plataforma modifica los porcentajes de comisión vigentes, se generará una nueva
versión de los presentes términos. Los contratos bajo versiones anteriores mantienen
los porcentajes originalmente aceptados para todas las transacciones realizadas
durante su vigencia.

La liquidación de las comisiones se realiza conforme al calendario de pagos
establecido por Dream Events. El proveedor/dueño de salón podrá consultar
su historial de liquidaciones desde su panel de administración.

[PLACEHOLDER — completar con periodicidad de liquidación y método de pago]

--------------------------------------------------------------------------------

2. RESPONSABILIDADES DEL PROVEEDOR / DUEÑO DE SALÓN

El proveedor/dueño de salón es el único y exclusivo responsable de:

a) Mantener actualizada y veraz la información de sus servicios o salones
   publicados en la plataforma, incluyendo descripción, precio, disponibilidad
   y fotografías.

b) Garantizar la disponibilidad efectiva de los servicios o salones confirmados
   a través de la plataforma en las fechas y condiciones acordadas.

c) Cumplir con los plazos, condiciones y estándares de calidad prometidos al
   momento de la contratación.

d) Responder directamente ante los clientes por cualquier falla, deficiencia o
   incumplimiento en la prestación de sus servicios.

e) Comunicar con antelación suficiente cualquier modificación que afecte una
   reserva ya confirmada.

[PLACEHOLDER — completar con estándares mínimos de calidad y tiempos de respuesta]

--------------------------------------------------------------------------------

3. HABILITACIONES Y CUMPLIMIENTO NORMATIVO

El proveedor/dueño de salón declara y garantiza que:

a) Cuenta con todas las habilitaciones municipales, provinciales y nacionales
   vigentes requeridas para el ejercicio de su actividad comercial.

b) Se compromete a mantener dichas habilitaciones vigentes durante toda la
   relación contractual con la plataforma, notificando de inmediato ante
   cualquier vencimiento, suspensión o revocación.

c) Cumple con la normativa vigente en materia de seguridad e higiene, habilitación
   de locales con aforo, habilitaciones bromatológicas (cuando aplique) y toda
   normativa sectorial que corresponda.

d) Dream Events no asume ninguna responsabilidad por la falta de
   habilitaciones o incumplimientos normativos del proveedor, reservándose el
   derecho de dar de baja publicaciones ante denuncias fundadas o verificación
   de incumplimientos.

[PLACEHOLDER — completar con listado específico de habilitaciones por categoría]

--------------------------------------------------------------------------------

4. CLÁUSULA DE INDEMNIDAD

El proveedor/dueño de salón mantendrá indemne a Dream Events, sus
representantes legales, directores, empleados, socios y empresas relacionadas
frente a cualquier reclamo, demanda, daño, pérdida, costo o gasto (incluidos
honorarios legales razonables) que surja de:

a) Cualquier incumplimiento de las obligaciones asumidas en el presente contrato.

b) Cualquier acto u omisión del proveedor en la prestación de sus servicios o
   en la gestión de su salón.

c) Cualquier infracción a leyes, reglamentos o derechos de terceros vinculada
   a la actividad del proveedor.

d) Reclamaciones de clientes derivadas de servicios deficientes, cancelaciones
   injustificadas o información falsa publicada en la plataforma.

--------------------------------------------------------------------------------

5. CANCELACIONES Y REEMBOLSOS

Las políticas de cancelación y reembolso se rigen según los términos acordados en
cada reserva individual y la política general de la plataforma vigente al momento
de la contratación.

El proveedor/dueño de salón se compromete a:

a) Respetar íntegramente las políticas de cancelación informadas al cliente.

b) No aplicar penalidades adicionales no informadas al cliente al momento de la
   contratación.

c) Procesar los reembolsos que correspondan en los plazos establecidos por la
   plataforma.

[PLACEHOLDER — completar con política de cancelación detallada por categoría y
plazos específicos de reembolso]

--------------------------------------------------------------------------------

6. VIGENCIA Y MODIFICACIONES

El presente contrato tiene vigencia indefinida desde la fecha de su aceptación
electrónica, salvo que sea reemplazado por una versión posterior.

Dream Events se reserva el derecho de modificar los presentes términos.
Ante cualquier modificación sustancial, se generará una nueva versión y el
proveedor deberá aceptarla para continuar publicando en la plataforma. Los
contratos bajo versiones anteriores conservan plena validez para las transacciones
realizadas durante su vigencia.

--------------------------------------------------------------------------------

7. FIRMA ELECTRÓNICA Y VALIDEZ LEGAL

La aceptación de los presentes términos constituye una firma electrónica en los
términos de la Ley N° 25.506 de Firma Digital de la República Argentina y su
decreto reglamentario N° 2628/2002.

El sistema registra los siguientes elementos probatorios:
- Identidad del firmante (persona_id vinculado a cuenta verificada con email)
- Fecha y hora exacta de aceptación (timestamp UTC)
- Dirección IP del dispositivo utilizado
- Identificador del navegador y sistema operativo (user agent)
- Versión exacta de los términos aceptados
- Hash SHA-256 del texto íntegro de los términos aceptados

Esta información queda almacenada de forma inmutable en la base de datos de
Dream Events y tiene plena validez legal como prueba de aceptación del
presente contrato.

================================================================================

Al hacer clic en "Acepto los términos y condiciones", el proveedor/dueño de salón
declara haber leído, comprendido y aceptado íntegramente los presentes términos y
condiciones en todas sus cláusulas.`

export const hashTerminos = (): string =>
    createHash('sha256').update(TEXTO_TERMINOS, 'utf8').digest('hex')
