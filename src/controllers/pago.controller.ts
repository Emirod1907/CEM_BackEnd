import { Request, Response, RequestHandler } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import Orden from '../models/orden';
import Reserva from '../models/reserva';
import { upsertEventoReserva } from '../services/googleCalendarSync';
import Evento from '../models/evento';
import Salon from '../models/salon';
import Contrato from '../models/contrato';
import ConfiguracionComision from '../models/configuracionComision';
import OrdenDesglose from '../models/ordenDesglose';
import MovimientoPozo from '../models/movimientoPozo';
import { logger } from '../libs/logger';
import db from '../db/connection';
import { getMpCredentials, getMpNotificationUrl, getMpBackUrls } from '../config/mercadopago';
import { emitirEntradaPagada } from './invitacion.controller';
import { montoAlquilerVigente } from './reserva.controller';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const getMpClient = () => {
    const { accessToken } = getMpCredentials();
    return new MercadoPagoConfig({ accessToken });
};

export interface ItemCarrito {
    id_evento: number;
    nombre: string;
    descripcion: string;
    precio: number;
    cantidad: number;
    imagen?: string;
}

export interface ItemServicio {
    id_servicio: number;
    nombre: string;
    descripcion: string;
    precio: number;
    cantidad: number;
    categoria?: string;
    tipo_precio?: 'fijo' | 'por_persona' | 'por_hora' | 'por_turno';
    horas?: number | null;
    turnos?: number | null;
    personas?: number | null;
    imagen?: string | null;
}

// POST /api/pagos/crear-preferencia  (carrito cliente)
export const crearPreferencia: RequestHandler = async (req: Request, res: Response) => {
    const { items }: { items: ItemCarrito[] } = req.body;
    const persona = (req as any).persona;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'El carrito está vacío' });
    }

    try {
        // Verificar precios desde la DB — no confiar en los que manda el cliente
        const eventosDB = await Evento.findAll({
            where: {
                id_evento: items.map((i) => i.id_evento),
                estado: 'activo'
            },
            attributes: ['id_evento', 'nombre', 'descripcion', 'precio', 'imagen']
        });

        if (eventosDB.length !== items.length) {
            return res.status(400).json({ message: 'Uno o más eventos no están disponibles' });
        }

        const preciosDB = new Map(eventosDB.map((e) => [e.id_evento, e]));

        const client = getMpClient();
        const preference = new Preference(client);

        const mpItems = items.map((item) => {
            const evento = preciosDB.get(item.id_evento)!;
            return {
                id: String(item.id_evento),
                title: evento.nombre,
                description: evento.descripcion || evento.nombre,
                quantity: item.cantidad,
                unit_price: Number(evento.precio),
                currency_id: 'ARS',
                picture_url: evento.imagen || undefined,
            };
        });

        const montoTotal = items.reduce(
            (acc, item) => acc + Number(preciosDB.get(item.id_evento)!.precio) * item.cantidad,
            0
        );

        // Guardar los items con precios verificados desde la DB (no los del
        // cliente) — el pozo común del evento se alimenta de estos montos.
        const itemsVerificados = items.map((item) => {
            const evento = preciosDB.get(item.id_evento)!;
            return {
                id_evento: item.id_evento,
                nombre: evento.nombre,
                precio: Number(evento.precio),
                cantidad: item.cantidad,
                subtotal: +(Number(evento.precio) * item.cantidad).toFixed(2),
                imagen: evento.imagen || null,
            };
        });

        // Crear la orden primero para obtener el id_orden que usamos como external_reference.
        // Esto permite al webhook encontrar la orden incluso si MP no devuelve preference_id.
        const orden = await Orden.create({
            persona_id: persona.id_persona,
            items: JSON.stringify(itemsVerificados),
            monto_total: montoTotal,
            estado: 'pendiente',
            tipo: 'cliente'
        });

        let preferenceData: any;
        try {
            preferenceData = await preference.create({
                body: {
                    items: mpItems,
                    back_urls: getMpBackUrls(),
                    auto_return: 'approved' as const,
                    external_reference: String(orden.id_orden),
                    ...(getMpNotificationUrl() ? { notification_url: getMpNotificationUrl() } : {}),
                    metadata: { persona_id: persona.id_persona },
                },
            });
        } catch (mpError: any) {
            // MP falló — eliminar la orden huérfana para no dejar basura en la DB
            await orden.destroy();
            throw mpError;
        }

        await orden.update({ mp_preference_id: preferenceData.id });

        return res.status(201).json({
            preference_id: preferenceData.id,
            init_point: preferenceData.init_point,
            sandbox_init_point: preferenceData.sandbox_init_point,
            orden_id: orden.id_orden,
        });
    } catch (error: any) {
        logger.error('[Pago] Error al crear preferencia', { error: error.message });
        return res.status(500).json({ message: 'Error al procesar el pago', error: error.message });
    }
};

