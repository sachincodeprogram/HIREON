// Chhoti in-memory activity list — jo events DB me save nahi hote (rider online/offline)
// unhe admin panel ke Live Activity feed ke liye yaad rakho. Server restart par khaali
// ho jaati hai, jaan-boojh kar: live app ke DB me koi naya collection/write nahi.
const MAX_EVENTS = 500;
const events = [];

// Kabhi throw nahi karta — live request ka flow kisi haal me na toote.
const logActivity = (event) => {
  try {
    events.push({ ...event, at: new Date() });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  } catch { /* ignore */ }
};

const getActivitySince = (since) => events.filter(e => e.at >= since);

module.exports = { logActivity, getActivitySince };
