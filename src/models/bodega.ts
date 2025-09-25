import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface BodegaAtributos {
    id_bodega?:number;
    nombre: string,
    domicilio: string,
    descripcion:string,
    imagen: string,
    aforo: number,
}

class Bodega extends Model<BodegaAtributos> implements BodegaAtributos {
    declare id_bodega: number;
    declare nombre: string;
    declare domicilio: string;
    declare descripcion: string;
    declare imagen: string;
    declare aforo: number;
}

Bodega.init({
    id_bodega:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    domicilio: {
        type: DataTypes.STRING,
        allowNull: false
    },
    descripcion:{
        type: DataTypes.STRING,
        allowNull: false,
    },
    imagen:{
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: ''
    },
    aforo:{
        type: DataTypes.INTEGER,
        allowNull: false,
    },
},{
        sequelize:db,
        freezeTableName: true,
        modelName:'Bodegas',
        timestamps: false
    }
);

export default Bodega;