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
import MovimientoPozo from '../models/movimientoPozo'
import PedidoTorta from '../models/pedidoTorta';
import { seedSalones } from './salones.seed';
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
        // Crear tablas nuevas si no existen.
        // Los cambios estructurales de tablas viven en src/db/migrate.ts + schema-patches.ts.
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
        try { await Factura.sync({ force: false }) } catch (_) {}
        try { await AutorizacionExcepcional.sync({ force: false }) } catch (_) {}
        try { await Contrato.sync({ force: false }) } catch (_) {}
        await MovimientoPozo.sync({ force: false });
        // alter:true → agrega columnas nuevas del modelo a la tabla existente sin perder datos
        try { await PedidoTorta.sync({ alter: true }) } catch (_) {}

        // Seed de datos iniciales. No modificar estructura de base acá.

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

        // Salones de demostración (50 salones ficticios de Mendoza).
        // findOrCreate por nombre: ejecutar el seed varias veces no duplica.
        await seedSalones();

        logger.info('[Seed] Roles, permisos y servicios inicializados correctamente');
    } catch (error) {
        logger.error('[Seed] Error al inicializar datos', { error: String(error) });
    }
};
