import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

interface ServicioAtributos {
    id_servicio?: number;
    nombre: string;
    descripcion: string;
    precio: number;
    precio_base?: number | null;        // Lo que recibe el proveedor (antes de comisión)
    categoria: string;
    tipo_precio?: string;
    tipo_item?: string;
    disponible?: boolean;
    imagen?: string | null;
    proveedor_id?: number | null;
    capacidad_maxima?: number | null;
    dias_anticipacion?: number;
    dias_disponibles?: string | null;   // JSON array: '["lun","mar",...]'
    horario_inicio?: string | null;     // "HH:MM"
    horario_fin?: string | null;        // "HH:MM"
    precios_tramos?: string | null;     // JSON array of pricing tiers
    descuento_cantidad_min?: number | null; // a partir de esta cantidad aplica el descuento
    descuento_porcentaje?: number | null;   // % de descuento por comprar en volumen
}

class ServicioAdicional extends Model<ServicioAtributos> implements ServicioAtributos {
    declare id_servicio: number;
    declare nombre: string;
    declare descripcion: string;
    declare precio: number;
    declare precio_base: number | null;
    declare categoria: string;
    declare tipo_precio: string;
    declare tipo_item: string;
    declare disponible: boolean;
    declare imagen: string | null;
    declare proveedor_id: number | null;
    declare capacidad_maxima: number | null;
    declare dias_anticipacion: number;
    declare dias_disponibles: string | null;
    declare horario_inicio: string | null;
    declare horario_fin: string | null;
    declare precios_tramos: string | null;
    declare descuento_cantidad_min: number | null;
    declare descuento_porcentaje: number | null;
}

ServicioAdicional.init({
    id_servicio: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    descripcion: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    precio: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    precio_base: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null
    },
    categoria: {
        type: DataTypes.ENUM('catering', 'decoracion', 'audio_video', 'seguridad', 'mobiliario', 'entretenimiento', 'bebidas', 'comida', 'otro'),
        allowNull: false,
        defaultValue: 'otro'
    },
    tipo_precio: {
        type: DataTypes.ENUM('fijo', 'por_persona', 'por_hora', 'por_turno'),
        allowNull: false,
        defaultValue: 'fijo'
    },
    tipo_item: {
        type: DataTypes.ENUM('producto', 'servicio'),
        allowNull: false,
        defaultValue: 'producto'
    },
    disponible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    imagen: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
    },
    proveedor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: { model: 'Personas', key: 'id_persona' }
    },
    capacidad_maxima: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    },
    dias_anticipacion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    dias_disponibles: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
    },
    horario_inicio: {
        type: DataTypes.STRING(5),
        allowNull: true,
        defaultValue: null
    },
    horario_fin: {
        type: DataTypes.STRING(5),
        allowNull: true,
        defaultValue: null
    },
    precios_tramos: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
    },
    descuento_cantidad_min: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
    },
    descuento_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: null
    }
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'ServiciosAdicionales',
    timestamps: false
});

export default ServicioAdicional;
