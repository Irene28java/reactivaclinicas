//backend>middleware.auth.js
const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token no proporcionado" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch(err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Sesión expirada, vuelve a iniciar sesión" });
        }
        res.status(401).json({ error: "Token inválido" });
    }
};