import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface HistorialComisionesAtributos {
    id_historial?: number
    config_id: number
    tipo_perfil: string
    cliente_anterior: number
    cliente_nuevo: number
    proveedor_anterior: number
    proveedor_nuevo: number
    admin_id: number
    fecha?: Date
}

class HistorialComisiones extends Model<HistorialComisionesAtributos>
    implements HistorialComisionesAtributos {
    declare id_historial: number
    declare config_id: number
    declare tipo_perfil: string
    declare cliente_anterior: number
    declare cliente_nuevo: number
    declare proveedor_anterior: number
    declare proveedor_nuevo: number
    declare admin_id: number
    declare fecha: Date
}

HistorialComisiones.init({
    id_historial: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    config_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'ConfiguracionComisiones', key: 'id_config' },
    },
    tipo_perfil: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    cliente_anterior: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
    },
    cliente_nuevo: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
    },
    proveedor_anterior: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
    },
    proveedor_nuevo: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
    },
    admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Personas', key: 'id_persona' },
    },
    fecha: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'HistorialComisiones',
    timestamps: false,
})

import Persona from './persona'
import ConfiguracionComision from './configuracionComision'
HistorialComisiones.belongsTo(ConfiguracionComision, { foreignKey: 'config_id', as: 'Config' })
HistorialComisiones.belongsTo(Persona, { foreignKey: 'admin_id', as: 'Admin' })

export default HistorialComisiones
