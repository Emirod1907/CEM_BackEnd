import { DataTypes, Model } from 'sequelize';
import db from '../db/connection';
import Reserva from './reserva';
import Persona from './persona';

class Valoracion extends Model {
    declare id_valoracion: number;
    declare reserva_id: number;
    declare persona_id: number;
    declare tipo: 'salon' | 'servicio' | 'evento_general';
    declare entidad_id: number | null;
    declare estrellas: number;
    declare comentario: string | null;
}

Valoracion.init({
    id_valoracion: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    reserva_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    persona_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    tipo: {
        type: DataTypes.ENUM('salon', 'servicio', 'evento_general'),
        allowNull: false,
    },
    entidad_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    estrellas: {
        type: DataTypes.TINYINT,
        allowNull: false,
        validate: { min: 1, max: 5 },
    },
    comentario: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
    },
}, {
    sequelize: db,
    tableName: 'Valoraciones',
    timestamps: true,
    indexes: [
        // Evita doble valoración del mismo item en la misma reserva
        { unique: true, fields: ['reserva_id', 'tipo', 'entidad_id'] }
    ],
});

Valoracion.belongsTo(Reserva,  { foreignKey: 'reserva_id', as: 'Reserva' });
Valoracion.belongsTo(Persona,  { foreignKey: 'persona_id', as: 'Persona' });

export default Valoracion;
