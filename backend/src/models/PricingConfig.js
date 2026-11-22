const mongoose = require('mongoose');

// Admin panel se badalne wala rate card + commission. Ek hi document (key: 'default').
// Har save par version +1 hota hai aur PricingChange me purana/naya dono snapshot jaata hai.
const slabSchema = new mongoose.Schema({
  upToKm:    { type: Number, default: null }, // null = aakhri slab (isse upar sab)
  perKmRate: { type: Number, required: true },
}, { _id: false });

const pricingFields = {
  baseFare:          { type: Number, required: true },
  minDistanceKm:     { type: Number, required: true },
  slabs:             { type: [slabSchema], required: true },
  weightLimitKg:     { type: Number, required: true },
  weightRate:        { type: Number, required: true },
  fragileCharge:     { type: Number, required: true },
  sizeCharges: {
    small:  { type: Number, required: true },
    medium: { type: Number, required: true },
    large:  { type: Number, required: true },
  },
  stopCharge:        { type: Number, default: 20 }, // har extra stop par
  nightEnabled:      { type: Boolean, required: true },
  nightMultiplier:   { type: Number, required: true },
  nightStartHour:    { type: Number, required: true }, // IST
  nightEndHour:      { type: Number, required: true }, // IST
  commissionPercent: { type: Number, required: true },
};

const pricingConfigSchema = new mongoose.Schema({
  key:     { type: String, default: 'default', unique: true },
  version: { type: Number, default: 1 },
  ...pricingFields,
}, { timestamps: true });

const PricingConfig = mongoose.model('PricingConfig', pricingConfigSchema);

const pricingChangeSchema = new mongoose.Schema({
  version:  { type: Number, required: true },
  previous: { type: Object, default: null },
  config:   { type: Object, required: true },
  note:     { type: String, default: '' },
  ip:       { type: String, default: '' },
}, { timestamps: true });
pricingChangeSchema.index({ createdAt: -1 });

const PricingChange = mongoose.model('PricingChange', pricingChangeSchema);

module.exports = { PricingConfig, PricingChange };