// POST /api/pagos/crear-preferencia-organizador  (carrito organizador)
export const crearPreferenciaOrganizador: RequestHandler = async (req: Request, res: Response) => {
    const { reserva_id, tipo_pago, servicios, precio_entrada }: {
        reserva_id: number;
        tipo_pago: 'seña' | 'total';
        servicios: ItemServicio[];
        precio_entrada?: number;
    } = req.body;
    const persona = (req as any).persona;

    if (!reserva_id || !tipo_pago) {
        return res.status(400).json({ message: 'reserva_id y tipo_pago son requeridos' });
    }

    try {
        const reserva = await Reserva.findOne({
            where: { id_reserva: reserva_id, persona_id: persona.id_persona }
        });
        if (!reserva) {
            return res.status(404).json({ message: 'Reserva no encontrada' });
        }
        if (reserva.estado !== 'pendiente_pago') {
            return res.status(400).json({ message: 'La reserva ya fue procesada o cancelada' });
        }

        // Persistir precio de entrada y servicios seleccionados en datos_evento
        try {
            const datosActuales = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {}
            if (precio_entrada !== undefined && precio_entrada !== null) {
                datosActuales.precio = Number(precio_entrada)
            }
            // Guardar servicios para poder mostrarlos en el detalle aunque el pago no se complete
            if (servicios && servicios.length > 0) {
                datosActuales.servicios = servicios
            }
            await reserva.update({ datos_evento: JSON.stringify(datosActuales) })
        } catch (e) {
            logger.warn('[Pago] No se pudo actualizar datos_evento', { error: String(e) })
        }

        // Recalcular el alquiler según la config vigente del salón (feriado/finde/%/tramos)
        // para que el cobro coincida con lo mostrado en el detalle de la reserva
        const salonReserva = await Salon.findByPk(reserva.salon_id, { attributes: ['precio_alquiler', 'precios_config'] });
        const monto_alquiler = await montoAlquilerVigente(reserva, salonReserva);
        const datosReserva = reserva.datos_evento ? JSON.parse(reserva.datos_evento) : {};
        const numInvitados = Number(datosReserva.numInvitados) > 0 ? Number(datosReserva.numInvitados) : (Number(datosReserva.cupo) || 1);
        const monto_servicios = (servicios || []).reduce((acc, s) => {
            let multiplicador = 1;
            if      (s.tipo_precio === 'por_persona') multiplicador = Number(s.personas) > 0 ? Number(s.personas) : numInvitados;
            else if (s.tipo_precio === 'por_hora')    multiplicador = Number(s.horas)  > 0 ? Number(s.horas)  : 1;
            else if (s.tipo_precio === 'por_turno')   multiplicador = Number(s.turnos) > 0 ? Number(s.turnos) : 1;
            return acc + Number(s.precio) * s.cantidad * multiplicador;
        }, 0);
        const monto_total = monto_alquiler + monto_servicios;

        // Comisión del cliente: frozen desde el contrato vigente del dueño del salón
        let comisionClientePct = 0
        try {
            const salonData = await Salon.findByPk(reserva.salon_id, { attributes: ['dueno_id'] })
            if ((salonData as any)?.dueno_id) {
                const contrato = await Contrato.findOne({
                    where: { persona_id: (salonData as any).dueno_id, estado: 'vigente', ambito: 'salon' },
                    attributes: ['comision_cliente_porcentaje'],
                })
                if (contrato) comisionClientePct = Number(contrato.comision_cliente_porcentaje)
            }
        } catch (e) {
            logger.warn('[Pago] No se pudo resolver comisión de cliente', { error: String(e) })
        }
        const factorComision = 1 + comisionClientePct / 100

        const client = getMpClient();
        const preference = new Preference(client);

        let mpItems: any[];
        let montoAPagar: number;

        if (tipo_pago === 'seña') {
            montoAPagar = +(monto_total * 0.30 * factorComision).toFixed(2);
            mpItems = [{
                id: `sena-reserva-${reserva_id}`,
                title: `Seña de Reserva (30%)`,
                description: `Seña del 30% para reserva de salón + servicios`,
                quantity: 1,
                unit_price: montoAPagar,
                currency_id: 'ARS'
            }];
        } else {
            montoAPagar = +(monto_total * factorComision).toFixed(2);
            // Los unit_price de los items ya incluyen el factor de comisión
            // para que el total de items coincida con montoAPagar
            mpItems = [
                ...(monto_alquiler > 0 ? [{
                    id: `alquiler-salon-${reserva.salon_id}`,
                    title: 'Alquiler de salón',
                    description: 'Arrendamiento del salón para el evento',
                    quantity: 1,
                    unit_price: +(monto_alquiler * factorComision).toFixed(2),
                    currency_id: 'ARS'
                }] : []),
                ...(servicios || []).map((s) => {
                    let multiplicador = 1;
                    if      (s.tipo_precio === 'por_persona') multiplicador = Number(s.personas) > 0 ? Number(s.personas) : numInvitados;
                    else if (s.tipo_precio === 'por_hora')    multiplicador = Number(s.horas)  > 0 ? Number(s.horas)  : 1;
                    else if (s.tipo_precio === 'por_turno')   multiplicador = Number(s.turnos) > 0 ? Number(s.turnos) : 1;
                    return {
                        id: String(s.id_servicio),
                        title: s.nombre,
                        description: s.descripcion || s.nombre,
                        quantity: s.cantidad * multiplicador,
                        unit_price: +(Number(s.precio) * factorComision).toFixed(2),
                        currency_id: 'ARS'
                    };
                })
            ];
            // Si no hay items (alquiler=0 y sin servicios), usar un item genérico
            if (mpItems.length === 0) {
                montoAPagar = 1;
                mpItems = [{
                    id: `reserva-${reserva_id}`,
                    title: 'Reserva de salón',
                    description: 'Reserva de salón para evento',
                    quantity: 1,
                    unit_price: 1,
                    currency_id: 'ARS'
                }];
            }
        }

        const todosLosItems = [
            { tipo: 'alquiler', nombre: 'Alquiler de salón', precio: monto_alquiler, cantidad: 1 },
            ...(servicios || [])
        ];

        // Crear la orden primero para obtener el id_orden como external_reference
        const orden = await Orden.create({
            persona_id: persona.id_persona,
            items: JSON.stringify(todosLosItems),
            monto_total: montoAPagar,
            estado: 'pendiente',
            tipo: 'organizador',
            reserva_id,
            tipo_pago
        });

        let preferenceData: any;
        try {
            preferenceData = await preference.create({
                body: {
                    items: mpItems,
                    back_urls: getMpBackUrls(),
                    auto_return: 'approved' as const,
                    external_reference: String(orden.id_orden),
                    ...(getMpNotificationUrl() ? { notification_url: getMpNotificationUrl() } : {}),
                    metadata: {
                        persona_id: persona.id_persona,
                        tipo: 'organizador',
                        reserva_id,
                        tipo_pago
                    }
                }
            });
        } catch (mpError: any) {
            await orden.destroy();
            throw mpError;
        }

        await orden.update({ mp_preference_id: preferenceData.id });

        return res.status(201).json({
            preference_id: preferenceData.id,
            init_point: preferenceData.init_point,
            sandbox_init_point: preferenceData.sandbox_init_point,
            orden_id: orden.id_orden,
            monto_total,
            monto_a_pagar: montoAPagar
        });
    } catch (error: any) {
        logger.error('[Pago Organizador] Error al crear preferencia', { error: error.message });
        return res.status(500).json({ message: 'Error al procesar el pago', error: error.message });
    }
};

