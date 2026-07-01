import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface SalonAtributos {
    id_salon?:number;
    nombre: string,
    domicilio: string,
    departamento?: string | null,
    localidad?: string | null,
    provincia?: string | null,
    servicios_incluidos?: string | null,
    tipos_evento?: string | null,
    tipo_salon?: string | null,
    imagen: string,
    aforo: number,
    latitud?: number | null,
    longitud?: number | null,
    precio_alquiler?: number | null,
    dueno_id?: number | null,
    precios_config?: string | null,
}

class Salon extends Model<SalonAtributos> implements SalonAtributos {
    declare id_salon: number;
    declare nombre: string;
    declare domicilio: string;
    declare departamento: string | null;
    declare localidad: string | null;
    declare provincia: string | null;
    declare servicios_incluidos: string | null;
    declare tipos_evento: string | null;
    declare tipo_salon: string | null;
    declare imagen: string;
    declare aforo: number;
    declare latitud: number | null;
    declare longitud: number | null;
    declare precio_alquiler: number | null;
    declare dueno_id: number | null;
    declare precios_config: string | null;
}

Salon.init({
    id_salon:{
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
    departamento: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
    },
    localidad: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
    },
    provincia: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
    },
    servicios_incluidos:{
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
    },
    tipos_evento:{
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
    },
    // Quincho | Quinta | Finca | Bodega | Terraza | Salón | Pelotero
    tipo_salon: {
        type: DataTypes.STRING(30),
        allowNull: true,
        defaultValue: null,
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
    latitud:{
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: null,
    },
    longitud:{
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: null,
    },
    precio_alquiler:{
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null,
    },
    dueno_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    precios_config: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
    },
},{
        sequelize:db,
        freezeTableName: true,
        modelName:'Salones',
        timestamps: false
    }
);

export default Salon;
