import { Request, Response, RequestHandler } from 'express';
import ServicioAdicional from '../models/servicioAdicional';
import Reserva from '../models/reserva';
import Salon from '../models/salon';
import Persona from '../models/persona';
import Orden from '../models/orden';
import AgendaProveedor from '../models/agendaProveedor';
import Contrato from '../models/contrato';

// El proveedor carga su precio base; el público paga precio_base + comisión del contrato vigente.
async function calcularPrecioPublicoProveedor(precioBase: number, proveedor_id?: number | null): Promise<number> {
    if (!proveedor_id) return precioBase;
    try {
        const contrato = await Contrato.findOne({
            where: { persona_id: proveedor_id, estado: 'vigente', ambito: 'proveedor' },
            attributes: ['comision_cliente_porcentaje'],
        });
        const pct = contrato ? Number(contrato.comision_cliente_porcentaje) : 0;
        return +(precioBase * (1 + pct / 100)).toFixed(2);
    } catch {
        return precioBase;
    }
}

async function reservaIncluyeServicioDeProveedor(reserva: Reserva, proveedor_id?: number | null): Promise<boolean> {
    if (!proveedor_id) return false;

    const serviciosProveedor = await ServicioAdicional.findAll({
        where: { proveedor_id },
        attributes: ['id_servicio']
    });
    const idsProveedor = new Set(serviciosProveedor.map(s => Number(s.id_servicio)));
    if (idsProveedor.size === 0) return false;

    const ordenes = await Orden.findAll({
        where: { reserva_id: reserva.id_reserva, tipo: 'organizador' },
        attributes: ['items']
    });

    for (const orden of ordenes) {
        let items: any[] = [];
        try { items = JSON.parse(orden.items) } catch {}
        if (items.some((item: any) => item.id_servicio && idsProveedor.has(Number(item.id_servicio)))) {
            return true;
        }
    }

    let datos: any = {};
    try { datos = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {} } catch {}
    const serviciosDatos: any[] = Array.isArray(datos.servicios) ? datos.servicios : [];
    return serviciosDatos.some((item: any) => item.id_servicio && idsProveedor.has(Number(item.id_servicio)));
}

// GET /api/servicios — todos los servicios disponibles (usados en el modal del organizador)
// Devuelve precio (precio público con markup) pero NUNCA precio_base
export const getServicios: RequestHandler = async (req: Request, res: Response) => {
    try {
        const servicios = await ServicioAdicional.findAll({
            where: { disponible: true },
            order: [['categoria', 'ASC'], ['nombre', 'ASC']]
        });
        // Comisión vigente por proveedor: el precio público se calcula dinámicamente
        // (precio_base + comisión del contrato vigente), así se actualiza al aceptar/cambiar contrato
        const proveedorIds = [...new Set(servicios.map(s => s.proveedor_id).filter(Boolean))] as number[]
        const contratos = proveedorIds.length > 0
            ? await Contrato.findAll({
                where: { persona_id: proveedorIds, estado: 'vigente', ambito: 'proveedor' },
                attributes: ['persona_id', 'comision_cliente_porcentaje'],
            })
            : []
        const comisionPorProveedor = new Map(contratos.map(c => [c.persona_id, Number(c.comision_cliente_porcentaje)]))

        // precio_base es info interna del proveedor — nunca sale hacia clientes/organizadores
        const serviciosFiltrados = servicios.map(s => {
            const j = s.toJSON() as any
            const base = Number(j.precio_base ?? j.precio) || 0
            const com = j.proveedor_id ? (comisionPorProveedor.get(j.proveedor_id) ?? 0) : 0
            j.precio = +(base * (1 + com / 100)).toFixed(2)
            delete j.precio_base
            return j
        })
        return res.json({ servicios: serviciosFiltrados });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener servicios', error: error.message });
    }
};

