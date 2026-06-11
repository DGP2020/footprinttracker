/**
 * @fileoverview EcoStep — Emission factors and Kerala district data.
 * All emission factors are sourced from IPCC guidelines, Indian transport
 * studies, KSRTC operational reports, and CEA grid emission data.
 *
 * @namespace EcoStep.Data
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /* ─── Transport Mode Definitions ─── */

  /**
   * @typedef {Object} TransportMode
   * @property {string} label  - Human-readable name
   * @property {number} factor - kg CO₂ per km
   * @property {string} icon   - Emoji icon
   */

  /** @type {Object<string, TransportMode>} */
  const TRANSPORT_MODES = {
    walking:              { label: 'Walking',               factor: 0.000, icon: '🚶' },
    cycling:              { label: 'Cycling',               factor: 0.000, icon: '🚲' },
    kochi_metro:          { label: 'Kochi Metro',           factor: 0.020, icon: '🚇' },
    water_metro:          { label: 'Water Metro / Ferry',   factor: 0.025, icon: '⛴️' },
    city_bus:             { label: 'City Bus / KSRTC',      factor: 0.030, icon: '🚌' },
    two_wheeler:          { label: 'Two-wheeler (Petrol)',   factor: 0.050, icon: '🛵' },
    auto_rickshaw_cng:    { label: 'Auto-rickshaw (CNG)',   factor: 0.080, icon: '🛺' },
    auto_rickshaw_petrol: { label: 'Auto-rickshaw (Petrol)', factor: 0.100, icon: '🛺' },
    car_petrol:           { label: 'Car (Petrol)',          factor: 0.150, icon: '🚗' },
    car_diesel:           { label: 'Car (Diesel)',          factor: 0.170, icon: '🚗' },
    jeep_suv:             { label: 'Jeep / SUV',           factor: 0.220, icon: '🚙' },
    houseboat_ferry:      { label: 'Houseboat / Ferry',    factor: 0.035, icon: '🚢' }
  };

  /* ─── Diet Type Definitions ─── */

  /**
   * @typedef {Object} DietType
   * @property {string} label  - Human-readable name
   * @property {number} factor - kg CO₂ per meal
   * @property {string} icon   - Emoji icon
   */

  /** @type {Object<string, DietType>} */
  const DIET_TYPES = {
    vegan:      { label: 'Vegan Meal',           factor: 0.3, icon: '🥬' },
    vegetarian: { label: 'Vegetarian Meal',      factor: 0.5, icon: '🥗' },
    fish:       { label: 'Fish / Seafood Meal',  factor: 1.2, icon: '🐟' },
    chicken:    { label: 'Chicken Meal',         factor: 1.5, icon: '🍗' },
    beef:       { label: 'Beef / Mutton Meal',   factor: 5.0, icon: '🥩' }
  };

  /* ─── Energy Type Definitions ─── */

  /**
   * @typedef {Object} EnergyType
   * @property {string} label  - Human-readable name
   * @property {number} factor - kg CO₂ per unit
   * @property {string} unit   - Measurement unit
   * @property {string} icon   - Emoji icon
   */

  /** @type {Object<string, EnergyType>} */
  const ENERGY_TYPES = {
    electricity: { label: 'Electricity (KSEB)', factor: 0.82,  unit: 'kWh',   icon: '⚡' },
    lpg:         { label: 'LPG Cooking Gas',    factor: 2.98,  unit: 'kg',    icon: '🔥' },
    ac:          { label: 'Air Conditioning',    factor: 1.00,  unit: 'hours', icon: '❄️' }
  };

  /* ─── Kerala District Definitions ─── */

  /**
   * @typedef {Object} District
   * @property {string}   name           - Full display name
   * @property {string[]} transportModes - Available transport mode keys
   * @property {string}   landmark       - Iconic local reference for comparisons
   * @property {number}   landmarkDist   - Approximate distance of landmark route (km)
   */

  /** @type {Object<string, District>} */
  const DISTRICTS = {
    thiruvananthapuram: {
      name: 'Thiruvananthapuram',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Kovalam to East Fort',
      landmarkDist: 16
    },
    kollam: {
      name: 'Kollam',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel', 'houseboat_ferry'
      ],
      landmark: 'Kollam Beach to Ashtamudi Lake',
      landmarkDist: 5
    },
    pathanamthitta: {
      name: 'Pathanamthitta',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Pathanamthitta town to Sabarimala base',
      landmarkDist: 65
    },
    alappuzha: {
      name: 'Alappuzha',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel', 'houseboat_ferry'
      ],
      landmark: 'Alappuzha Beach to Kumarakom',
      landmarkDist: 30
    },
    kottayam: {
      name: 'Kottayam',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Kottayam town to Kumarakom',
      landmarkDist: 14
    },
    idukki: {
      name: 'Idukki',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel', 'jeep_suv'
      ],
      landmark: 'Munnar to Top Station',
      landmarkDist: 32
    },
    ernakulam: {
      name: 'Ernakulam (Kochi)',
      transportModes: [
        'walking', 'cycling', 'kochi_metro', 'water_metro', 'city_bus',
        'auto_rickshaw_cng', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Aluva Metro to Pettah',
      landmarkDist: 25
    },
    thrissur: {
      name: 'Thrissur',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Thrissur Round to Guruvayur',
      landmarkDist: 29
    },
    palakkad: {
      name: 'Palakkad',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Palakkad Fort to Malampuzha Dam',
      landmarkDist: 12
    },
    malappuram: {
      name: 'Malappuram',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Manjeri to Nilambur',
      landmarkDist: 40
    },
    kozhikode: {
      name: 'Kozhikode',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Kozhikode Beach to Kappad',
      landmarkDist: 16
    },
    wayanad: {
      name: 'Wayanad',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel', 'jeep_suv'
      ],
      landmark: 'Kalpetta to Edakkal Caves',
      landmarkDist: 12
    },
    kannur: {
      name: 'Kannur',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Kannur town to Payyambalam Beach',
      landmarkDist: 3
    },
    kasaragod: {
      name: 'Kasaragod',
      transportModes: [
        'walking', 'cycling', 'city_bus', 'auto_rickshaw_petrol',
        'two_wheeler', 'car_petrol', 'car_diesel'
      ],
      landmark: 'Kasaragod town to Bekal Fort',
      landmarkDist: 16
    }
  };

  /* ─── Security Questions ─── */

  /** @type {Array<{id: string, question: string}>} */
  const SECURITY_QUESTIONS = [
    { id: 'q1', question: 'What is your mother\'s maiden name?' },
    { id: 'q2', question: 'What was the name of your first school?' },
    { id: 'q3', question: 'What is your favourite movie?' },
    { id: 'q4', question: 'What is the name of your hometown?' },
    { id: 'q5', question: 'What was your childhood nickname?' }
  ];

  /* ─── Benchmarks ─── */

  /** India national average daily CO₂ per person (kg) */
  const NATIONAL_AVG_DAILY = 5.0;

  /** Default daily target (kg CO₂) */
  const DEFAULT_DAILY_TARGET = 4.0;

  /** Session timeout in milliseconds (14 days) */
  const SESSION_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;

  /** Max PIN attempts before lockout */
  const MAX_PIN_ATTEMPTS = 5;

  /** Lockout duration in milliseconds (60 seconds) */
  const LOCKOUT_DURATION_MS = 60 * 1000;

  /* ─── Public API ─── */

  /**
   * Get available transport modes for a district.
   * @param {string} districtId - District key
   * @returns {TransportMode[]} Array of transport mode objects
   */
  function getDistrictTransportModes(districtId) {
    var district = DISTRICTS[districtId];
    if (!district) { return []; }
    return district.transportModes.map(function(modeId) {
      return Object.assign({ id: modeId }, TRANSPORT_MODES[modeId]);
    });
  }

  /**
   * Calculate CO₂ emission for a given activity.
   * @param {'transport'|'diet'|'energy'} category - Activity category
   * @param {string} type  - Mode/type key within the category
   * @param {number} amount - Numeric amount (km, meals, kWh, etc.)
   * @returns {number} CO₂ in kg, rounded to 3 decimal places
   * @throws {Error} If category or type is invalid
   */
  function calculateEmission(category, type, amount) {
    if (typeof amount !== 'number' || amount < 0) { return 0; }

    var factor = 0;
    switch (category) {
      case 'transport':
        if (TRANSPORT_MODES[type]) { factor = TRANSPORT_MODES[type].factor; }
        break;
      case 'diet':
        if (DIET_TYPES[type]) { factor = DIET_TYPES[type].factor; }
        break;
      case 'energy':
        if (ENERGY_TYPES[type]) { factor = ENERGY_TYPES[type].factor; }
        break;
      default:
        throw new Error('Invalid category: ' + category);
    }

    return Math.round(factor * amount * 1000) / 1000;
  }

  /**
   * Generate a relatable comparison string for a CO₂ amount.
   * @param {number} kgCO2     - Amount in kg CO₂
   * @param {string} districtId - District key
   * @returns {string} Human-readable comparison
   */
  function getComparison(kgCO2, districtId) {
    var district = DISTRICTS[districtId];
    if (!district) { return ''; }

    var autoMode = TRANSPORT_MODES.auto_rickshaw_petrol;
    var autoTrips = kgCO2 / (autoMode.factor * district.landmarkDist);

    if (autoTrips < 0.1) {
      return 'Less than a short auto ride!';
    }
    return '≈ ' + autoTrips.toFixed(1) + ' auto rides from ' + district.landmark;
  }

  /**
   * Get all districts as a sorted array for dropdowns.
   * @returns {Array<{id: string, name: string}>}
   */
  function getDistrictList() {
    return Object.keys(DISTRICTS)
      .map(function(id) {
        return { id: id, name: DISTRICTS[id].name };
      })
      .sort(function(a, b) {
        return a.name.localeCompare(b.name);
      });
  }

  /**
   * Format a date as YYYY-MM-DD.
   * @param {Date} date
   * @returns {string}
   */
  function formatDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  /**
   * Format a date for display (e.g., "Jun 11, 2026").
   * @param {Date} date
   * @returns {string}
   */
  function formatDateDisplay(date) {
    var months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  /* ─── Export ─── */

  window.EcoStep.Data = {
    TRANSPORT_MODES: TRANSPORT_MODES,
    DIET_TYPES: DIET_TYPES,
    ENERGY_TYPES: ENERGY_TYPES,
    DISTRICTS: DISTRICTS,
    SECURITY_QUESTIONS: SECURITY_QUESTIONS,
    NATIONAL_AVG_DAILY: NATIONAL_AVG_DAILY,
    DEFAULT_DAILY_TARGET: DEFAULT_DAILY_TARGET,
    SESSION_TIMEOUT_MS: SESSION_TIMEOUT_MS,
    MAX_PIN_ATTEMPTS: MAX_PIN_ATTEMPTS,
    LOCKOUT_DURATION_MS: LOCKOUT_DURATION_MS,
    getDistrictTransportModes: getDistrictTransportModes,
    calculateEmission: calculateEmission,
    getComparison: getComparison,
    getDistrictList: getDistrictList,
    formatDate: formatDate,
    formatDateDisplay: formatDateDisplay
  };

})();
