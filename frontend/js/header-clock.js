// HEADER CLOCK + GREETING — local time/timezone, no server round-trip.
(function () {
  const clockEl = document.getElementById('live-clock');
  const dateEl = document.getElementById('live-date');
  function tick() {
    const now = new Date();
    if (clockEl) clockEl.textContent = now.toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    if (dateEl) dateEl.textContent = now.toLocaleDateString(navigator.language, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);
})();

(function () {
  const greetingEl = document.getElementById('greeting');
  if (!greetingEl) return;
  const h = new Date().getHours();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const GREETINGS = {
    predawn: ['Still awake?', 'Burning the midnight oil', 'The world is asleep', 'Just you and the dark', 'Night owl mode'],
    morning: ['Good morning', 'Rise and shine', 'Morning', 'Early bird', 'Morning vibes', "Let's get into it"],
    midday: ['Good midday', 'High noon', 'Lunch break?', 'Midday check-in'],
    afternoon: ['Good afternoon', 'Afternoon', 'Hope the day is going well', 'Afternoon vibes'],
    evening: ['Good evening', 'Evening', 'Wind-down time', 'Evening vibes'],
    night: ['Up late?', 'Late-night streaming', 'Night mode', 'Still going?', 'Night owl'],
  };
  const range = h < 6 ? 'predawn' : h < 11 ? 'morning' : h < 13 ? 'midday' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  greetingEl.textContent = pick(GREETINGS[range]);
})();