// GET /api/servicios/mis-servicios — tiendita del proveedor autenticado
// Devuelve precio_base (lo que cargó el proveedor) pero NUNCA precio (precio público con markup),
// para que el proveedor no pueda calcular cuánto suma la plataforma al cliente.
export const getMisServicios: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    try {
        const servicios = await ServicioAdicional.findAll({
            where: { proveedor_id },
            order: [['categoria', 'ASC'], ['nombre', 'ASC']]
        });
        const serviciosFiltrados = servicios.map(s => {
            const j = s.toJSON() as any
            // El proveedor ve su precio base; si un ítem viejo no lo tiene, se usa el precio como fallback
            if (j.precio_base == null) j.precio_base = j.precio
            delete j.precio  // el precio público (con markup) no se expone al proveedor
            return j
        })
        return res.json({ servicios: serviciosFiltrados });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener mis servicios', error: error.message });
    }
};

// GET /api/servicios/mis-reservas — reservas donde aparecen los servicios del proveedor
export const getMisReservasProveedor: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    try {
        // 1. Todos los IDs de servicios de este proveedor
        const misServicios = await ServicioAdicional.findAll({
            where: { proveedor_id },
            attributes: ['id_servicio', 'nombre']
        });
        const misIds = new Set(misServicios.map(s => s.id_servicio));

        if (misIds.size === 0) return res.json({ reservas: [] });

        // 2. Buscar en Ordenes de tipo 'organizador' — ahí van los servicios cuando se inicia el pago
        const ordenes = await Orden.findAll({
            where: { tipo: 'organizador' },
            attributes: ['reserva_id', 'items']
        });

        // reserva_id → mis servicios encontrados en la orden
        const serviciosPorReservaOrden = new Map<number, any[]>();
        for (const o of ordenes) {
            if (!o.reserva_id) continue;
            let items: any[] = [];
            try { items = JSON.parse(o.items) } catch {}
            const encontrados = items.filter(
                (item: any) => item.id_servicio && misIds.has(Number(item.id_servicio))
            );
            if (encontrados.length > 0) {
                // Merge: si ya hay de otra orden, agregar sin duplicar
                const prev = serviciosPorReservaOrden.get(o.reserva_id) || [];
                const idsYa = new Set(prev.map((s: any) => s.id_servicio));
                const nuevos = encontrados.filter((s: any) => !idsYa.has(s.id_servicio));
                serviciosPorReservaOrden.set(o.reserva_id, [...prev, ...nuevos]);
            }
        }

        // 3. Todas las reservas no canceladas para también revisar datos_evento
        const todas = await Reserva.findAll({
            include: [
                { model: Salon,   as: 'Salon',   attributes: ['nombre', 'domicilio', 'localidad'] },
                { model: Persona, as: 'Persona', attributes: ['nombre_usuario', 'nombre', 'apellido', 'email'] }
            ],
            order: [['fecha', 'ASC']]
        });

        // 4. Para cada reserva: buscar mis servicios en orden (prioritario) o en datos_evento
        const reservasFiltradas: any[] = [];
        for (const r of todas) {
            let misServiciosEnEsta: any[] = [];

            // a) Desde ordenes (más confiable: usuario llegó al pago)
            if (serviciosPorReservaOrden.has(r.id_reserva)) {
                misServiciosEnEsta = serviciosPorReservaOrden.get(r.id_reserva)!;
            }

            // b) Desde datos_evento (usuario seleccionó servicios pero quizás no pagó aún)
            if (misServiciosEnEsta.length === 0) {
                let datos: any = {};
                try { datos = r.datos_evento ? JSON.parse(r.datos_evento) : {} } catch {}
                const serviciosDE: any[] = Array.isArray(datos.servicios) ? datos.servicios : [];
                misServiciosEnEsta = serviciosDE.filter(
                    (s: any) => s.id_servicio && misIds.has(Number(s.id_servicio))
                );
            }

            if (misServiciosEnEsta.length === 0) continue;

            let datos: any = {};
            try { datos = r.datos_evento ? JSON.parse(r.datos_evento) : {} } catch {}
            reservasFiltradas.push({
                ...r.toJSON(),
                datos_evento: datos,
                mis_servicios: misServiciosEnEsta
            });
        }

        return res.json({ reservas: reservasFiltradas });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener reservas', error: error.message });
    }
};