// Aplica un pago de MP sobre su orden: actualiza estado y dispara los efectos
// (crear evento, desglose de comisión). Compartido entre el webhook, la
// confirmación al volver del checkout y el job de verificación. Idempotente.
export async function procesarPagoMP(paymentData: any): Promise<Orden | null> {
    const paymentId = String(paymentData.id);
    const estado =
        paymentData.status === 'approved'
            ? 'aprobado'
            : paymentData.status === 'rejected'
            ? 'rechazado'
            : 'pendiente';

    const preferenceId = (paymentData as any).preference_id as string | undefined;
    const externalReference = (paymentData as any).external_reference as string | undefined;

    let ordenProcesada: Orden | null = null;
    let reservaSyncId: number | null = null;

    await db.transaction(async (t) => {
        // --- Buscar la orden: preference_id primero, external_reference como fallback ---
        let orden: Orden | null = null;

        if (preferenceId) {
            orden = await Orden.findOne({
                where: { mp_preference_id: preferenceId },
                lock: t.LOCK.UPDATE,
                transaction: t
            });
        }

        if (!orden && externalReference) {
            orden = await Orden.findOne({
                where: { id_orden: externalReference },
                lock: t.LOCK.UPDATE,
                transaction: t
            });
        }

        if (!orden) {
            // No hay forma de asociar este pago — log crítico; el caller decide la respuesta.
            logger.error('[Pago] CRÍTICO: No se encontró orden para el pago recibido', {
                payment_id: paymentId,
                preference_id: preferenceId ?? null,
                external_reference: externalReference ?? null,
                status: paymentData.status
            });
            return; // la transacción confirma sin cambios
        }

        ordenProcesada = orden;

        // --- Idempotencia: si ya está en estado final, no hacer nada ---
        if (orden.estado === 'aprobado' || orden.estado === 'rechazado') {
            logger.info('[Pago] Orden ya procesada, ignorando reintento', {
                id_orden: orden.id_orden,
                estado: orden.estado,
                payment_id: paymentId
            });
            return;
        }

        // --- Idempotencia: mismo payment_id ya registrado ---
        if (orden.mp_payment_id && orden.mp_payment_id === paymentId) {
            logger.info('[Pago] payment_id ya registrado, ignorando duplicado', {
                id_orden: orden.id_orden,
                payment_id: paymentId
            });
            return;
        }

        // --- Actualizar la orden dentro de la transacción ---
        await orden.update({ estado, mp_payment_id: paymentId }, { transaction: t });

        // --- Si es orden de organizador aprobada, crear el evento y el desglose ---
        if (orden.tipo === 'organizador' && estado === 'aprobado' && orden.reserva_id) {
            await crearEventoDesdeReserva(orden.reserva_id, orden.tipo_pago || 'seña', t);
            await crearDesgloseComision(orden, t);
            reservaSyncId = orden.reserva_id;
        }

        // --- Si es pago de entradas aprobado, registrar el ingreso en el pozo ---
        if (orden.tipo === 'cliente' && estado === 'aprobado') {
            await registrarIngresosPozo(orden, t);
        }
    });

    // Vía A: agendar la reserva en el Google Calendar del dueño (post-commit, best-effort)
    if (reservaSyncId) {
        Reserva.findByPk(reservaSyncId).then(r => { if (r) return upsertEventoReserva(r); }).catch(() => {});
    }

    // --- Pago de invitación aprobado: emitir entrada con QR ---
    // Fuera de la transacción (incluye envío de email). Idempotente.
    const metadata = (paymentData as any).metadata;
    if (ordenProcesada && estado === 'aprobado' && metadata?.tipo === 'invitacion' && metadata?.invitacion_token) {
        try {
            await emitirEntradaPagada(String(metadata.invitacion_token));
        } catch (err) {
            logger.error('[Pago] Error al emitir entrada de invitación', { error: String(err) });
        }
    }

    return ordenProcesada;
}

