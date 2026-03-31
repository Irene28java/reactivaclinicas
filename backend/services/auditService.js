function logAction(db, company_id, action, ip) {
    db.run(
        `INSERT INTO audit_logs (company_id, action, ip, created_at)
         VALUES (?,?,?,?)`,
        [company_id, action, ip, new Date().toISOString()]
    );
}

module.exports = { logAction };