// POST /api/servicios/mis-servicios — el proveedor crea un item en su tiendita
export const crearServicioProveedor: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    const { nombre, descripcion, marca, unidad, ideal_para_personas, precio, categoria, subcategoria, tipo_precio, tipo_item, imagen,
            capacidad_maxima, dias_anticipacion, dias_disponibles, horario_inicio, horario_fin,
            precios_tramos } = req.body;
    if (!nombre || !descripcion || !precio || !categoria) {
        return res.status(400).json({ message: 'Faltan campos requeridos' });
    }
    try {
        // El proveedor ingresa su precio base; el precio público suma la comisión del contrato
        const precioBase = Number(precio);
        const precioPublico = await calcularPrecioPublicoProveedor(precioBase, proveedor_id);
        const servicio = await ServicioAdicional.create({
            nombre,
            descripcion,
            marca: marca || null,
            unidad: unidad || null,
            ideal_para_personas: ideal_para_personas != null && ideal_para_personas !== '' ? Number(ideal_para_personas) : null,
            precio: precioPublico,
            precio_base: precioBase,
            categoria,
            subcategoria: subcategoria || null,
            tipo_precio: tipo_precio || 'fijo',
            tipo_item: tipo_item || 'producto',
            imagen: imagen || null,
            proveedor_id,
            capacidad_maxima: capacidad_maxima != null ? Number(capacidad_maxima) : null,
            dias_anticipacion: Number(dias_anticipacion) || 0,
            dias_disponibles: Array.isArray(dias_disponibles) ? JSON.stringify(dias_disponibles) : (dias_disponibles || null),
            horario_inicio: horario_inicio || null,
            horario_fin: horario_fin || null,
            precios_tramos: precios_tramos != null
                ? (typeof precios_tramos === 'string' ? precios_tramos : JSON.stringify(precios_tramos))
                : null,
        });
        return res.status(201).json({ servicio });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al crear servicio', error: error.message });
    }
};

// PUT /api/servicios/mis-servicios/:id — el proveedor edita su propio item
export const updateServicioProveedor: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    const { id } = req.params;
    try {
        const servicio = await ServicioAdicional.findByPk(id);
        if (!servicio) return res.status(404).json({ message: 'Servicio no encontrado' });
        if (servicio.proveedor_id !== proveedor_id) {
            return res.status(403).json({ message: 'No tenés permiso para editar este servicio' });
        }
        const { nombre, descripcion, marca, unidad, ideal_para_personas, precio, categoria, subcategoria, tipo_precio, tipo_item, imagen, disponible,
                capacidad_maxima, dias_anticipacion, dias_disponibles, horario_inicio, horario_fin,
                precios_tramos } = req.body;
        // Si viene precio, es el precio base del proveedor: recalcular el público con la comisión
        let precioBase = servicio.precio_base;
        let precioPublico = servicio.precio;
        if (precio != null && precio !== '') {
            precioBase = Number(precio);
            precioPublico = await calcularPrecioPublicoProveedor(precioBase, proveedor_id);
        }
        await servicio.update({
            nombre, descripcion,
            marca: marca !== undefined ? (marca || null) : servicio.marca,
            unidad: unidad !== undefined ? (unidad || null) : servicio.unidad,
            ideal_para_personas: ideal_para_personas !== undefined
                ? (ideal_para_personas != null && ideal_para_personas !== '' ? Number(ideal_para_personas) : null)
                : servicio.ideal_para_personas,
            precio: precioPublico,
            precio_base: precioBase,
            categoria, subcategoria: subcategoria || null, tipo_precio, tipo_item, imagen, disponible,
            capacidad_maxima: capacidad_maxima != null ? Number(capacidad_maxima) : null,
            dias_anticipacion: dias_anticipacion != null ? Number(dias_anticipacion) : servicio.dias_anticipacion,
            dias_disponibles: Array.isArray(dias_disponibles) ? JSON.stringify(dias_disponibles) : (dias_disponibles || null),
            horario_inicio: horario_inicio || null,
            horario_fin: horario_fin || null,
            precios_tramos: precios_tramos != null
                ? (typeof precios_tramos === 'string' ? precios_tramos : JSON.stringify(precios_tramos))
                : null,
        });
        return res.json({ servicio });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al actualizar servicio', error: error.message });
    }
};

