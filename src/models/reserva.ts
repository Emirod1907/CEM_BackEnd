import { DataTypes, Model } from "sequelize";
import db from "../db/connection";
import Evento from "./evento";
import Bodega from "./bodega";


class Reserva extends Model{
    declare id_reserva: number;
    declare evento_id: number;
    declare bodega_id: number;
    declare fecha: Date
};

Reserva.init({
    fecha: DataTypes.DATE
},{
    sequelize: db,
    tableName: 'reservas'
});

Reserva.belongsTo(Evento, {foreignKey: 'evento_id'});
Reserva.belongsTo(Bodega, {foreignKey: 'bodega_id'});

export default Reserva;