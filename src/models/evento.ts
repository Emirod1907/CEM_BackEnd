import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'


interface EventoAtributos {
    id_evento?:number;
    nombre: string,
    descripcion:string,
    fecha: Date,
    precio: number,
    imagen: string,
    cupo: number,
}

class Evento extends Model<EventoAtributos> implements EventoAtributos {
    declare id_evento: number;
    declare nombre: string;
    declare descripcion: string;
    declare fecha: Date;
    declare precio: number;
    declare imagen: string;
    declare cupo: number;
}

Evento.init({
    id_evento:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    descripcion:{
        type: DataTypes.STRING,
        allowNull: false,
    },
    fecha: {
        type: DataTypes.DATE,
        allowNull: false
    },
    precio: {
        type: DataTypes.DECIMAL(10,2),
        allowNull: false
    },
    imagen:{
        type: DataTypes.STRING,
        allowNull: false
    },
    cupo:{
        type: DataTypes.INTEGER,
        allowNull: false,
    },
},{
        sequelize:db,
        freezeTableName: true,
        modelName:'Eventos',
    }
);

export default Evento;