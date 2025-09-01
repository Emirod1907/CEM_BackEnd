"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const connection_1 = __importDefault(require("../db/connection"));
const persona_1 = __importDefault(require("./persona"));
class Cliente extends sequelize_1.Model {
}
Cliente.init({
    id_cliente: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    domicilio: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    telefono: {
        type: sequelize_1.DataTypes.BIGINT,
        allowNull: false
    }
}, {
    sequelize: connection_1.default,
    tableName: 'clientes'
});
Cliente.belongsTo(persona_1.default, { foreignKey: 'persona_id' });
exports.default = Cliente;
