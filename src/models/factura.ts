import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface FacturaAtributos {
    id_factura?: number
    orden_id: number                        // FK → Ordenes
    tipo_comprobante: 'A' | 'B' | 'C'      // AFIP: A=resp.inscripto, B=consumidor final, C=monotributo
    punto_venta: number
    numero_comprobante?: number | null
    cae?: string | null
    cae_vencimiento?: Date | null
    fecha_emision?: Date | null
    monto: number
    estado: 'pendiente' | 'emitida' | 'error'
    datos_receptor?: string | null          // JSON: CUIT, razón social, domicilio
    xml_respuesta?: string | null           // XML completo devuelto por WSFE
    error_detalle?: string | null
}

class Factura extends Model<FacturaAtributos> implements FacturaAtributos {
    declare id_factura: number
    declare orden_id: number
    declare tipo_comprobante: 'A' | 'B' | 'C'
    declare punto_venta: number
    declare numero_comprobante: number | null
    declare cae: string | null
    declare cae_vencimiento: Date | null
    declare fecha_emision: Date | null
    declare monto: number
    declare estado: 'pendiente' | 'emitida' | 'error'
    declare datos_receptor: string | null
    declare xml_respuesta: string | null
    declare error_detalle: string | null
}

Factura.init({
    id_factura: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    orden_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Ordenes', key: 'id_orden' },
    },
    tipo_comprobante: {
        type: DataTypes.ENUM('A', 'B', 'C'),
        allowNull: false,
        defaultValue: 'C',
    },
    punto_venta: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    numero_comprobante: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    cae: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
    },
    cae_vencimiento: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        defaultValue: null,
    },
    fecha_emision: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
    },
    monto: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    estado: {
        type: DataTypes.ENUM('pendiente', 'emitida', 'error'),
        allowNull: false,
        defaultValue: 'pendiente',
    },
    datos_receptor: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
    },
    xml_respuesta: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
    },
    error_detalle: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
    },
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'Facturas',
    timestamps: false,
    indexes: [
        { fields: ['orden_id'] },
        { fields: ['estado'] },
    ],
})

export default Factura
