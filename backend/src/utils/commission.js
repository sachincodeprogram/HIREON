// Commission ab admin panel ke pricing config se aata hai (utils/pricing.js).
// Har naye order par us waqt ka commission snapshot (fare.commission) save hota hai —
// settlement wahi use karta hai. Wallet floor abhi bhi .env se.
const { getPricing } = require('./pricing');

const DEFAULT_WALLET_MIN_BALANCE_PAISE = -50000; // -₹500

async function commissionPercent() {
  return (await getPricing()).commissionPercent;
}

// farePaise ko platform commission aur rider ke net earning me todta hai.
function splitFareForCommission(farePaise, percent) {
  const commissionPaise = Math.round((farePaise * percent) / 100);
  return { commissionPaise, riderNetPaise: farePaise - commissionPaise };
}

// Order ka commission (paise): snapshot ho to wahi (rider ne accept karte waqt yahi kamai
// dekhi thi), warna purana order — aaj ke rate se.
async function orderCommissionSplit(order) {
  const farePaise = Math.round((order.fare?.final || order.fare?.estimated || 0) * 100);
  const snap = order.fare?.commission;
  if (typeof snap === 'number' && order.fare.final === order.fare.estimated) {
    const commissionPaise = Math.min(Math.round(snap * 100), farePaise);
    return { farePaise, commissionPaise, riderNetPaise: farePaise - commissionPaise };
  }
  const pct = typeof order.fare?.commissionPercent === 'number' ? order.fare.commissionPercent : await commissionPercent();
  return { farePaise, ...splitFareForCommission(farePaise, pct) };
}

// Wallet balance is floor (paise) se neeche jaaye to rider naye COD orders
// accept nahi kar sakta jab tak recharge na kare.
function walletMinBalancePaise() {
  const v = Number(process.env.WALLET_MIN_BALANCE_PAISE);
  return Number.isFinite(v) ? v : DEFAULT_WALLET_MIN_BALANCE_PAISE;
}

module.exports = { commissionPercent, splitFareForCommission, orderCommissionSplit, walletMinBalancePaise };
