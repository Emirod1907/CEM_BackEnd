import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface OrdenDesgloseAtributos {
    id_desglose?: number
    orden_id: number
    reserva_id?: number | null
    monto_bruto: number
    comision_cliente_porcentaje: number
    monto_comision_cliente: number
    comision_proveedor_porcentaje: number
    monto_comision_proveedor: number
    monto_neto_proveedor: number
    estado_liquidacion: 'pendiente' | 'liquidado' | 'facturado'
    factura_id?: number | null
    fecha?: Date
    fecha_liquidacion?: Date | null          // cuándo se ejecutó la liquidación
    beneficiario_mp_user_id?: string | null  // collector_id del vendedor que cobra (si conectó MP)
}

class OrdenDesglose extends Model<OrdenDesgloseAtributos> implements OrdenDesgloseAtributos {
    declare id_desglose: number
    declare orden_id: number
    declare reserva_id: number | null
    declare monto_bruto: number
    declare comision_cliente_porcentaje: number
    declare monto_comision_cliente: number
    declare comision_proveedor_porcentaje: number
    declare monto_comision_proveedor: number
    declare monto_neto_proveedor: number
    declare estado_liquidacion: 'pendiente' | 'liquidado' | 'facturado'
    declare factura_id: number | null
    declare fecha: Date
    declare fecha_liquidacion: Date | null
    declare beneficiario_mp_user_id: string | null
}

OrdenDesglose.init({
    id_desglose: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    orden_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'Ordenes', key: 'id_orden' },
    },
    reserva_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    monto_bruto: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    comision_cliente_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
    },
    monto_comision_cliente: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    comision_proveedor_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
    },
    monto_comision_proveedor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    monto_neto_proveedor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    estado_liquidacion: {
        type: DataTypes.ENUM('pendiente', 'liquidado', 'facturado'),
        allowNull: false,
        defaultValue: 'pendiente',
    },
    factura_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    fecha: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    fecha_liquidacion: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
    },
    beneficiario_mp_user_id: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
    },
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'OrdenDesglose',
    timestamps: false,
    indexes: [
        { fields: ['estado_liquidacion'] },
        { fields: ['reserva_id'] },
    ],
})

export default OrdenDesglose
