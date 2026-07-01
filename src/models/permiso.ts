import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface PermisoAtributos {
    id_permiso?: number;
    entidad: string;   // cliente | organizador | salon
    accion: string;    // ver | crear | editar | eliminar
    descripcion?: string;
}

class Permiso extends Model<PermisoAtributos> implements PermisoAtributos {
    declare id_permiso: number;
    declare entidad: string;
    declare accion: string;
    declare descripcion: string;
}

Permiso.init({
    id_permiso: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    entidad: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    accion: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    descripcion: {
        type: DataTypes.STRING(255),
        allowNull: true
    }
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'Permisos',
    timestamps: false
});

export default Permiso;
