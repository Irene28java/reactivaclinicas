//backend>routes>pagos.js
const express = require("express");
const router = express.Router();
const db = require("../database");
const auth = require("../middleware/auth");

// Crear pago
router.post("/", auth, (req,res)=>{
    const {amount,plan,paypal_order_id} = req.body;
    const clinic_id = req.user.id;
    db.run(`INSERT INTO pagos (clinic_id,email,amount,plan,paypal_order_id,created_at) VALUES (?,?,?,?,?,?)`,
        [clinic_id,email,amount,plan,paypal_order_id,new Date().toISOString()],
        function(err){
            if(err) return res.status(500).json({error:"Error guardando pago"});
            res.json({success:true,id:this.lastID});
        }
    );
});

// Obtener pagos de la clínica
router.get("/", auth, (req,res)=>{
    db.all(`SELECT * FROM pagos WHERE clinic_id=? ORDER BY id DESC`, [req.user.id], (err,rows)=>{
        if(err) return res.status(500).json({error:"Error cargando pagos"});
        res.json(rows);
    });
});

module.exports = router;