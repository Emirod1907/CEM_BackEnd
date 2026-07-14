import { DataTypes, Model } from 'sequelize'
import db from '../db/connection'

// Pedido de torta: ficha completa de un encargo de repostería.
// Concentra en un solo lugar toda la info que hoy queda repartida entre
// mensajes, audios y fotos: detalles del diseño, pago, estado, cambios y
// política de cancelación. Se implementa por features (de a una).
interface PedidoTortaAtributos {
    id_pedido?: number;
    proveedor_id: number;                 // baker (Personas)

    // ── Cliente ──
    cliente_nombre: string;
    cliente_contacto?: string | null;     // teléfono / whatsapp / email

    // ── Entrega ──
    fecha_evento?: string | null;         // YYYY-MM-DD
    hora_entrega?: string | null;         // HH:MM
    modo_entrega?: 'entrega' | 'retiro';

    // ── Detalles de la torta ──
    personas?: number | null;
    porciones?: number | null;
    sabor?: string | null;
    rellenos?: string | null;
    cobertura?: string | null;
    colores?: string | null;
    tematica?: string | null;
    pisos?: number | null;
    detalles_diseno?: string | null;
    alergias?: string | null;             // alergias / intolerancias / pedidos especiales
    fotos_referencia?: string | null;     // JSON array de URLs

    // ── Estado (feature 4) ──
    estado?: string;

    // ── Pago (feature 3) ──
    precio_total?: number | null;
    sena_monto?: number | null;
    sena_pagada?: boolean;
    fecha_limite_pago?: string | null;    // YYYY-MM-DD

    // ── Cambios / cancelación (features 5 y 6) ──
    fecha_limite_cambios?: string | null; // YYYY-MM-DD
    desglose_precio?: string | null;      // JSON: componentes del precio (feature 8)
    cambios_log?: string | null;          // JSON: historial de cambios (feature 5)

    notas?: string | null;
    created_at?: Date;
}

class PedidoTorta extends Model<PedidoTortaAtributos> implements PedidoTortaAtributos {
    declare id_pedido: number;
    declare proveedor_id: number;
    declare cliente_nombre: string;
    declare cliente_contacto: string | null;
    declare fecha_evento: string | null;
    declare hora_entrega: string | null;
    declare modo_entrega: 'entrega' | 'retiro';
    declare personas: number | null;
    declare porciones: number | null;
    declare sabor: string | null;
    declare rellenos: string | null;
    declare cobertura: string | null;
    declare colores: string | null;
    declare tematica: string | null;
    declare pisos: number | null;
    declare detalles_diseno: string | null;
    declare alergias: string | null;
    declare fotos_referencia: string | null;
    declare estado: string;
    declare precio_total: number | null;
    declare sena_monto: number | null;
    declare sena_pagada: boolean;
    declare fecha_limite_pago: string | null;
    declare fecha_limite_cambios: string | null;
    declare desglose_precio: string | null;
    declare cambios_log: string | null;
    declare notas: string | null;
    declare created_at: Date;
}

PedidoTorta.init({
    id_pedido: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Personas', key: 'id_persona' }
    },
    cliente_nombre:   { type: DataTypes.STRING(160), allowNull: false },
    cliente_contacto: { type: DataTypes.STRING(160), allowNull: true, defaultValue: null },
    fecha_evento:     { type: DataTypes.DATEONLY, allowNull: true, defaultValue: null },
    hora_entrega:     { type: DataTypes.STRING(5), allowNull: true, defaultValue: null },
    modo_entrega:     { type: DataTypes.ENUM('entrega', 'retiro'), allowNull: false, defaultValue: 'retiro' },
    personas:         { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    porciones:        { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    sabor:            { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
    rellenos:         { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    cobertura:        { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
    colores:          { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
    tematica:         { type: DataTypes.STRING(200), allowNull: true, defaultValue: null },
    pisos:            { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
    detalles_diseno:  { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    alergias:         { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    fotos_referencia: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    estado:           { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'consulta' },
    precio_total:     { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
    sena_monto:       { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
    sena_pagada:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_limite_pago:    { type: DataTypes.DATEONLY, allowNull: true, defaultValue: null },
    fecha_limite_cambios: { type: DataTypes.DATEONLY, allowNull: true, defaultValue: null },
    desglose_precio:  { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    cambios_log:      { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    notas:            { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    created_at:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    sequelize: db,
    freezeTableName: true,
    modelName: 'PedidosTorta',
    timestamps: false,
});

export default PedidoTorta;
