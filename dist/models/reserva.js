"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const connection_1 = __importDefault(require("../db/connection"));
const evento_1 = __importDefault(require("./evento"));
const bodega_1 = __importDefault(require("./bodega"));
class Reserva extends sequelize_1.Model {
}
;
Reserva.init({
    fecha: sequelize_1.DataTypes.DATE
}, {
    sequelize: connection_1.default,
    tableName: 'reservas'
});
Reserva.belongsTo(evento_1.default, { foreignKey: 'evento_id' });
Reserva.belongsTo(bodega_1.default, { foreignKey: 'bodega_id' });
exports.default = Reserva;