// GET /api/pagos/retorno/:tipo — puente HTTPS para las back_urls de MP.
// MP exige https para mostrar "Volver al sitio" y el contador de auto_return;
// este endpoint corre en el listener https local (puerto 8443) y reenvía al
// frontend (http) conservando los query params que agrega MP (payment_id, etc).
export const retornoPago: RequestHandler = (req: Request, res: Response) => {
    const { tipo } = req.params;
    const destino = ['exito', 'fallo', 'pendiente'].includes(tipo) ? tipo : 'pendiente';
    const qs = req.originalUrl.split('?')[1] || '';
    return res.redirect(`${FRONTEND_URL}/pago/${destino}${qs ? `?${qs}` : ''}`);
};

// POST /api/pagos/webhook
export const webhook: RequestHandler = async (req: Request, res: Response) => {
    const { type, data } = req.body;

    if (type !== 'payment') {
        return res.sendStatus(200);
    }

    try {
        const client = getMpClient();
        const payment = new Payment(client);
        const paymentData = await payment.get({ id: data.id });

        // Si no se encontró orden respondemos 200 igual para que MP no reintente eternamente
        await procesarPagoMP(paymentData);

        return res.sendStatus(200);
    } catch (error) {
        logger.error('[Pago] Error en webhook', { error: String(error) });
        // Devolver 500 para que MP reintente si fue un error transitorio
        return res.sendStatus(500);
    }
};