// DELETE /api/servicios/mis-servicios/:id — el proveedor desactiva su propio item
export const deleteServicioProveedor: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    const { id } = req.params;
    try {
        const servicio = await ServicioAdicional.findByPk(id);
        if (!servicio) return res.status(404).json({ message: 'Servicio no encontrado' });
        if (servicio.proveedor_id !== proveedor_id) {
            return res.status(403).json({ message: 'No tenés permiso para eliminar este servicio' });
        }
        await servicio.update({ disponible: false });
        return res.json({ message: 'Servicio desactivado' });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al eliminar servicio', error: error.message });
    }
};

// GET /api/servicios/disponibilidad?fecha=YYYY-MM-DD&invitados=N
// Devuelve disponibilidad de cada servicio para esa fecha
export const getDisponibilidad: RequestHandler = async (req: Request, res: Response) => {
    const { fecha, invitados } = req.query as { fecha: string; invitados?: string }
    if (!fecha) return res.status(400).json({ message: 'fecha requerida' })

    try {
        const servicios = await ServicioAdicional.findAll({ where: { disponible: true } })

        // Calcular fecha mínima de hoy
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        const fechaEvento = new Date(fecha + 'T00:00:00Z')
        const diasDiferencia = Math.floor((fechaEvento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))

        // Calcular consumo actual en esa fecha sumando sobre ordenes + datos_evento
        const ordenes = await Orden.findAll({ where: { tipo: 'organizador' }, attributes: ['reserva_id', 'items'] })
        const todas = await Reserva.findAll({ where: {}, attributes: ['id_reserva', 'fecha', 'estado', 'datos_evento'] })

        // reservas de esa fecha (no canceladas)
        const reservasEnFecha = todas.filter(r => {
            if (!r.fecha) return false
            const f = String(r.fecha).slice(0, 10)
            return f === fecha && r.estado !== 'cancelada'
        })
        const idsReservasEnFecha = new Set(reservasEnFecha.map(r => r.id_reserva))

        // Consumo por servicio en esa fecha
        const consumoPorServicio = new Map<number, number>() // id_servicio → personas/unidades usadas

        // a) desde ordenes
        for (const o of ordenes) {
            if (!o.reserva_id || !idsReservasEnFecha.has(o.reserva_id)) continue
            let items: any[] = []
            try { items = JSON.parse(o.items) } catch {}
            for (const item of items) {
                if (!item.id_servicio) continue
                const id = Number(item.id_servicio)
                const cant = Number(item.cantidad) || 1
                consumoPorServicio.set(id, (consumoPorServicio.get(id) || 0) + cant)
            }
        }

        // b) desde datos_evento como fallback (solo reservas sin orden)
        const reservasConOrden = new Set(ordenes.map(o => o.reserva_id).filter(Boolean))
        for (const r of reservasEnFecha) {
            if (reservasConOrden.has(r.id_reserva)) continue
            let datos: any = {}
            try { datos = r.datos_evento ? JSON.parse(r.datos_evento) : {} } catch {}
            const srvs: any[] = Array.isArray(datos.servicios) ? datos.servicios : []
            for (const s of srvs) {
                if (!s.id_servicio) continue
                const id = Number(s.id_servicio)
                const cant = Number(s.cantidad) || 1
                consumoPorServicio.set(id, (consumoPorServicio.get(id) || 0) + cant)
            }
        }

        const numInv = Number(invitados) || 0

        const resultado = servicios.map(s => {
            // 1. Verificar anticipación
            if (s.dias_anticipacion > 0 && diasDiferencia < s.dias_anticipacion) {
                return {
                    id_servicio: s.id_servicio,
                    disponible: false,
                    motivo: `Requiere ${s.dias_anticipacion} día${s.dias_anticipacion !== 1 ? 's' : ''} de anticipación`,
                    capacidad_restante: null
                }
            }
            // 2. Verificar capacidad
            if (s.capacidad_maxima != null) {
                const usado = consumoPorServicio.get(s.id_servicio) || 0
                const nuevo = s.tipo_precio === 'por_persona' ? numInv : 1
                const restante = s.capacidad_maxima - usado
                if (usado + nuevo > s.capacidad_maxima) {
                    // Con más de 30 días de anticipación el proveedor puede prepararse — no bloquear
                    if (diasDiferencia > 30) {
                        return {
                            id_servicio: s.id_servicio,
                            disponible: true,
                            motivo: null,
                            capacidad_restante: null,
                            aviso: `Supera el límite habitual, pero reservás con más de 30 días de anticipación`
                        }
                    }
                    return {
                        id_servicio: s.id_servicio,
                        disponible: false,
                        motivo: `Sin capacidad disponible para esa fecha (${restante <= 0 ? '0' : restante} lugar${restante !== 1 ? 'es' : ''} restante)`,
                        capacidad_restante: Math.max(0, restante)
                    }
                }
                return {
                    id_servicio: s.id_servicio,
                    disponible: true,
                    motivo: null,
                    capacidad_restante: Math.max(0, restante - nuevo)
                }
            }
            return { id_servicio: s.id_servicio, disponible: true, motivo: null, capacidad_restante: null }
        })

        return res.json({ disponibilidad: resultado })
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al calcular disponibilidad', error: error.message })
    }
}

