const crypto = require("crypto");

function generateReferenceId(userId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(3).toString("hex"); // 6 hex chars
    return `SUB-${userId.toString().slice(-6)}-${timestamp}-${random}`;
}

module.exports = generateReferenceId;