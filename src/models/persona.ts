import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'
import * as bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10;

interface PersonaAtributos {
    id_persona?:number;
    nombre: string,
    apellido: string,
    dni:string,
    fecha_nacimiento: Date,
    email: string,
    nombre_usuario: string,
    user_password:string
}

class Persona extends Model<PersonaAtributos> implements PersonaAtributos {
    declare id_persona: number;
    declare nombre: string;
    declare apellido: string;
    declare dni: string;
    declare fecha_nacimiento: Date;
    declare email: string;
    declare nombre_usuario: string;
    declare user_password: string;
}

Persona.init({
    id_persona:{
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
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
        allowNull: false,
        validate: {
            len: [ 7, 10 ],
            isNumeric: true
        }
    },
    fecha_nacimiento:{
        type: DataTypes.DATE,
        allowNull: false
    },
    email:{
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail:true }

    },
    nombre_usuario:{
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    user_password:{
        type:DataTypes.STRING(60),
        allowNull: false,
                validate:{

            isStrongPassword(value:string){
                if(value.length <8){
                    throw new Error('La contraseña debe contener mas de 8 caracteres')
                }
                if(!/[A-Z]/.test(value)){
                    throw new Error('La contraseña debe contener una mayúscula');
                }
                if(!/[1-9]/.test(value)){
                    throw new Error("La contraseña debe contener números");        
                }
            }
        }
    }
},{
        sequelize:db,
        freezeTableName: true,
        modelName:'Personas',
        timestamps: true
    }
);

Persona.beforeSave( async (persona)=>{
    if(persona.changed('user_password')){
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        persona.user_password = await bcrypt.hash(persona.user_password, salt)
    }    
});

export default Persona;