"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const persona_controller_1 = require("../controllers/persona.controller");
const auth_controller_1 = require("../controllers/auth.controller");
const router = (0, express_1.Router)();
router.post('/debug', (req, res) => {
    console.log("Headers recibidos:", req.headers);
    console.log("Cuerpo parseado:", req.body);
    console.log("Cuerpo en bruto:", req.rawBody);
    res.json({
        headers: req.headers,
        parsedBody: req.body,
        rawBody: req.rawBody
    });
});
router.post('/register', (req, res) => {
    console.log("Register body:", req.body);
    (0, auth_controller_1.register)(req, res);
});
router.post('/login', auth_controller_1.login);
router.post('/logout', auth_controller_1.logout);
router.get('/', persona_controller_1.getPersonas);
router.get('/:id', persona_controller_1.getPersona);
router.post('/', persona_controller_1.postPersona);
router.put('/:id', persona_controller_1.putPersona);
router.delete('/:id', persona_controller_1.deletePersona);
exports.default = router;
