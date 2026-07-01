/**
 * Servicio ARCA (ex-AFIP) — placeholder hasta obtener certificados digitales y homologación.
 *
 * Para habilitar en producción se requiere:
 *   - Certificado digital ARCA (.crt / .key) obtenido desde el portal AFIP
 *   - CUIT del emisor habilitado ante AFIP
 *   - Punto de venta registrado en AFIP
 *   - Librería SOAP: evaluar 'afip.ts' (https://www.npmjs.com/package/@afipsdk/afip.js)
 *     o 'facturajs' (https://www.npmjs.com/package/facturajs)
 *   - WSAA: Servicio de Autenticación y Autorización (obtiene token/sign)
 *   - WSFE: Web Service de Facturación Electrónica (emite CAE)
 *   - Homologación en ambiente de pruebas antes de producción
 */

export class ArcaError extends Error {
    code: string
    constructor(code: string, message: string) {
        super(message)
        this.name = 'ArcaError'
        this.code = code
    }
}

export interface DatosFactura {
    orden_id: number
    cuit_receptor: string
    razon_social_receptor?: string
    domicilio_receptor?: string
    monto: number
    tipo_comprobante?: 'A' | 'B' | 'C'
    punto_venta?: number
    concepto?: 1 | 2 | 3  // 1=Productos, 2=Servicios, 3=Ambos
}

export interface ResultadoCAE {
    cae: string
    cae_vencimiento: string  // YYYYMMDD
    numero_comprobante: number
    xml_respuesta?: string
}

export interface ConsultaCAE {
    tipo_comprobante: 'A' | 'B' | 'C'
    punto_venta: number
    numero_comprobante: number
}

const NO_IMPL_MSG =
    'La integración con ARCA/AFIP aún no está operativa. ' +
    'Se requieren certificados digitales, CUIT habilitado y homologación ante AFIP.'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function emitirFactura(_datos: DatosFactura): Promise<ResultadoCAE> {
    throw new ArcaError('ARCA_NO_IMPLEMENTADO', NO_IMPL_MSG)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function consultarCAE(_consulta: ConsultaCAE): Promise<ResultadoCAE> {
    throw new ArcaError('ARCA_NO_IMPLEMENTADO', NO_IMPL_MSG)
}
