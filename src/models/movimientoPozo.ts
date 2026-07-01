import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

/**
 * Libro de movimientos del pozo común de cada evento.
 * Lleva la trazabilidad interna del dinero recaudado por entradas
 * (los pagos reales entran por MercadoPago a la cuenta de la plataforma):
 *  - ingreso_entrada: un invitado/cliente pagó su entrada (vinculado a la orden MP)
 *  - pago_costo:      el organizador aplica fondos del pozo al costo del evento
 *  - retiro_ganancia: el organizador retira su ganancia del pozo
 */
class MovimientoPozo extends Model {
    declare id_movimiento: number;
    declare evento_id: number;
    declare tipo: 'ingreso_entrada' | 'pago_costo' | 'retiro_ganancia';
    declare monto: number;
    declare descripcion: string | null;
    declare orden_id: number | null;
    declare persona_id: number | null;
    declare fecha: Date;
}

MovimientoPozo.init({
    id_movimiento: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    evento_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    tipo: {
        type: DataTypes.ENUM('ingreso_entrada', 'pago_costo', 'retiro_ganancia'),
        allowNull: false
    },
    monto: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    descripcion: {
        type: DataTypes.STRING(300),
        allowNull: true,
        defaultValue: null
    },
    // Orden MP que originó el ingreso (null en egresos manuales)
    orden_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    },
    // Quién: el pagador en ingresos, el organizador en egresos
    persona_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    },
    fecha: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'MovimientosPozo',
    timestamps: false
})

export default MovimientoPozo
