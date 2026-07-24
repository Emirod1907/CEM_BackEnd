import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'
import * as bcrypt from 'bcryptjs'
import Rol from './rol'

const SALT_ROUNDS = 10;

interface PersonaAtributos {
    id_persona?:number;
    google_id?: string;
    nombre: string,
    apellido: string,
    dni?: string,
    cuit?: string,
    celular?: string,
    fecha_nacimiento?: Date,
    email: string,
    nombre_usuario?: string,
    user_password?: string,
    rol_id?: number,
    perfil_completado?: boolean,
    categoria_servicio?: string,
    google_calendar_token?: string | null,
    google_calendar_id?: string | null,
    // MercadoPago Marketplace (vendedor: dueño de salón / proveedor)
    mp_access_token?: string | null,   // cifrado
    mp_refresh_token?: string | null,  // cifrado
    mp_user_id?: string | null         // collector_id del vendedor
}

class Persona extends Model<PersonaAtributos> implements PersonaAtributos {
    declare id_persona: number;
    declare google_id: string;
    declare nombre: string;
    declare apellido: string;
    declare dni: string;
    declare cuit: string;
    declare celular: string;
    declare fecha_nacimiento: Date;
    declare email: string;
    declare nombre_usuario: string;
    declare user_password: string;
    declare rol_id: number;
    declare perfil_completado: boolean;
    declare categoria_servicio: string;
    declare google_calendar_token: string | null;
    declare google_calendar_id: string | null;
    declare mp_access_token: string | null;
    declare mp_refresh_token: string | null;
    declare mp_user_id: string | null;
}

Persona.init({
    id_persona:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    google_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    apellido: {
        type: DataTypes.STRING,
        allowNull: false
    },
    dni:{
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            dniValido(value: string | null) {
                if (value === null || value === undefined) return;
                if (!/^\d{7,10}$/.test(value)) {
                    throw new Error('El DNI debe tener entre 7 y 10 dígitos numéricos');
                }
            }
        }
    },
    cuit:{
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            cuitValido(value: string | null) {
                if (value === null || value === undefined || value === '') return;
                const soloDigitos = String(value).replace(/\D/g, '');
                if (soloDigitos.length !== 11) {
                    throw new Error('El CUIT debe tener 11 dígitos (ej. 20-12345678-9)');
                }
            }
        }
    },
    celular:{
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            celularValido(value: string | null) {
                if (value === null || value === undefined || value === '') return;
                const soloDigitos = String(value).replace(/\D/g, '');
                if (soloDigitos.length < 8 || soloDigitos.length > 15) {
                    throw new Error('El celular debe tener entre 8 y 15 dígitos');
                }
            }
        }
    },
    fecha_nacimiento:{
        type: DataTypes.DATE,
        allowNull: true
    },
    email:{
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail:true }

    },
    nombre_usuario:{
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    },
    user_password:{
        type:DataTypes.STRING(255),
        allowNull: true,
        validate:{
            isStrongPassword(value: string | null){
                if (value === null || value === undefined) return;
                if(value.length < 8){
                    throw new Error('La contraseña debe contener mas de 8 caracteres')
                }
                if(!/[A-Z]/.test(value)){
                    throw new Error('La contraseña debe contener una mayúscula');
                }
                if(!/[0-9]/.test(value)){
                    throw new Error("La contraseña debe contener números");
                }
            }
        }
    },
    rol_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Roles', key: 'id_rol' }
    },
    perfil_completado: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    categoria_servicio: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    // Google Calendar (dueño de salón): refresh_token cifrado + id del calendario destino
    google_calendar_token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    google_calendar_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // MercadoPago Marketplace (vendedor): tokens cifrados + collector_id
    mp_access_token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    mp_refresh_token: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    mp_user_id: {
        type: DataTypes.STRING,
        allowNull: true
    }
},{
        sequelize:db,
        freezeTableName: true,
        modelName:'Personas',
        timestamps: true
    }
);

Persona.belongsTo(Rol, { foreignKey: 'rol_id', as: 'Rol' });
Rol.hasMany(Persona, { foreignKey: 'rol_id', as: 'Personas' });

Persona.beforeSave( async (persona)=>{
    if(persona.changed('user_password') && persona.user_password){
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        persona.user_password = await bcrypt.hash(persona.user_password, salt)
    }
});

export default Persona;