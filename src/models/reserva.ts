import { DataTypes, Model } from "sequelize";
import db from "../db/connection";
import Evento from "./evento";
import Salon from "./salon";
import Persona from "./persona";


class Reserva extends Model{
    declare id_reserva: number;
    declare evento_id: number | null;
    declare salon_id: number;
    declare persona_id: number;
    declare fecha: Date;
    declare estado: string;
    declare datos_evento: string | null;
    declare monto_alquiler: number;
    declare fecha_limite_pago: Date | null;
};

Reserva.init({
    id_reserva: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    fecha: {
        type: DataTypes.DATE
    },
    evento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    salon_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    persona_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    estado: {
        type: DataTypes.ENUM('pendiente_pago', 'seña_abonada', 'confirmada', 'cancelada'),
        allowNull: false,
        defaultValue: 'pendiente_pago'
    },
    datos_evento: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        defaultValue: null
    },
    monto_alquiler: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    fecha_limite_pago: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    }
},{
    sequelize: db,
    tableName: 'reservas',
    timestamps: true
});

Reserva.belongsTo(Evento,  { foreignKey: 'evento_id',  as: 'Evento' });
Reserva.belongsTo(Salon,   { foreignKey: 'salon_id',   as: 'Salon' });
Reserva.belongsTo(Persona, { foreignKey: 'persona_id', as: 'Persona' });

export default Reserva;