// POST /api/servicios — admin crea un servicio global (sin proveedor_id)
export const crearServicio: RequestHandler = async (req: Request, res: Response) => {
    const { nombre, descripcion, precio, categoria, tipo_precio, imagen } = req.body;
    if (!nombre || !descripcion || !precio || !categoria) {
        return res.status(400).json({ message: 'Faltan campos requeridos' });
    }
    try {
        const servicio = await ServicioAdicional.create({
            nombre, descripcion, precio, categoria,
            tipo_precio: tipo_precio || 'fijo',
            imagen,
            proveedor_id: null
        });
        return res.status(201).json({ servicio });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al crear servicio', error: error.message });
    }
};

// PUT /api/servicios/:id — admin actualiza cualquier servicio
export const updateServicio: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const servicio = await ServicioAdicional.findByPk(id);
        if (!servicio) return res.status(404).json({ message: 'Servicio no encontrado' });
        await servicio.update(req.body);
        return res.json({ servicio });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al actualizar servicio', error: error.message });
    }
};

// DELETE /api/servicios/:id — admin desactiva cualquier servicio
export const deleteServicio: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const servicio = await ServicioAdicional.findByPk(id);
        if (!servicio) return res.status(404).json({ message: 'Servicio no encontrado' });
        await servicio.update({ disponible: false });
        return res.json({ message: 'Servicio desactivado' });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al eliminar servicio', error: error.message });
    }
};

// ─── Agenda del proveedor ──────────────────────────────────────────────────────

// GET /api/servicios/mi-agenda — entradas manuales y confirmaciones del proveedor
export const getMiAgenda: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    try {
        const agenda = await AgendaProveedor.findAll({
            where: { proveedor_id },
            order: [['fecha', 'ASC']]
        });
        return res.json({ agenda });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener agenda', error: error.message });
    }
};

// POST /api/servicios/mi-agenda — el proveedor crea un bloqueo manual
export const crearBloqueoManual: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    const { fecha, nombre_cliente, descripcion, estado, bloquear_fecha,
            detalle_pedido, monto_total, estado_pago, fecha_limite, domicilio } = req.body;
    if (!fecha) return res.status(400).json({ message: 'La fecha es requerida' });
    const esBloqueo = bloquear_fecha === true || bloquear_fecha === 'true';
    try {
        const campos = {
            nombre_cliente:  nombre_cliente  || null,
            descripcion:     descripcion     || null,
            estado:          estado          || 'confirmada',
            manual:          esBloqueo,
            detalle_pedido:  detalle_pedido  != null ? (typeof detalle_pedido === 'string' ? detalle_pedido : JSON.stringify(detalle_pedido)) : null,
            monto_total:     monto_total     != null ? Number(monto_total) : null,
            estado_pago:     estado_pago     || 'sin_pago',
            fecha_limite:    fecha_limite    || null,
            domicilio:       domicilio       != null ? (typeof domicilio === 'string' ? domicilio : JSON.stringify(domicilio)) : null,
        };
        const existente = await AgendaProveedor.findOne({ where: { proveedor_id, fecha } });
        if (existente) {
            await existente.update(campos);
            return res.json({ agenda: existente });
        }
        const agenda = await AgendaProveedor.create({
            proveedor_id: proveedor_id!,
            fecha,
            reserva_id: null,
            ...campos
        });
        return res.status(201).json({ agenda });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al crear bloqueo', error: error.message });
    }
};

