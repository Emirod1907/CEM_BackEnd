import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

export type EstadoAutorizacion = 'solicitada' | 'aprobada' | 'consumida' | 'rechazada' | 'expirada'

interface AutorizacionExcepcionalAtributos {
    id_autorizacion?: number
    persona_id: number
    accion: string
    recurso_tipo: string
    recurso_id: number
    motivo_solicitud: string
    estado: EstadoAutorizacion
    solicitada_por: number
    aprobada_por?: number | null
    fecha_solicitud?: Date
    fecha_aprobacion?: Date | null
    fecha_consumo?: Date | null
}

class AutorizacionExcepcional
    extends Model<AutorizacionExcepcionalAtributos>
    implements AutorizacionExcepcionalAtributos
{
    declare id_autorizacion: number
    declare persona_id: number
    declare accion: string
    declare recurso_tipo: string
    declare recurso_id: number
    declare motivo_solicitud: string
    declare estado: EstadoAutorizacion
    declare solicitada_por: number
    declare aprobada_por: number | null
    declare fecha_solicitud: Date
    declare fecha_aprobacion: Date | null
    declare fecha_consumo: Date | null
}

AutorizacionExcepcional.init(
    {
        id_autorizacion: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        persona_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Personas', key: 'id_persona' },
        },
        accion: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        recurso_tipo: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        recurso_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        motivo_solicitud: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        estado: {
            type: DataTypes.ENUM('solicitada', 'aprobada', 'consumida', 'rechazada', 'expirada'),
            allowNull: false,
            defaultValue: 'solicitada',
        },
        solicitada_por: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'Personas', key: 'id_persona' },
        },
        aprobada_por: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'Personas', key: 'id_persona' },
        },
        fecha_solicitud: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        fecha_aprobacion: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        fecha_consumo: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: db,
        freezeTableName: true,
        modelName: 'AutorizacionesExcepcionales',
        timestamps: false,
        indexes: [
            // Búsqueda rápida del middleware: persona + accion + recurso + estado
            { fields: ['persona_id', 'accion', 'recurso_id', 'estado'] },
            // Admin: listar pendientes
            { fields: ['estado'] },
        ],
    }
)

export default AutorizacionExcepcional
