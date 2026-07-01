import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

export const TIPOS_PERFIL = [
    'salon',
    'catering',
    'decoracion',
    'audio_video',
    'seguridad',
    'mobiliario',
    'entretenimiento',
    'otro',
] as const

export type TipoPerfil = typeof TIPOS_PERFIL[number]

interface ConfiguracionComisionAtributos {
    id_config?: number
    tipo_perfil: TipoPerfil
    comision_cliente_porcentaje: number
    comision_proveedor_porcentaje: number
    activo?: boolean
    actualizado_por?: number | null
    fecha_actualizacion?: Date | null
}

class ConfiguracionComision extends Model<ConfiguracionComisionAtributos>
    implements ConfiguracionComisionAtributos {
    declare id_config: number
    declare tipo_perfil: TipoPerfil
    declare comision_cliente_porcentaje: number
    declare comision_proveedor_porcentaje: number
    declare activo: boolean
    declare actualizado_por: number | null
    declare fecha_actualizacion: Date | null
}

ConfiguracionComision.init({
    id_config: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    tipo_perfil: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
    },
    comision_cliente_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
    },
    comision_proveedor_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
    },
    activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    actualizado_por: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: { model: 'Personas', key: 'id_persona' },
    },
    fecha_actualizacion: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
    },
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'ConfiguracionComisiones',
    timestamps: true,
})

// Importación diferida para evitar circular dependency con persona.ts
import Persona from './persona'
ConfiguracionComision.belongsTo(Persona, { foreignKey: 'actualizado_por', as: 'AdminActualizador' })

export default ConfiguracionComision
