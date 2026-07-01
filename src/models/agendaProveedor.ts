import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

class AgendaProveedor extends Model {
    declare id_agenda: number;
    declare proveedor_id: number;
    declare fecha: string;
    declare estado: string;
    declare nombre_cliente: string | null;
    declare descripcion: string | null;
    declare manual: boolean;
    declare reserva_id: number | null;
    declare motivo_cancelacion: string | null;
    declare detalle_pedido: string | null;
    declare monto_total: number | null;
    declare estado_pago: string;
    declare fecha_limite: string | null;
    declare domicilio: string | null;
}

AgendaProveedor.init({
    id_agenda: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    estado: {
        type: DataTypes.ENUM('pendiente', 'confirmada', 'cancelada'),
        allowNull: false,
        defaultValue: 'pendiente'
    },
    nombre_cliente: { type: DataTypes.STRING(100), allowNull: true, defaultValue: null },
    descripcion:    { type: DataTypes.TEXT,         allowNull: true, defaultValue: null },
    manual:                { type: DataTypes.BOOLEAN,       allowNull: false, defaultValue: true },
    reserva_id:            { type: DataTypes.INTEGER,       allowNull: true,  defaultValue: null },
    motivo_cancelacion:    { type: DataTypes.TEXT,          allowNull: true,  defaultValue: null },
    detalle_pedido:        { type: DataTypes.TEXT,          allowNull: true,  defaultValue: null },
    monto_total:           { type: DataTypes.DECIMAL(10,2), allowNull: true,  defaultValue: null },
    estado_pago: {
        type: DataTypes.ENUM('sin_pago', 'seña_abonada', 'pagado_total', 'cancelado'),
        allowNull: false,
        defaultValue: 'sin_pago'
    },
    fecha_limite:          { type: DataTypes.DATEONLY,      allowNull: true,  defaultValue: null },
    domicilio:             { type: DataTypes.TEXT,          allowNull: true,  defaultValue: null },
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'AgendaProveedor',
    tableName: 'agenda_proveedor',
    timestamps: true
})

export default AgendaProveedor
