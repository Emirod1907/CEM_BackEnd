import { RequestHandler } from 'express'
import * as XLSX from 'xlsx'
import ServicioAdicional from '../models/servicioAdicional'
import Contrato from '../models/contrato'
import { logger } from '../libs/logger'

// ── Constantes de validación ───────────────────────────────────────────────────
const CATEGORIAS_VALIDAS = new Set([
    'catering', 'decoracion', 'audio_video', 'seguridad',
    'mobiliario', 'entretenimiento', 'personal', 'tortas',
    'bebidas', 'comida', 'alimentos', 'cotillon', 'vajilla', 'otro',
])
const TIPOS_PRECIO_VALIDOS = new Set(['fijo', 'por_persona', 'por_hora', 'por_turno'])
const TIPOS_ITEM_VALIDOS   = new Set(['producto', 'servicio'])

interface FilaValida {
    fila: number
    nombre: string
    descripcion: string
    marca: string | null
    precio_base: number
    precio: number
    categoria: string
    tipo_precio: string
    tipo_item: string
    capacidad_maxima: number | null
    descuento_cantidad_min: number | null
    descuento_porcentaje: number | null
}

interface FilaInvalida {
    fila: number
    error: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function normalizarRow(raw: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [
            k.trim().toLowerCase().replace(/\s+/g, '_'),
            typeof v === 'string' ? v.trim() : v,
        ])
    )
}

function parsearExcel(buffer: Buffer): Record<string, any>[] {
    const wb  = XLSX.read(buffer, { type: 'buffer' })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: '' })
    return raw.map(normalizarRow)
}

function precioPublico(precio_base: number, comisionPct: number): number {
    return +(precio_base * (1 + comisionPct / 100)).toFixed(2)
}

function validarFila(row: Record<string, any>, idx: number): FilaValida | FilaInvalida {
    const num = idx + 2 // fila del Excel (1=header, datos desde 2)

    // Acepta "producto" (planilla de tienda) o "nombre" (planilla genérica)
    const nombre = String(row.producto ?? row.nombre ?? '').trim()
    if (!nombre) return { fila: num, error: 'producto (nombre) es requerido' }

    // Acepta "precio" o "precio_base"
    const precioCampo = row.precio ?? row.precio_base
    const precioRaw = Number(precioCampo)
    if ((!precioCampo && precioCampo !== 0) || isNaN(precioRaw) || precioRaw <= 0) {
        return { fila: num, error: 'precio debe ser un número mayor a 0' }
    }

    const categoria = String(row.categoria ?? '').trim().toLowerCase()
    if (!CATEGORIAS_VALIDAS.has(categoria)) {
        return {
            fila: num,
            error: `categoría inválida "${categoria}" — valores válidos: ${[...CATEGORIAS_VALIDAS].join(', ')}`,
        }
    }

    const tipoPrecio = String(row.tipo_precio ?? 'fijo').trim().toLowerCase() || 'fijo'
    if (!TIPOS_PRECIO_VALIDOS.has(tipoPrecio)) {
        return {
            fila: num,
            error: `tipo_precio inválido "${tipoPrecio}" — valores válidos: ${[...TIPOS_PRECIO_VALIDOS].join(', ')}`,
        }
    }

    const tipoItem = String(row.tipo_item ?? 'producto').trim().toLowerCase() || 'producto'
    if (!TIPOS_ITEM_VALIDOS.has(tipoItem)) {
        return {
            fila: num,
            error: `tipo_item inválido "${tipoItem}" — valores válidos: ${[...TIPOS_ITEM_VALIDOS].join(', ')}`,
        }
    }

    const capacidadRaw = row.capacidad_maxima
    let capacidad_maxima: number | null = null
    if (capacidadRaw !== '' && capacidadRaw != null) {
        const n = Number(capacidadRaw)
        if (isNaN(n) || n <= 0 || !Number.isInteger(n)) {
            return { fila: num, error: 'capacidad_maxima debe ser un entero positivo o estar vacío' }
        }
        capacidad_maxima = n
    }

    // Marca (opcional)
    const marca = String(row.marca ?? '').trim() || null

    // Construir descripcion: base + presentación si existe
    let descripcion = String(row.descripcion ?? '').trim()
    const presentacion = String(row.presentacion ?? '').trim()
    if (presentacion) {
        descripcion = descripcion ? `${descripcion} (${presentacion})` : presentacion
    }

    // Descuento por cantidad: "% descuento a partir de X unidades".
    // Las dos columnas van juntas (si se carga una, se exige la otra).
    let descuento_cantidad_min: number | null = null
    let descuento_porcentaje: number | null = null
    const cantMinRaw = row.cantidad_min_descuento ?? row.cantidad_minima ?? row.cant_min
    const descRaw    = row.descuento_porcentaje ?? row.descuento ?? row.porcentaje_descuento
    const hayCant = cantMinRaw !== '' && cantMinRaw != null
    const hayDesc = descRaw !== '' && descRaw != null
    if (hayCant || hayDesc) {
        const cm = Number(cantMinRaw)
        const dp = Number(descRaw)
        if (!hayCant || isNaN(cm) || cm <= 1 || !Number.isInteger(cm)) {
            return { fila: num, error: 'cantidad_min_descuento debe ser un entero mayor a 1 (o dejar vacías ambas columnas de descuento)' }
        }
        if (!hayDesc || isNaN(dp) || dp <= 0 || dp > 100) {
            return { fila: num, error: 'descuento_porcentaje debe estar entre 1 y 100' }
        }
        descuento_cantidad_min = cm
        descuento_porcentaje = dp
    }

    return {
        fila: num,
        nombre,
        descripcion,
        marca,
        precio_base: precioRaw,
        precio: 0, // se calcula después con la comisión
        categoria,
        tipo_precio: tipoPrecio,
        tipo_item:   tipoItem,
        capacidad_maxima,
        descuento_cantidad_min,
        descuento_porcentaje,
    }
}

