import { Model, DataTypes } from 'sequelize';
import db from '../db/connection';
import Persona from './persona';

class Organizador extends Model {
  declare id_organizador: number;
  declare persona_id: number;
  declare cuit: number;
}

Organizador.init({
  id_organizador: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  cuit: {
    type: DataTypes.BIGINT,
    allowNull:false
}
}, 
{
  sequelize: db,
  tableName: 'organizadores'
});


Organizador.belongsTo(Persona, { foreignKey: 'persona_id' });

export default Organizador;