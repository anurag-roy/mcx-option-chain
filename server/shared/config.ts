// Multiplier (to be multiplied with premium to get return value)
// GOLD => 100
// GOLDM => 10
// SILVER => 30
// SILVERM => 5
// CRUDEOILM => 10
// CRUDEOIL => 100
// NATGASMINI => 250
// NATGAS => 1250
// COPPER => 2500
// ZINC => 5000

export const CONFIG = {
  GOLD: { vix: '^GVZ', bidBalance: 0.5, multiplier: 100 },
  GOLDM: { vix: '^GVZ', bidBalance: 0.5, multiplier: 10 },
  SILVER: { vix: '^VXSLV', bidBalance: 0.5, multiplier: 30 },
  SILVERM: { vix: '^VXSLV', bidBalance: 0.5, multiplier: 5 },
  CRUDEOIL: { vix: '^OVX', bidBalance: 0.05, multiplier: 100 },
  CRUDEOILM: { vix: '^OVX', bidBalance: 0.05, multiplier: 10 },
  NATURALGAS: { vix: 62, bidBalance: 0.05, multiplier: 1250 },
  NATGASMINI: { vix: 62, bidBalance: 0.05, multiplier: 250 },
  COPPER: { vix: 49, bidBalance: 0.01, multiplier: 2500 },
  ZINC: { vix: 25, bidBalance: 0.01, multiplier: 5000 },
};