async function resolverComision(persona_id: number): Promise<number> {
    // contratoVigenteRequired garantiza que existe — aun así fallback a 0
    const contrato = await Contrato.findOne({
        where: { persona_id, estado: 'vigente', ambito: 'proveedor' },
        attributes: ['comision_cliente_porcentaje'],
    })
    return contrato ? Number(contrato.comision_cliente_porcentaje) : 0
}

function procesarFilas(
    rows: Record<string, any>[],
    comisionPct: number
): { validas: FilaValida[]; invalidas: FilaInvalida[] } {
    const validas:   FilaValida[]   = []
    const invalidas: FilaInvalida[] = []

    for (let i = 0; i < rows.length; i++) {
        const resultado = validarFila(rows[i], i)
        if ('error' in resultado) {
            invalidas.push(resultado)
        } else {
            resultado.precio = precioPublico(resultado.precio_base, comisionPct)
            validas.push(resultado)
        }
    }

    return { validas, invalidas }
}

// ── GET /api/servicios/plantilla-excel ────────────────────────────────────────
export const getPlantillaExcel: RequestHandler = (_req, res, next) => {
    try {
        // Planilla de productos de tienda: producto, presentación, precio, categoría,
        // y el descuento por volumen (a partir de X unidades, Y% off)
        const HEADERS  = ['producto', 'marca', 'presentacion', 'precio', 'categoria', 'cantidad_min_descuento', 'descuento_porcentaje']
        const EJEMPLO1 = ['Gaseosa Cola', 'Coca-Cola',      'Botella 2.25L', 2500, 'bebidas', 12, 10]
        const EJEMPLO2 = ['Agua mineral', 'Villavicencio',  'Pack x6 500ml', 3000, 'bebidas', 24, 15]
        const EJEMPLO3 = ['Papas fritas', 'Lays',           'Paquete 500g',  1800, 'comida', '', '']

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet([HEADERS, EJEMPLO1, EJEMPLO2, EJEMPLO3])

        // Ancho de columnas
        ws['!cols'] = [
            { wch: 24 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 20 },
        ]

        // Hoja de referencia con las categorías válidas
        const wsRef = XLSX.utils.aoa_to_sheet([
            ['Categorías válidas'],
            ['bebidas'], ['comida'], ['catering'], ['decoracion'],
            ['audio_video'], ['mobiliario'], ['seguridad'], ['entretenimiento'], ['otro'],
            [''],
            ['Descuento por cantidad (opcional):'],
            ['Dejá ambas columnas vacías si el producto no tiene descuento.'],
            ['Si las completás: cantidad_min_descuento = desde cuántas unidades aplica; descuento_porcentaje = 1 a 100.'],
        ])
        wsRef['!cols'] = [{ wch: 70 }]

        XLSX.utils.book_append_sheet(wb, ws, 'Productos')
        XLSX.utils.book_append_sheet(wb, wsRef, 'Instrucciones')
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla_productos.xlsx"')
        res.send(buf)
    } catch (err) {
        next(err)
    }
}

