"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const jwt_1 = require("../libs/jwt");
const authRequired = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.cookies;
        if (!token) {
            return res.status(401).json({ message: "Unauthorized - No token provided" });
        }
        const decoded = yield (0, jwt_1.verifyToken)(token);
        req.persona = decoded;
        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Token expired" });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: "Invalid token" });
        }
        return res.status(500).json({ message: "Internal server error" });
    }
});
exports.default = authRequired;
