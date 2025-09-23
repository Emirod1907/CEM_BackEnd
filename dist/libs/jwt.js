"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function generateToken(payload) {
    return new Promise((resolve, reject) => {
        jsonwebtoken_1.default.sign(payload, 'secret123', { expiresIn: "15m" }, (err, token) => {
            if (err) {
                return reject(err);
            }
            ;
            if (!token) {
                return reject(new Error("Token generation failed"));
            }
            resolve(token);
        });
    });
}
function verifyToken(token) {
    return new Promise((resolve, reject) => {
        jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret123', (err, decoded) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(decoded);
        });
    });
}
