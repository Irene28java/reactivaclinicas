const OTP_STORE = new Map();

function sendOTP(email) {
    const otp = Math.floor(100000 + Math.random() * 900000);
    OTP_STORE.set(email, otp);
    return otp;
}

function verifyOTP(email, code) {
    if (OTP_STORE.get(email) != code) {
        throw new Error("Invalid OTP");
    }
}

module.exports = { sendOTP, verifyOTP };