// POST /api/pagos/confirmar  — confirma un pago al volver del checkout de MP.
// Respaldo del webhook para entornos sin URL pública (localhost): consulta el
// estado real del pago en MP y aplica los mismos efectos que el webhook.
export const confirmarPago: RequestHandler = async (req: Request, res: Response) => {
    const { payment_id } = req.body;
    const persona = (req as any).persona;

    if (!payment_id) {
        return res.status(400).json({ message: 'payment_id es requerido' });
    }

    try {
        const client = getMpClient();
        const payment = new Payment(client);
        const paymentData = await payment.get({ id: payment_id });

        const orden = await procesarPagoMP(paymentData);

        if (!orden) {
            return res.status(404).json({ message: 'No se encontró una orden asociada a este pago' });
        }
        if (orden.persona_id !== persona.id_persona) {
            return res.status(403).json({ message: 'La orden no pertenece a tu cuenta' });
        }

        return res.json({
            orden_id: orden.id_orden,
            estado: orden.estado,
            mp_payment_id: orden.mp_payment_id
        });
    } catch (error: any) {
        logger.error('[Pago] Error al confirmar pago', { error: error.message });
        return res.status(500).json({ message: 'Error al confirmar el pago', error: error.message });
    }
};

// Registra en el pozo común del evento los ingresos por entradas de una orden
// aprobada. Idempotente: si la orden ya tiene movimientos, no duplica.
async function registrarIngresosPozo(
    orden: Orden,
    t: import('sequelize').Transaction
) {
    try {
        const existente = await MovimientoPozo.findOne({
            where: { orden_id: orden.id_orden },
            transaction: t
        });
        if (existente) return;

        let items: any[] = [];
        try { items = JSON.parse(orden.items); } catch { return; }

        for (const item of items) {
            if (!item?.id_evento) continue;
            const cantidad = Number(item.cantidad) || 1;
            const monto = Number(item.subtotal) || +(Number(item.precio) * cantidad).toFixed(2);
            if (!(monto > 0)) continue;
            await MovimientoPozo.create({
                evento_id: item.id_evento,
                tipo: 'ingreso_entrada',
                monto,
                descripcion: `${item.nombre || 'Entrada'} × ${cantidad}`,
                orden_id: orden.id_orden,
                persona_id: orden.persona_id,
            }, { transaction: t });
        }
        logger.info('[Pozo] Ingreso registrado', { orden_id: orden.id_orden });
    } catch (err) {
        logger.error('[Pozo] Error registrando ingreso', { orden_id: orden.id_orden, error: String(err) });
    }
}

