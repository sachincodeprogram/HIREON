// Simulate a rider's live GPS for an accepted order so the CUSTOMER
// LiveTracking screen shows the moving marker + blue route + ETA.
// Usage: node _rider_sim.js <orderId>
const { io } = require('socket.io-client');

const ORDER_ID = process.argv[2];
if (!ORDER_ID) { console.error('Pass orderId'); process.exit(1); }

const RIDER_TOKEN = 'dev:+917017696580'; // SACHIN SAINI (rider)
const PICKUP = { lat: 28.6315, lng: 77.2167 }; // Connaught Place
const START  = { lat: 28.6470, lng: 77.2020 }; // ~2.2 km NW of pickup

const socket = io('http://localhost:5000', {
  auth: { token: RIDER_TOKEN },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('rider socket connected', socket.id);
  socket.emit('join_order', ORDER_ID);

  const STEPS = 40;
  let i = 0;
  const timer = setInterval(() => {
    const t = i / STEPS;
    const lat = START.lat + (PICKUP.lat - START.lat) * t;
    const lng = START.lng + (PICKUP.lng - START.lng) * t;
    const heading = 135;
    socket.emit('rider_location', { orderId: ORDER_ID, lat, lng, heading });
    console.log(`emit ${i}/${STEPS}  ${lat.toFixed(5)},${lng.toFixed(5)}`);
    i++;
    if (i > STEPS) { clearInterval(timer); console.log('done'); socket.disconnect(); process.exit(0); }
  }, 1500);
});

socket.on('connect_error', (e) => console.error('connect_error', e.message));