// ── POST /api/servicios/importar-excel/preview ────────────────────────────────
export const previewImportarExcel: RequestHandler = async (req: any, res, next) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No se recibió ningún archivo. Usa el campo "archivo".' })
            return
        }

        let rows: Record<string, any>[]
        try {
            rows = parsearExcel(req.file.buffer)
        } catch {
            res.status(400).json({ message: 'Archivo Excel inválido o corrupto' })
            return
        }

        if (rows.length === 0) {
            res.status(400).json({ message: 'El archivo no contiene filas de datos' })
            return
        }

        const proveedor_id = req.persona?.id_persona as number
        const comisionPct  = await resolverComision(proveedor_id)
        const { validas, invalidas } = procesarFilas(rows, comisionPct)

        // El proveedor ve sus precios base, NO el precio público con markup sumado
        const filasPreview = validas.map(({ precio: _p, ...f }) => f)

        res.json({
            comision_aplicada: comisionPct,
            filas_validas:     filasPreview,
            filas_invalidas:   invalidas,
            total_validas:     validas.length,
            total_invalidas:   invalidas.length,
        })
    } catch (err) {
        next(err)
    }
}

// ── POST /api/servicios/importar-excel/confirmar ──────────────────────────────
export const confirmarImportarExcel: RequestHandler = async (req: any, res, next) => {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No se recibió ningún archivo. Usa el campo "archivo".' })
            return
        }

        let rows: Record<string, any>[]
        try {
            rows = parsearExcel(req.file.buffer)
        } catch {
            res.status(400).json({ message: 'Archivo Excel inválido o corrupto' })
            return
        }

        if (rows.length === 0) {
            res.status(400).json({ message: 'El archivo no contiene filas de datos' })
            return
        }

        const proveedor_id = req.persona?.id_persona as number
        const comisionPct  = await resolverComision(proveedor_id)
        const { validas, invalidas } = procesarFilas(rows, comisionPct)

        if (validas.length === 0) {
            res.status(400).json({
                message: 'No hay filas válidas para importar',
                errores: invalidas,
            })
            return
        }

        const registros = validas.map(f => ({
            nombre:          f.nombre,
            descripcion:     f.descripcion,
            marca:           f.marca,
            precio_base:     f.precio_base,
            precio:          f.precio,
            categoria:       f.categoria,
            tipo_precio:     f.tipo_precio,
            tipo_item:       f.tipo_item,
            capacidad_maxima: f.capacidad_maxima,
            descuento_cantidad_min: f.descuento_cantidad_min,
            descuento_porcentaje:   f.descuento_porcentaje,
            proveedor_id,
            disponible: true,
            imagen: null,
        }))

        const creados = await ServicioAdicional.bulkCreate(registros as any)
        logger.info('[ImportarExcel] Servicios importados', { proveedor_id, cantidad: creados.length })

        res.status(201).json({
            ok:      true,
            creados: creados.length,
            errores: invalidas,
        })
    } catch (err) {
        next(err)
    }
}