async function crearEventoDesdeReserva(
    reserva_id: number,
    tipo_pago: string,
    t: import('sequelize').Transaction
) {
    // findByPk con lock dentro de la transacción — evita race condition
    const reserva = await Reserva.findByPk(reserva_id, {
        lock: t.LOCK.UPDATE,
        transaction: t
    });

    if (!reserva || !reserva.datos_evento) return;

    const datos = JSON.parse(reserva.datos_evento);
    const esPrivado = datos.es_publico === false;
    // El evento pasa a "activo" cuando la reserva queda confirmada por el organizador:
    // - Privado: alcanza con la seña — no hay cartelera pública de por medio, la reserva
    //   ya está tomada y el organizador necesita gestionar invitaciones sobre un evento real.
    // - Público: recién con el pago total, para no listarlo en la cartelera antes de
    //   estar plenamente confirmado.
    const estadoEvento = (tipo_pago === 'total' || esPrivado) ? 'activo' : 'borrador';
    const estadoReserva = tipo_pago === 'total' ? 'confirmada' : 'seña_abonada';

    // Evento privado: ya fue creado como borrador al hacer la reserva — actualizar estado
    // y re-afirmar la visibilidad desde datos_evento (el borrador podría no tenerla seteada)
    if (reserva.evento_id) {
        await Evento.update(
            { estado: estadoEvento, es_publico: datos.es_publico !== false },
            { where: { id_evento: reserva.evento_id }, transaction: t }
        );
        await reserva.update({ estado: estadoReserva }, { transaction: t });
        logger.info('[Webhook] Evento borrador activado', { evento_id: reserva.evento_id, estado: estadoEvento });
        return;
    }

    const nuevoEvento = await Evento.create({
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        fecha: datos.fecha,
        precio: datos.precio,
        cupo: datos.cupo,
        imagen: datos.imagen || '',
        salon_id: reserva.salon_id,
        creado_por: reserva.persona_id,
        estado: estadoEvento,
        es_publico: datos.es_publico !== false,
    }, { transaction: t });

    await reserva.update({
        evento_id: nuevoEvento.id_evento,
        estado: estadoReserva
    }, { transaction: t });

    logger.info('[Webhook] Evento creado', { id_evento: nuevoEvento.id_evento, estado: estadoEvento });
}

async function crearDesgloseComision(
    orden: Orden,
    t: import('sequelize').Transaction
) {
    try {
        const reserva = await Reserva.findByPk(orden.reserva_id!, { transaction: t })
        if (!reserva) return

        // comision_cliente_porcentaje: frozen del contrato del dueño del salón
        let comisionClientePct = 0
        const salonData = await Salon.findByPk(reserva.salon_id, { attributes: ['dueno_id'], transaction: t })
        if ((salonData as any)?.dueno_id) {
            const contrato = await Contrato.findOne({
                where: { persona_id: (salonData as any).dueno_id, estado: 'vigente' },
                attributes: ['comision_cliente_porcentaje'],
                transaction: t,
            })
            if (contrato) comisionClientePct = Number(contrato.comision_cliente_porcentaje)
        }

        // comision_proveedor_porcentaje: live desde ConfiguracionComision al momento del pago
        let comisionProveedorPct = 3
        const configComision = await ConfiguracionComision.findOne({
            where: { tipo_perfil: 'salon', activo: true },
            attributes: ['comision_proveedor_porcentaje'],
            transaction: t,
        })
        if (configComision) comisionProveedorPct = Number(configComision.comision_proveedor_porcentaje)

        const monto_bruto             = Number(orden.monto_total)
        const monto_comision_cliente  = +(monto_bruto * comisionClientePct  / 100).toFixed(2)
        const monto_comision_proveedor = +(monto_bruto * comisionProveedorPct / 100).toFixed(2)
        const monto_neto_proveedor    = +(monto_bruto - monto_comision_proveedor).toFixed(2)

        await OrdenDesglose.findOrCreate({
            where:    { orden_id: orden.id_orden },
            defaults: {
                orden_id: orden.id_orden,
                reserva_id: orden.reserva_id,
                monto_bruto,
                comision_cliente_porcentaje:  comisionClientePct,
                monto_comision_cliente,
                comision_proveedor_porcentaje: comisionProveedorPct,
                monto_comision_proveedor,
                monto_neto_proveedor,
                estado_liquidacion: 'pendiente',
            },
            transaction: t,
        })
    } catch (err) {
        logger.error('[Webhook] Error al crear desglose de comisión', { err: String(err) })
    }
}

