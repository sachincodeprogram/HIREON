// Server (Render) UTC me chalta hai — "aaj", "is hafte", "is mahine" hamesha India ke
// time (IST, UTC+5:30) se ginna hai. Pehle new Date().setHours(0) UTC midnight deta tha,
// yaani raat 12 se subah 5:30 tak ki deliveries pichhle din me gin jaati thi.
const IST_OFFSET_MS = 330 * 60 * 1000;

// IST ke din/hafte/mahine ki shuruaat — return Date (UTC instant)
const istStarts = (now = new Date()) => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS); // getUTC* ab IST ke hisaab se
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), d = ist.getUTCDate();
  const toUtc = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd) - IST_OFFSET_MS);
  return {
    today: toUtc(y, m, d),
    week:  toUtc(y, m, d - ist.getUTCDay()), // Sunday se, purane behaviour jaisa
    month: toUtc(y, m, 1),
  };
};

module.exports = { istStarts };
