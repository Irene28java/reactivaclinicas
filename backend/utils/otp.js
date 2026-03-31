function generateOTP(){
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { generateOTP };

createTenantIfNotExists(email, (err, tenantId) => {
  if (err) return res.status(500).json({ error: "Tenant error" });

  const token = jwt.sign(
    {
      email,
      tenant_id: tenantId
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return res.json({ token, tenant_id: tenantId });
});