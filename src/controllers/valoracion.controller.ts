import { RequestHandler } from 'express';
import Valoracion from '../models/valoracion';
import Reserva from '../models/reserva';
import Salon from '../models/salon';
import ServicioAdicional from '../models/servicioAdicional';
import { crearValoracionesSchema } from '../schemas/valoracion.schema';
import { logger } from '../libs/logger';

// ── Cache en memoria para recomendados ────────────────────────────────────────
let cachedRecomendados: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

const invalidarCache = () => { cachedRecomendados = null; };

// ── POST /api/valoraciones ────────────────────────────────────────────────────
export const crearValoraciones: RequestHandler = async (req: any, res, next) => {
    try {
        const parsed = crearValoracionesSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Datos inválidos', errors: parsed.error.flatten() });
            return;
        }

        const { reserva_id, valoraciones } = parsed.data;
        const persona_id = req.persona?.id_persona;
        if (!persona_id) { res.status(401).json({ message: 'No autenticado' }); return; }

        // Verificar que la reserva pertenece al usuario
        const reserva = await Reserva.findByPk(reserva_id);
        if (!reserva) { res.status(404).json({ message: 'Reserva no encontrada' }); return; }
        if (reserva.persona_id !== persona_id) { res.status(403).json({ message: 'No autorizado' }); return; }

        // Verificar que la fecha del evento ya pasó
        const fechaEvento = new Date(reserva.fecha);
        if (fechaEvento >= new Date()) {
            res.status(400).json({ message: 'Solo podés valorar un evento que ya se celebró' });
            return;
        }

        const rows = valoraciones.map(v => ({
            reserva_id,
            persona_id,
            tipo: v.tipo,
            entidad_id: v.entidad_id ?? null,
            estrellas: v.estrellas,
            comentario: v.comentario ?? null,
        }));

        const resultado = await Valoracion.bulkCreate(rows, { ignoreDuplicates: true });
        invalidarCache();

        res.json({ ok: true, insertadas: resultado.length });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/valoraciones/reserva/:id ─────────────────────────────────────────
export const getValoracionesReserva: RequestHandler = async (req: any, res, next) => {
    try {
        const persona_id = req.persona?.id_persona;
        const { id } = req.params;

        const reserva = await Reserva.findByPk(id);
        if (!reserva) { res.status(404).json({ message: 'Reserva no encontrada' }); return; }
        if (reserva.persona_id !== persona_id) { res.status(403).json({ message: 'No autorizado' }); return; }

        const valoraciones = await Valoracion.findAll({ where: { reserva_id: id } });
        res.json({ valoraciones });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/valoraciones/salon/:salon_id ────────────────────────────────────
export const getValoracionesSalon: RequestHandler = async (req, res, next) => {
    try {
        const { salon_id } = req.params;
        const vals = await Valoracion.findAll({
            where: { tipo: 'salon', entidad_id: salon_id },
        });

        const total = vals.length;
        const promedio = total > 0
            ? vals.reduce((acc, v) => acc + v.estrellas, 0) / total
            : null;

        res.json({ salon_id: Number(salon_id), total, promedio });
    } catch (err) {
        next(err);
    }
};

// ── GET /api/valoraciones/recomendados ───────────────────────────────────────
export const getRecomendados: RequestHandler = async (_req, res, next) => {
    try {
        // Servir desde cache si es reciente
        if (cachedRecomendados && Date.now() - cacheTimestamp < CACHE_TTL) {
            res.json({ recomendados: cachedRecomendados });
            return;
        }

        // 1. Traer todas las reservas confirmadas con valoraciones
        const reservas = await Reserva.findAll({
            where: { estado: 'confirmada' },
            attributes: ['id_reserva', 'salon_id', 'datos_evento'],
        });

        const todasLasValoraciones = await Valoracion.findAll({
            attributes: ['reserva_id', 'tipo', 'entidad_id', 'estrellas'],
        });

        // Indexar valoraciones por reserva_id
        const valsPorReserva = new Map<number, Valoracion[]>();
        for (const v of todasLasValoraciones) {
            const id = v.reserva_id;
            if (!valsPorReserva.has(id)) valsPorReserva.set(id, []);
            valsPorReserva.get(id)!.push(v);
        }

        // 2. Agrupar reservas por combo (salon_id + sorted service ids)
        type ComboData = {
            salon_id: number;
            servicioIds: number[];
            conteo: number;
            sumSalon: number; nSalon: number;
            sumServicio: number; nServicio: number;
            sumGeneral: number; nGeneral: number;
        };
        const combos = new Map<string, ComboData>();

        for (const r of reservas) {
            const vals = valsPorReserva.get(r.id_reserva);
            if (!vals || vals.length === 0) continue;

            // Extraer IDs de servicios desde datos_evento
            let servicioIds: number[] = [];
            try {
                const de = typeof r.datos_evento === 'string'
                    ? JSON.parse(r.datos_evento)
                    : r.datos_evento;
                const servs = de?.servicios || de?.serviciosSeleccionados || [];
                servicioIds = servs
                    .map((s: any) => Number(s.id_servicio))
                    .filter((id: number) => !isNaN(id) && id > 0)
                    .sort((a: number, b: number) => a - b);
            } catch {}

            const key = `${r.salon_id}|${servicioIds.join(',')}`;

            if (!combos.has(key)) {
                combos.set(key, {
                    salon_id: r.salon_id,
                    servicioIds,
                    conteo: 0,
                    sumSalon: 0, nSalon: 0,
                    sumServicio: 0, nServicio: 0,
                    sumGeneral: 0, nGeneral: 0,
                });
            }

            const c = combos.get(key)!;
            c.conteo++;

            for (const v of vals) {
                if (v.tipo === 'salon')          { c.sumSalon    += v.estrellas; c.nSalon++;    }
                if (v.tipo === 'servicio')        { c.sumServicio += v.estrellas; c.nServicio++; }
                if (v.tipo === 'evento_general')  { c.sumGeneral  += v.estrellas; c.nGeneral++;  }
            }
        }

        // 3. Calcular score y filtrar combos con al menos 1 valoración completa
        const ranked = Array.from(combos.values())
            .filter(c => c.nSalon > 0 || c.nGeneral > 0)
            .map(c => {
                const avgSalon   = c.nSalon    > 0 ? c.sumSalon    / c.nSalon    : 3;
                const avgServ    = c.nServicio  > 0 ? c.sumServicio / c.nServicio : 3;
                const avgGeneral = c.nGeneral   > 0 ? c.sumGeneral  / c.nGeneral  : 3;
                const score = avgSalon * 0.5 + avgGeneral * 0.3 + avgServ * 0.2;
                return { ...c, avgSalon, avgServ, avgGeneral, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        // 4. Hidratar con datos reales de salon y servicios
        const salonIds   = [...new Set(ranked.map(c => c.salon_id))];
        const servicioAllIds = [...new Set(ranked.flatMap(c => c.servicioIds))];

        const [salones, servicios] = await Promise.all([
            Salon.findAll({ where: { id_salon: salonIds }, attributes: ['id_salon', 'nombre', 'precio_alquiler', 'precios_config', 'localidad', 'aforo', 'imagen'] }),
            servicioAllIds.length > 0
                ? ServicioAdicional.findAll({ where: { id_servicio: servicioAllIds }, attributes: ['id_servicio', 'nombre', 'categoria', 'precio', 'tipo_precio', 'imagen'] })
                : Promise.resolve([]),
        ]);

        const salonMap = new Map(salones.map(s => [s.id_salon, s]));
        const servicioMap = new Map(servicios.map(s => [(s as any).id_servicio, s]));

        const recomendados = ranked
            .map(c => {
                const salon = salonMap.get(c.salon_id);
                if (!salon) return null;
                return {
                    salon,
                    servicios: c.servicioIds.map(id => servicioMap.get(id)).filter(Boolean),
                    score: Math.round(c.score * 10) / 10,
                    avgSalon: Math.round(c.avgSalon * 10) / 10,
                    avgGeneral: Math.round(c.avgGeneral * 10) / 10,
                    conteo: c.conteo,
                };
            })
            .filter(Boolean);

        // Guardar en cache
        cachedRecomendados = recomendados;
        cacheTimestamp = Date.now();

        res.json({ recomendados });
    } catch (err) {
        logger.error('[Recomendados] Error calculando recomendados', { err: String(err) });
        next(err);
    }
};
