import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'
import Persona from './persona'

interface ContratoAtributos {
    id_contrato?: number
    persona_id: number
    ambito?: 'salon' | 'proveedor' | 'consumidor'   // dueño de salón, proveedor, o consumidor (aceptación de T&C en checkout)
    version_terminos: string
    comision_cliente_porcentaje: number
    comision_proveedor_porcentaje: number
    texto_terminos: string
    hash_terminos: string
    aceptado: boolean
    fecha_aceptacion?: Date | null
    ip_aceptacion?: string | null
    user_agent?: string | null
    estado: 'vigente' | 'revocado' | 'reemplazado'
}

class Contrato extends Model<ContratoAtributos> implements ContratoAtributos {
    declare id_contrato: number
    declare persona_id: number
    declare ambito: 'salon' | 'proveedor' | 'consumidor'
    declare version_terminos: string
    declare comision_cliente_porcentaje: number
    declare comision_proveedor_porcentaje: number
    declare texto_terminos: string
    declare hash_terminos: string
    declare aceptado: boolean
    declare fecha_aceptacion: Date | null
    declare ip_aceptacion: string | null
    declare user_agent: string | null
    declare estado: 'vigente' | 'revocado' | 'reemplazado'
}

Contrato.init({
    id_contrato: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    persona_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Personas', key: 'id_persona' },
    },
    ambito: {
        type: DataTypes.ENUM('salon', 'proveedor', 'consumidor'),
        allowNull: false,
        defaultValue: 'salon',
    },
    version_terminos: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    comision_cliente_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
    },
    comision_proveedor_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 3,
    },
    texto_terminos: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    hash_terminos: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    aceptado: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    fecha_aceptacion: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
    },
    ip_aceptacion: {
        type: DataTypes.STRING(45),
        allowNull: true,
        defaultValue: null,
    },
    user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: null,
    },
    estado: {
        type: DataTypes.ENUM('vigente', 'revocado', 'reemplazado'),
        allowNull: false,
        defaultValue: 'vigente',
    },
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'Contratos',
    timestamps: true,
    indexes: [
        { fields: ['persona_id', 'estado'] },
    ],
})

Contrato.belongsTo(Persona, { foreignKey: 'persona_id', as: 'Persona' })
Persona.hasMany(Contrato, { foreignKey: 'persona_id', as: 'Contratos' })

export default Contrato