// PUT /api/servicios/mi-agenda/confirmar/:reserva_id — proveedor confirma su participación
export const confirmarReservaProveedor: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    const reserva_id = Number(req.params.reserva_id);
    const { estado, motivo_cancelacion } = req.body;
    try {
        const reserva = await Reserva.findByPk(reserva_id);
        if (!reserva) return res.status(404).json({ message: 'Reserva no encontrada' });

        const participaEnReserva = await reservaIncluyeServicioDeProveedor(reserva, proveedor_id);
        if (!participaEnReserva) {
            return res.status(403).json({ message: 'No tenés permiso para gestionar esta reserva' });
        }

        const [entrada] = await AgendaProveedor.findOrCreate({
            where: { proveedor_id, reserva_id },
            defaults: {
                proveedor_id: proveedor_id!,
                fecha: reserva.fecha as any,
                estado: 'pendiente',
                manual: false,
                reserva_id
            }
        });
        const updateData: any = { estado: estado || 'confirmada' };
        if (estado === 'cancelada') updateData.motivo_cancelacion = motivo_cancelacion || null;
        await entrada.update(updateData);
        return res.json({ agenda: entrada });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al confirmar reserva', error: error.message });
    }
};

// PUT /api/servicios/mi-agenda/:id — actualiza una reserva externa manual
export const updateBloqueoManual: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    const { id } = req.params;
    const { nombre_cliente, descripcion, estado, bloquear_fecha,
            detalle_pedido, monto_total, estado_pago, fecha_limite, domicilio } = req.body;
    try {
        const entrada = await AgendaProveedor.findOne({ where: { id_agenda: id, proveedor_id } });
        if (!entrada) return res.status(404).json({ message: 'Entrada no encontrada' });
        const esBloqueo = bloquear_fecha === true || bloquear_fecha === 'true';
        await entrada.update({
            nombre_cliente:  nombre_cliente  || null,
            descripcion:     descripcion     || null,
            estado:          estado          || 'confirmada',
            manual:          esBloqueo,
            detalle_pedido:  detalle_pedido  != null ? (typeof detalle_pedido === 'string' ? detalle_pedido : JSON.stringify(detalle_pedido)) : null,
            monto_total:     monto_total     != null ? Number(monto_total) : null,
            estado_pago:     estado_pago     || 'sin_pago',
            fecha_limite:    fecha_limite    || null,
            domicilio:       domicilio       != null ? (typeof domicilio === 'string' ? domicilio : JSON.stringify(domicilio)) : null,
        });
        return res.json({ agenda: entrada });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al actualizar bloqueo', error: error.message });
    }
};

// DELETE /api/servicios/mi-agenda/:id — elimina un bloqueo manual
export const eliminarBloqueo: RequestHandler = async (req: Request, res: Response) => {
    const proveedor_id = req.persona?.id_persona;
    const { id } = req.params;
    try {
        const entrada = await AgendaProveedor.findOne({ where: { id_agenda: id, proveedor_id } });
        if (!entrada) return res.status(404).json({ message: 'Entrada no encontrada' });
        if (!entrada.manual) return res.status(400).json({ message: 'Solo se pueden eliminar bloqueos manuales' });
        await entrada.destroy();
        return res.json({ message: 'Bloqueo eliminado' });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al eliminar bloqueo', error: error.message });
    }
};
