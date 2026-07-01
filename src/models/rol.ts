import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface RolAtributos {
    id_rol?: number;
    nombre: string;
    descripcion?: string;
}

class Rol extends Model<RolAtributos> implements RolAtributos {
    declare id_rol: number;
    declare nombre: string;
    declare descripcion: string;
}

Rol.init({
    id_rol: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    descripcion: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'Roles',
    timestamps: false
});

export default Rol;
