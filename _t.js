"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reembolso_service_1 = require("./src/services/reembolso.service");
const hoy = new Date('2026-07-06');
const ev = (d) => new Date(2026, 6, 6 + d);
const cs = [
    ['voluntaria 90d', (0, reembolso_service_1.calcularReembolso)({ montoAbonado: 100000, fechaEvento: ev(90), motivo: 'voluntaria', hoy })],
    ['voluntaria 20d', (0, reembolso_service_1.calcularReembolso)({ montoAbonado: 100000, fechaEvento: ev(20), motivo: 'voluntaria', hoy })],
    ['voluntaria 3d', (0, reembolso_service_1.calcularReembolso)({ montoAbonado: 100000, fechaEvento: ev(3), motivo: 'voluntaria', hoy })],
    ['fuerza_mayor 3d', (0, reembolso_service_1.calcularReembolso)({ montoAbonado: 100000, fechaEvento: ev(3), motivo: 'fuerza_mayor', hoy })],
    ['arrep compra-3d', (0, reembolso_service_1.calcularReembolso)({ montoAbonado: 100000, fechaEvento: ev(40), fechaCompra: new Date('2026-07-03'), motivo: 'arrepentimiento', hoy })],
    ['arrep compra-20d', (0, reembolso_service_1.calcularReembolso)({ montoAbonado: 100000, fechaEvento: ev(40), fechaCompra: new Date('2026-06-16'), motivo: 'arrepentimiento', hoy })],
];
for (const [n, r] of cs)
    console.log(n.padEnd(18), r.porcentaje_reembolso + '%', '->', r.monto_reembolso, '|', r.tramo);