// POST /api/pagos/simular-aprobado  (SOLO sandbox — simula webhook de pago aprobado)
export const simularPagoAprobado: RequestHandler = async (req: Request, res: Response) => {
    const { accessToken } = getMpCredentials()
    if (!accessToken.startsWith('TEST-') && process.env.MP_ENV !== 'sandbox') {
        return res.status(403).json({ message: 'Solo disponible en modo sandbox' })
    }

    const { orden_id } = req.body
    if (!orden_id) return res.status(400).json({ message: 'orden_id es requerido' })

    try {
        let reservaSyncId: number | null = null
        await db.transaction(async (t) => {
            const orden = await Orden.findOne({
                where: { id_orden: orden_id },
                lock: t.LOCK.UPDATE,
                transaction: t
            })
            if (!orden) throw new Error('Orden no encontrada')
            if (orden.estado === 'aprobado') throw new Error('La orden ya fue aprobada')

            const fakePaymentId = `SIMULATED-${Date.now()}`
            await orden.update({ estado: 'aprobado', mp_payment_id: fakePaymentId }, { transaction: t })

            if (orden.tipo === 'organizador' && orden.reserva_id) {
                await crearEventoDesdeReserva(orden.reserva_id, orden.tipo_pago || 'seña', t)
                await crearDesgloseComision(orden, t)
                reservaSyncId = orden.reserva_id
            }
        })

        // Vía A: agendar en el Google Calendar del dueño (post-commit, best-effort)
        if (reservaSyncId) {
            Reserva.findByPk(reservaSyncId).then(r => { if (r) return upsertEventoReserva(r); }).catch(() => {});
        }

        return res.json({ message: 'Pago simulado como aprobado correctamente', orden_id })
    } catch (error: any) {
        logger.error('[SimularPago] Error', { error: error.message })
        return res.status(500).json({ message: error.message })
    }
}

// GET /api/pagos/orden/:id/verificar — busca en MP el pago de la orden y lo aplica.
// Usado por la pantalla de espera cuando el checkout se abre en otra pestaña
// (en localhost MP no muestra el botón de volver ni redirige a las back_urls).
export const verificarOrden: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona = (req as any).persona;

    try {
        const orden = await Orden.findOne({
            where: { id_orden: id, persona_id: persona.id_persona }
        });
        if (!orden) {
            return res.status(404).json({ message: 'Orden no encontrada' });
        }

        if (orden.estado === 'pendiente') {
            const client = getMpClient();
            const payment = new Payment(client);
            const busqueda = await payment.search({
                options: {
                    external_reference: String(orden.id_orden),
                    sort: 'date_created',
                    criteria: 'desc'
                }
            });
            const pagos: any[] = busqueda.results || [];
            // Priorizar un pago aprobado; si no hay, tomar el más reciente
            const pago = pagos.find((p) => p.status === 'approved') || pagos[0];
            if (pago) {
                await procesarPagoMP(pago);
                await orden.reload();
            }
        }

        return res.json({
            orden_id: orden.id_orden,
            estado: orden.estado,
            mp_payment_id: orden.mp_payment_id
        });
    } catch (error: any) {
        logger.error('[Pago] Error al verificar orden', { error: error.message });
        return res.status(500).json({ message: 'Error al verificar la orden', error: error.message });
    }
};

// GET /api/pagos/mis-ordenes
export const getMisOrdenes: RequestHandler = async (req: Request, res: Response) => {
    const persona = (req as any).persona;

    try {
        const ordenes = await Orden.findAll({
            where: { persona_id: persona.id_persona },
            order: [['fecha_creacion', 'DESC']],
        });

        const ordenesParseadas = ordenes.map((o) => {
            let items: any[] = [];
            try { items = JSON.parse(o.items); } catch {}
            return { ...o.toJSON(), items };
        });

        return res.json({ ordenes: ordenesParseadas });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener órdenes', error: error.message });
    }
};

// GET /api/pagos/orden/:id
export const getOrden: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    const persona = (req as any).persona;

    try {
        const orden = await Orden.findOne({
            where: { id_orden: id, persona_id: persona.id_persona },
        });

        if (!orden) {
            return res.status(404).json({ message: 'Orden no encontrada' });
        }

        let items: any[] = [];
        try { items = JSON.parse(orden.items); } catch {}
        return res.json({ ...orden.toJSON(), items });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error al obtener la orden', error: error.message });
    }
};
