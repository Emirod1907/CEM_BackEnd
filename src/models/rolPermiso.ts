import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'
import Rol from './rol'
import Permiso from './permiso'

class RolPermiso extends Model {
    declare rol_id: number;
    declare permiso_id: number;
}

RolPermiso.init({
    rol_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: 'Roles', key: 'id_rol' }
    },
    permiso_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: 'Permisos', key: 'id_permiso' }
    }
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'RolPermisos',
    timestamps: false
});

// Asociaciones many-to-many
Rol.belongsToMany(Permiso, {
    through: RolPermiso,
    foreignKey: 'rol_id',
    otherKey: 'permiso_id',
    as: 'Permisos'
});

Permiso.belongsToMany(Rol, {
    through: RolPermiso,
    foreignKey: 'permiso_id',
    otherKey: 'rol_id',
    as: 'Roles'
});

export default RolPermiso;
