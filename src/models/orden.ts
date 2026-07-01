import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface OrdenAtributos {
    id_orden?: number;
    persona_id: number;
    items: string; // JSON con [{id_evento, nombre, precio, cantidad, subtotal}]
    monto_total: number;
    estado: string; // 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado'
    mp_preference_id?: string;
    mp_payment_id?: string;
    fecha_creacion?: Date;
    tipo?: string; // 'cliente' | 'organizador'
    reserva_id?: number | null;
    tipo_pago?: string | null; // 'seña' | 'total' (solo para tipo=organizador)
}

class Orden extends Model<OrdenAtributos> implements OrdenAtributos {
    declare id_orden: number;
    declare persona_id: number;
    declare items: string;
    declare monto_total: number;
    declare estado: string;
    declare mp_preference_id: string;
    declare mp_payment_id: string;
    declare fecha_creacion: Date;
    declare tipo: string;
    declare reserva_id: number | null;
    declare tipo_pago: string | null;
}

Orden.init({
    id_orden: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    persona_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    items: {
        type: DataTypes.TEXT('long'),
        allowNull: false
    },
    monto_total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    estado: {
        type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado', 'cancelado'),
        allowNull: false,
        defaultValue: 'pendiente'
    },
    mp_preference_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    mp_payment_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    },
    fecha_creacion: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    tipo: {
        type: DataTypes.ENUM('cliente', 'organizador'),
        allowNull: false,
        defaultValue: 'cliente'
    },
    reserva_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    },
    tipo_pago: {
        type: DataTypes.ENUM('seña', 'total'),
        allowNull: true,
        defaultValue: null
    }
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'Ordenes',
    timestamps: false
});

export default Orden;
