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
    fecha_nacimiento?: Date,
    email: string,
    nombre_usuario?: string,
    user_password?: string,
    rol_id?: number,
    perfil_completado?: boolean,
    categoria_servicio?: string,
    google_calendar_token?: string | null,
    google_calendar_id?: string | null
}

class Persona extends Model<PersonaAtributos> implements PersonaAtributos {
    declare id_persona: number;
    declare google_id: string;
    declare nombre: string;
    declare apellido: string;
    declare dni: string;
    declare fecha_nacimiento: Date;
    declare email: string;
    declare nombre_usuario: string;
    declare user_password: string;
    declare rol_id: number;
    declare perfil_completado: boolean;
    declare categoria_servicio: string;
    declare google_calendar_token: string | null;
    declare google_calendar_id: string | null;
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