import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'
import Evento from './evento'

class Invitacion extends Model {
    declare id_invitacion: number;
    declare token: string;
    declare evento_id: number;
    declare nombre_invitado: string | null;
    declare email_invitado: string | null;
    declare telefono: string | null;
    declare num_invitados: number;
    declare accedida_en: Date | null;
    declare persona_id: number | null;
    declare estado: string;
    declare fecha_confirmacion: Date | null;
    declare qr_data: string | null;
}

Invitacion.init({
    id_invitacion: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    token: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true
    },
    evento_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    nombre_invitado: {
        type: DataTypes.STRING(150),
        allowNull: true
    },
    email_invitado: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    telefono: {
        type: DataTypes.STRING(30),
        allowNull: true,
        defaultValue: null
    },
    num_invitados: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    accedida_en: {
        // timestamp when link was first opened — used for single-use invalidation
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },
    persona_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    },
    estado: {
        type: DataTypes.ENUM('pendiente', 'confirmada', 'usada'),
        allowNull: false,
        defaultValue: 'pendiente'
    },
    fecha_confirmacion: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },
    qr_data: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
    }
}, {
    sequelize: db,
    tableName: 'invitaciones',
    timestamps: true
})

Invitacion.belongsTo(Evento, { foreignKey: 'evento_id', as: 'Evento' })

export default Invitacion
