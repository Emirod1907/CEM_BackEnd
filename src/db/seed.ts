import Rol from '../models/rol';
import Permiso from '../models/permiso';
import RolPermiso from '../models/rolPermiso'; // registra asociaciones belongsToMany
import '../models/persona';                     // registra asociación Persona-Rol
import Orden from '../models/orden';
import ServicioAdicional from '../models/servicioAdicional';
import Invitacion from '../models/invitacion';
import InvitadoConfirmado from '../models/invitadoConfirmado';
import AgendaProveedor from '../models/agendaProveedor';
import Valoracion from '../models/valoracion';
import ConfiguracionComision, { TipoPerfil } from '../models/configuracionComision';
import HistorialComisiones from '../models/historialComisiones';
import OrdenDesglose from '../models/ordenDesglose';
import Factura from '../models/factura';
import AutorizacionExcepcional from '../models/autorizacionExcepcional';
import Contrato from '../models/contrato';
import MovimientoPozo from '../models/movimientoPozo';
import db from './connection';
import { logger } from '../libs/logger';

const ENTIDADES = ['cliente', 'organizador', 'salon'];
const ACCIONES  = ['ver', 'crear', 'editar', 'eliminar'];
const ROLES     = [
    { nombre: 'admin',                descripcion: 'Administrador con acceso total' },
    { nombre: 'organizador',          descripcion: 'Puede crear y gestionar eventos, ver salones' },
    { nombre: 'cliente',              descripcion: 'Acceso básico de cliente (legado)' },
    { nombre: 'entusiasta',           descripcion: 'Puede ver eventos públicos y comprar entradas' },
    { nombre: 'dueno_salon',          descripcion: 'Puede registrar y administrar su propio salón' },
    { nombre: 'proveedor_servicios',  descripcion: 'Ofrece servicios para eventos (DJ, catering, etc.)' },
    { nombre: 'proveedor_insumos',    descripcion: 'Carga catálogo de insumos para eventos' },
];

const SERVICIOS_INICIALES = [
    { nombre: 'Catering Premium', descripcion: 'Servicio de catering con menú completo para hasta 100 personas', precio: 85000, categoria: 'catering' },
    { nombre: 'Catering Básico', descripcion: 'Servicio de catering liviano: sandwiches, bebidas y postres', precio: 35000, categoria: 'catering' },
    { nombre: 'Decoración Temática', descripcion: 'Decoración personalizada según temática del evento', precio: 25000, categoria: 'decoracion' },
    { nombre: 'Flores y Arreglos', descripcion: 'Centros de mesa y arreglos florales para el evento', precio: 18000, categoria: 'decoracion' },
    { nombre: 'Sonido Profesional', descripcion: 'Equipo de sonido profesional con DJ incluido', precio: 45000, categoria: 'audio_video' },
    { nombre: 'Iluminación LED', descripcion: 'Sistema de iluminación LED programable para el salón', precio: 22000, categoria: 'audio_video' },
    { nombre: 'Proyección y Pantalla', descripcion: 'Proyector HD y pantalla para presentaciones', precio: 15000, categoria: 'audio_video' },
    { nombre: 'Seguridad Privada', descripcion: 'Personal de seguridad para el evento (4 personas)', precio: 30000, categoria: 'seguridad' },
    { nombre: 'Sillas y Mesas Extra', descripcion: 'Set adicional de 20 mesas y 100 sillas', precio: 12000, categoria: 'mobiliario' },
    { nombre: 'Escenario Portátil', descripcion: 'Escenario portátil de 4x6 metros con escalera', precio: 20000, categoria: 'mobiliario' },
];

