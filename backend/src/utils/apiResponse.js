const success = (message, data = null) => ({ success: true, message, data });
const error   = (message, data = null) => ({ success: false, message, data });

module.exports = { success, error };
