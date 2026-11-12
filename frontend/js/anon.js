// Username anonymization — behavior is admin-controlled (site.anonymizeUsers:
// 'optional' | 'always' | 'never'), not just a client-side preference. In
// 'optional' mode names are masked by default, and
// each visitor's own browser can flip it off for themselves. 'always'/'never'
// force the behavior with no visitor toggle shown anywhere.
const ANON_NAMES = [
  'Someone', 'A Friend', 'Your Neighbor', 'A Mystery Guest', 'An Anonymous Pal',
  'Captain Hook', 'Darth Vader', 'Shrek', 'Gandalf the Grey',
  'The Undertaker', 'SpongeBob', 'Mickey Mouse', 'Santa Claus', 'The Rock',
  'Nicolas Cage', 'Walter White', 'Tony Stark', 'Lord Voldemort', 'The Joker',
  'A Furious Gamer', 'A Night Owl', 'Definitely Not a Robot', 'Big Brother',
  'A Time Traveler', 'The Mandalorian', 'The Illuminati',
  'A Suspicious Person', 'Your Secret Admirer', 'An Area 51 Escapee',
  'A Retired Pirate', 'The Ghost of Netflix Past', 'A Concerned Parent',
  'Bigfoot', 'The Loch Ness Monster', 'A Sentient Toaster', 'A Flat Earther',
  'The Sleep Police', 'A Professional Procrastinator', 'Future You',
  'A Raccoon in a Trench Coat', 'An Undercover Otter', 'Count Dracula',
  'A Caffeinated Wizard', 'Your Accountant', "Schrödinger's Cat",
  'A Disgruntled Elf', 'The Algorithm', 'Wednesday Addams',
  'John Wick', 'Baby Yoda', 'Doc Brown', 'Sherlock Holmes',
  'Spider-Man', 'The Grinch', 'Gollum', 'Harry Potter', 'Batman',
  'Neo', 'A Possum on the Roof', 'A Highly Trained Pigeon',
  'The Mothman', 'A Capybara with a Plan', 'An Agitated Squirrel',
  'The IT Support Guy', 'The Landlord', 'A Judgmental Cat',
  'The Delivery Driver', 'Your Wi-Fi Router', 'The Ghost of Blockbuster',
  'A Disgruntled Data Center Employee', 'A Low-Battery Warning',
  'An Unpaid Intern', 'The Sock Monster', 'The Cryptkeeper',
  'A Microwave at 3 AM', "The Guy Behind You", 'A Highly Suspicious Alpaca',
];

let anonMode = 'optional';
let visitorOverride = null; // null = follow default; true/false = explicit visitor choice (only meaningful in 'optional' mode)
const _anonCache = new Map();

document.addEventListener('marquee:config', (e) => {
  anonMode = e.detail.anonymizeUsers || 'optional';
  if (anonMode === 'optional') {
    try {
      const stored = localStorage.getItem('marquee-anon');
      if (stored !== null) visitorOverride = stored === '1';
    } catch {}
  }
});

function isAnonMode() {
  if (anonMode === 'always') return true;
  if (anonMode === 'never') return false;
  return visitorOverride !== null ? visitorOverride : true; // optional defaults to masked
}

function anonToggleAvailable() {
  return anonMode === 'optional';
}

function toggleAnonMode() {
  if (!anonToggleAvailable()) return isAnonMode();
  visitorOverride = !isAnonMode();
  try { localStorage.setItem('marquee-anon', visitorOverride ? '1' : '0'); } catch {}
  clearAnonCache();
  document.dispatchEvent(new CustomEvent('marquee:anon-changed'));
  return visitorOverride;
}

function anonName() {
  return ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)];
}

// Stable pseudo-name per real username for the current session, so the same
// person shows consistently until the mode/cache is reset.
function maskedUser(realUser) {
  if (!isAnonMode()) return realUser;
  if (!_anonCache.has(realUser)) _anonCache.set(realUser, anonName());
  return _anonCache.get(realUser);
}

function clearAnonCache() {
  _anonCache.clear();
}
