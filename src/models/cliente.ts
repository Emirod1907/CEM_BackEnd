import { Model, DataTypes } from 'sequelize';
import db from '../db/connection';
import Persona from './persona';

class Cliente extends Model {
  declare id_cliente: number;
  declare persona_id: number;
  declare domicilio: string;
  declare telefono: number;
}

Cliente.init({
  id_cliente: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  domicilio: 
  {
    type: DataTypes.STRING,
    allowNull: false
},

  telefono: {
    type: DataTypes.BIGINT,
    allowNull: false
}
}, 
{
  sequelize: db,
  tableName: 'clientes'
});

Cliente.belongsTo(Persona, { foreignKey: 'persona_id' });

export default Cliente;