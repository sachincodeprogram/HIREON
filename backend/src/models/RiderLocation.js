const mongoose = require('mongoose');

const riderLocationSchema = new mongoose.Schema({
  rider:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  lat:     { type: Number, required: true },
  lng:     { type: Number, required: true },
  heading: { type: Number, default: 0 },
  speed:   { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('RiderLocation', riderLocationSchema);