export const seed = async () => {
    try {
        // Crear tablas nuevas si no existen (sin tocar las existentes)
        await Rol.sync({ force: false });
        await Permiso.sync({ force: false });
        await RolPermiso.sync({ force: false });
        await Orden.sync({ force: false });
        await ServicioAdicional.sync({ force: false });
        await Invitacion.sync({ force: false });
        await InvitadoConfirmado.sync({ force: false });
        await AgendaProveedor.sync({ force: false });
        await Valoracion.sync({ force: false });
        await ConfiguracionComision.sync({ force: false });
        await HistorialComisiones.sync({ force: false });
        await OrdenDesglose.sync({ force: false });
        // Factura.sync puede fallar si la tabla existe con estructura desactualizada (índice sobre
        // orden_id pero la columna todavía no existe). El addCol de abajo la agrega; el índice
        // se creará en el siguiente reinicio cuando la columna ya esté presente.
        try { await Factura.sync({ force: false }) } catch (_) {}
        try { await AutorizacionExcepcional.sync({ force: false }) } catch (_) {}
        try { await Contrato.sync({ force: false }) } catch (_) {}
        await MovimientoPozo.sync({ force: false });

        // Helper: ejecuta ALTER TABLE ignorando "Duplicate column" (columna ya existe)
        const addCol = async (sql: string, label: string) => {
            try { await db.query(sql) }
            catch (e: any) {
                const msg: string = e?.parent?.sqlMessage || e?.message || ''
                if (!msg.includes('Duplicate column') && !msg.includes('already exists')) {
                    logger.warn(`[Seed] ${label}`, { msg })
                }
            }
        }

        // Invitaciones — nuevas columnas WhatsApp
        await addCol(`ALTER TABLE invitaciones ADD COLUMN telefono VARCHAR(30) NULL`, 'invitaciones.telefono')
        await addCol(`ALTER TABLE invitaciones ADD COLUMN num_invitados INT NOT NULL DEFAULT 1`, 'invitaciones.num_invitados')
        await addCol(`ALTER TABLE invitaciones ADD COLUMN accedida_en DATETIME NULL`, 'invitaciones.accedida_en')
        await addCol(`ALTER TABLE invitaciones ADD COLUMN persona_id INT NULL`, 'invitaciones.persona_id')

        // Personas
        await addCol(`ALTER TABLE Personas ADD COLUMN rol_id INT NULL`, 'Personas.rol_id')
        await addCol(`ALTER TABLE Personas ADD CONSTRAINT fk_personas_rol FOREIGN KEY (rol_id) REFERENCES Roles(id_rol)`, 'Personas.fk_rol').catch(() => {})

        // Ordenes
        await addCol(`ALTER TABLE Ordenes ADD COLUMN tipo ENUM('cliente','organizador') NOT NULL DEFAULT 'cliente'`, 'Ordenes.tipo')
        await addCol(`ALTER TABLE Ordenes ADD COLUMN reserva_id INT NULL`, 'Ordenes.reserva_id')
        await addCol(`ALTER TABLE Ordenes ADD COLUMN tipo_pago ENUM('seña','total') NULL`, 'Ordenes.tipo_pago')

        // ── Rename bodega_id → salon_id (migración 20260602_rename_bodega_to_salon) ──
        // Cada statement usa .catch(() => {}) — si la columna ya fue renombrada falla
        // silenciosamente (bodega_id no existe), si no fue renombrada la renombra ahora.
        // Orden: 1) drop FKs  2) rename PK en Salones  3) rename FKs  4) recrear FKs
        await db.query(`ALTER TABLE reservas DROP FOREIGN KEY fk_reservas_salon`).catch(() => {})
        await db.query(`ALTER TABLE Eventos  DROP FOREIGN KEY fk_eventos_salon`).catch(() => {})
        await db.query(`ALTER TABLE Salones  CHANGE COLUMN id_bodega  id_salon  INT NOT NULL AUTO_INCREMENT`).catch(() => {})
        await db.query(`ALTER TABLE reservas CHANGE COLUMN bodega_id  salon_id  INT NOT NULL`).catch(() => {})
        await db.query(`ALTER TABLE Eventos  CHANGE COLUMN bodega_id  salon_id  INT NOT NULL`).catch(() => {})
        await db.query(`ALTER TABLE reservas ADD CONSTRAINT fk_reservas_salon FOREIGN KEY (salon_id) REFERENCES Salones (id_salon) ON UPDATE CASCADE ON DELETE RESTRICT`).catch(() => {})
        await db.query(`ALTER TABLE Eventos  ADD CONSTRAINT fk_eventos_salon  FOREIGN KEY (salon_id) REFERENCES Salones (id_salon) ON UPDATE CASCADE ON DELETE RESTRICT`).catch(() => {})

        // Reservas
        // Contratos — comisión de dos lados
        await addCol(`ALTER TABLE Contratos ADD COLUMN comision_proveedor_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 3`, 'Contratos.comision_proveedor_porcentaje')
        await addCol(`ALTER TABLE Contratos ADD COLUMN ambito ENUM('salon','proveedor') NOT NULL DEFAULT 'salon'`, 'Contratos.ambito')
        await db.query(`ALTER TABLE Contratos CHANGE COLUMN comision_porcentaje comision_cliente_porcentaje DECIMAL(5,2) NOT NULL`).catch(() => {})

        await addCol(`ALTER TABLE reservas ADD COLUMN estado ENUM('pendiente_pago','seña_abonada','confirmada','cancelada') NOT NULL DEFAULT 'confirmada'`, 'reservas.estado')
        await addCol(`ALTER TABLE reservas ADD COLUMN datos_evento LONGTEXT NULL`, 'reservas.datos_evento')
        await addCol(`ALTER TABLE reservas ADD COLUMN monto_alquiler DECIMAL(10,2) NOT NULL DEFAULT 0`, 'reservas.monto_alquiler')
        await addCol(`ALTER TABLE reservas ADD COLUMN fecha_limite_pago DATETIME NULL`, 'reservas.fecha_limite_pago')
        await db.query(`ALTER TABLE reservas MODIFY COLUMN evento_id INT NULL`).catch(() => {})

        // Facturas — tabla puede existir sin orden_id si fue creada con versión anterior del modelo
        await addCol(`ALTER TABLE Facturas ADD COLUMN orden_id INT NOT NULL DEFAULT 0`, 'Facturas.orden_id')
        await db.query(`ALTER TABLE Facturas ADD CONSTRAINT fk_facturas_orden FOREIGN KEY (orden_id) REFERENCES Ordenes(id_orden)`).catch(() => {})

        // Eventos
        await db.query(`ALTER TABLE Eventos MODIFY COLUMN descripcion TEXT NOT NULL`).catch(() => {})
        await addCol(`ALTER TABLE Eventos ADD COLUMN estado ENUM('borrador','activo','cancelado') NOT NULL DEFAULT 'activo'`, 'Eventos.estado')
        await addCol(`ALTER TABLE Eventos ADD COLUMN es_publico TINYINT(1) NOT NULL DEFAULT 1`, 'Eventos.es_publico')
        // Retroactivo: marcar como privados los eventos de reservas donde es_publico era false
        await db.query(`
            UPDATE Eventos e
            INNER JOIN reservas r ON r.evento_id = e.id_evento
            SET e.es_publico = 0
            WHERE r.datos_evento LIKE '%"es_publico":false%'
              AND e.es_publico = 1
        `).catch(() => {})

        // Salones
        await addCol(`ALTER TABLE Salones ADD COLUMN precio_alquiler DECIMAL(10,2) NULL`, 'Salones.precio_alquiler')
        await addCol(`ALTER TABLE Salones ADD COLUMN servicios_incluidos TEXT NULL`, 'Salones.servicios_incluidos')
        await addCol(`ALTER TABLE Salones ADD COLUMN tipos_evento TEXT NULL`, 'Salones.tipos_evento')
        await addCol(`ALTER TABLE Salones ADD COLUMN dueno_id INT NULL`, 'Salones.dueno_id')
        await addCol(`ALTER TABLE Salones ADD COLUMN precios_config TEXT NULL`, 'Salones.precios_config')
        await addCol(`ALTER TABLE Salones ADD COLUMN tipo_salon VARCHAR(30) NULL`, 'Salones.tipo_salon')

        // ServiciosAdicionales — columnas añadidas post-creación inicial
        // Actualizar el ENUM de categoria por si fue creado con valores incompletos
        await db.query(`ALTER TABLE ServiciosAdicionales MODIFY COLUMN categoria ENUM('catering','decoracion','audio_video','seguridad','mobiliario','otro') NOT NULL DEFAULT 'otro'`).catch(() => {})
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN tipo_precio ENUM('fijo','por_persona','por_hora','por_turno') NOT NULL DEFAULT 'fijo'`, 'ServiciosAdicionales.tipo_precio')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN imagen VARCHAR(255) NULL`, 'ServiciosAdicionales.imagen')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN disponible TINYINT(1) NOT NULL DEFAULT 1`, 'ServiciosAdicionales.disponible')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN proveedor_id INT NULL`, 'ServiciosAdicionales.proveedor_id')

        // AgendaProveedor
        await addCol(`ALTER TABLE agenda_proveedor ADD COLUMN motivo_cancelacion TEXT NULL`, 'agenda_proveedor.motivo_cancelacion')
        await addCol(`ALTER TABLE agenda_proveedor ADD COLUMN detalle_pedido TEXT NULL`, 'agenda_proveedor.detalle_pedido')
        await addCol(`ALTER TABLE agenda_proveedor ADD COLUMN monto_total DECIMAL(10,2) NULL`, 'agenda_proveedor.monto_total')
        await addCol(`ALTER TABLE agenda_proveedor ADD COLUMN estado_pago ENUM('sin_pago','seña_abonada','pagado_total','cancelado') NOT NULL DEFAULT 'sin_pago'`, 'agenda_proveedor.estado_pago')
        await addCol(`ALTER TABLE agenda_proveedor ADD COLUMN fecha_limite DATE NULL`, 'agenda_proveedor.fecha_limite')
        await addCol(`ALTER TABLE agenda_proveedor ADD COLUMN domicilio TEXT NULL`, 'agenda_proveedor.domicilio')

        // ServiciosAdicionales — capacidad y anticipación
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN capacidad_maxima INT NULL`, 'ServiciosAdicionales.capacidad_maxima')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN dias_anticipacion INT NOT NULL DEFAULT 0`, 'ServiciosAdicionales.dias_anticipacion')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD CONSTRAINT fk_servicios_proveedor FOREIGN KEY (proveedor_id) REFERENCES Personas(id_persona)`, 'ServiciosAdicionales.fk_proveedor').catch(() => {})

        // ServiciosAdicionales — tipo_item, disponibilidad y precios diferenciados
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN tipo_item ENUM('producto','servicio') NOT NULL DEFAULT 'producto'`, 'ServiciosAdicionales.tipo_item')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN precio_base DECIMAL(10,2) NULL`, 'ServiciosAdicionales.precio_base')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN dias_disponibles TEXT NULL`, 'ServiciosAdicionales.dias_disponibles')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN horario_inicio VARCHAR(5) NULL`, 'ServiciosAdicionales.horario_inicio')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN horario_fin VARCHAR(5) NULL`, 'ServiciosAdicionales.horario_fin')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN precios_tramos TEXT NULL`, 'ServiciosAdicionales.precios_tramos')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN descuento_cantidad_min INT NULL`, 'ServiciosAdicionales.descuento_cantidad_min')
        await addCol(`ALTER TABLE ServiciosAdicionales ADD COLUMN descuento_porcentaje DECIMAL(5,2) NULL`, 'ServiciosAdicionales.descuento_porcentaje')
        await addCol(`ALTER TABLE ServiciosAdicionales MODIFY COLUMN categoria ENUM('catering','decoracion','audio_video','seguridad','mobiliario','entretenimiento','bebidas','comida','otro') NOT NULL DEFAULT 'otro'`, 'ServiciosAdicionales.categoria_productos').catch(() => {})

        // Personas — nuevos campos de perfil por rol
        await addCol(`ALTER TABLE Personas ADD COLUMN perfil_completado TINYINT(1) NOT NULL DEFAULT 0`, 'Personas.perfil_completado')
        await addCol(`ALTER TABLE Personas ADD COLUMN categoria_servicio TEXT NULL`, 'Personas.categoria_servicio')

        // Crear roles por defecto
        for (const rolData of ROLES) {
            await Rol.findOrCreate({ where: { nombre: rolData.nombre }, defaults: rolData });
        }

        // Crear permisos (entidad x accion)
        const todosLosPermisos: Permiso[] = [];
        for (const entidad of ENTIDADES) {
            for (const accion of ACCIONES) {
                const [permiso] = await Permiso.findOrCreate({
                    where: { entidad, accion },
                    defaults: { entidad, accion, descripcion: `${accion} ${entidad}` }
                });
                todosLosPermisos.push(permiso);
            }
        }

        // Asignar TODOS los permisos al rol admin
        const adminRol = await Rol.findOne({ where: { nombre: 'admin' } });
        if (adminRol) {
            await RolPermiso.destroy({ where: { rol_id: adminRol.id_rol } });
            await RolPermiso.bulkCreate(
                todosLosPermisos.map(p => ({ rol_id: adminRol.id_rol, permiso_id: p.id_permiso })),
                { ignoreDuplicates: true }
            );
        }

        // Crear servicios adicionales de ejemplo si no existen
        for (const servicioData of SERVICIOS_INICIALES) {
            await ServicioAdicional.findOrCreate({
                where: { nombre: servicioData.nombre },
                defaults: { ...servicioData, disponible: true }
            });
        }

        // Configuraciones de comisión iniciales (8 tipos de perfil)
        const COMISIONES_DEFAULT: { tipo_perfil: TipoPerfil; comision_cliente_porcentaje: number; comision_proveedor_porcentaje: number }[] = [
            { tipo_perfil: 'salon',          comision_cliente_porcentaje: 10, comision_proveedor_porcentaje: 3 },
            { tipo_perfil: 'catering',       comision_cliente_porcentaje:  8, comision_proveedor_porcentaje: 3 },
            { tipo_perfil: 'decoracion',     comision_cliente_porcentaje: 12, comision_proveedor_porcentaje: 3 },
            { tipo_perfil: 'audio_video',    comision_cliente_porcentaje:  8, comision_proveedor_porcentaje: 3 },
            { tipo_perfil: 'seguridad',      comision_cliente_porcentaje:  8, comision_proveedor_porcentaje: 3 },
            { tipo_perfil: 'mobiliario',     comision_cliente_porcentaje:  8, comision_proveedor_porcentaje: 3 },
            { tipo_perfil: 'entretenimiento',comision_cliente_porcentaje:  8, comision_proveedor_porcentaje: 3 },
            { tipo_perfil: 'otro',           comision_cliente_porcentaje:  8, comision_proveedor_porcentaje: 3 },
        ]
        for (const comisionData of COMISIONES_DEFAULT) {
            await ConfiguracionComision.findOrCreate({
                where: { tipo_perfil: comisionData.tipo_perfil },
                defaults: { ...comisionData, activo: true },
            })
        }

        logger.info('[Seed] Roles, permisos y servicios inicializados correctamente');
    } catch (error) {
        logger.error('[Seed] Error al inicializar datos', { error: String(error) });
    }
};
