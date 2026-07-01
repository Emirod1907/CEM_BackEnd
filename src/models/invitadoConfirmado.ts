import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'
import Invitacion from './invitacion'

class InvitadoConfirmado extends Model {
    declare id: number;
    declare invitacion_id: number;
    declare orden: number;
    declare dni: string;
    declare nombre: string;
    declare es_extra: boolean;
    declare orden_mp_id: number | null;
}

InvitadoConfirmado.init({
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    invitacion_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    orden: {
        // 1-based index within the invitation slot (1..num_invitados) or 0 for extras
        type: DataTypes.INTEGER,
        allowNull: false
    },
    dni: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    nombre: {
        type: DataTypes.STRING(150),
        allowNull: false
    },
    es_extra: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    orden_mp_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    }
}, {
    sequelize: db,
    tableName: 'invitados_confirmados',
    timestamps: true
})

InvitadoConfirmado.belongsTo(Invitacion, { foreignKey: 'invitacion_id', as: 'Invitacion' })
Invitacion.hasMany(InvitadoConfirmado, { foreignKey: 'invitacion_id', as: 'InvitadosConfirmados' })

export default InvitadoConfirmado
