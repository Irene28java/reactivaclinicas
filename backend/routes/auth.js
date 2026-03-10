const express = require('express');
const router = express.Router();

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

// Registro
router.post('/register', async (req,res)=>{
  const { clinic_name,email,password,plan } = req.body;
  if(!clinic_name || !email || !password)
    return res.status(400).json({error:"Todos los campos son obligatorios"});
  if(password.length<8)
    return res.status(400).json({error:"La contraseña debe tener al menos 8 caracteres"});
  try{
    const hash = await bcrypt.hash(password,10);
    db.run(`INSERT INTO users (clinic_name,email,password,plan,created_at) VALUES (?,?,?,?,?)`,
      [clinic_name.trim(),email.toLowerCase().trim(),hash,plan||"basic",new Date().toISOString()],
      function(err){
        if(err){
          if(err.message.includes('UNIQUE')) return res.status(400).json({error:"Email ya registrado"});
          return res.status(500).json({error:"Error interno"});
        }
        res.json({success:true,user_id:this.lastID});
      });
  }catch(e){ res.status(500).json({error:"Error interno"}) }
});

// Login
router.post('/login', (req,res)=>{
  const { email,password } = req.body;
  if(!email||!password) return res.status(400).json({error:"Email y contraseña obligatorios"});
  db.get(`SELECT * FROM users WHERE email=?`, [email.toLowerCase().trim()], async (err,user)=>{
    if(err) return res.status(500).json({error:"Error interno"});
    if(!user) return res.status(400).json({error:"Email o contraseña incorrectos"});
    const valid = await bcrypt.compare(password,user.password);
    if(!valid) return res.status(400).json({error:"Email o contraseña incorrectos"});
    const token = jwt.sign({id:user.id,clinic_name:user.clinic_name,plan:user.plan}, process.env.JWT_SECRET, {expiresIn:"7d"});
    res.json({token,clinic_name:user.clinic_name,plan:user.plan});
  });
});

// Perfil
router.get('/me', require('../middleware/auth'), (req,res)=>{
  db.get(`SELECT id,clinic_name,email,plan,created_at FROM users WHERE id=?`, [req.user.id], (err,user)=>{
    if(err || !user) return res.status(404).json({error:"Usuario no encontrado"});
    res.json(user);
  });
});

module.exports = router;