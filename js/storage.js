/**
 * @fileoverview EcoStep — Encrypted localStorage abstraction.
 * Uses Web Crypto API (AES-GCM + PBKDF2) when available, with
 * a simple obfuscation fallback for file:// protocol contexts.
 * All user data is namespace-isolated by userId.
 *
 * @namespace EcoStep.Storage
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /** Whether Web Crypto API is available */
  var hasCrypto = !!(window.crypto && window.crypto.subtle);

  /** @type {string|null} Current user ID */
  var currentUserId = null;

  /** @type {CryptoKey|null} AES-GCM key for current session */
  var sessionKey = null;

  /** In-memory cache to minimize localStorage reads */
  var cache = {};

  /* ═══════════════════════════════════════════
     CRYPTO HELPERS
     ═══════════════════════════════════════════ */

  /**
   * Convert string to ArrayBuffer.
   * @param {string} str
   * @returns {ArrayBuffer}
   */
  function strToBuffer(str) {
    return new TextEncoder().encode(str);
  }

  /**
   * Convert ArrayBuffer to base64 string.
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  function bufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer.
   * @param {string} base64
   * @returns {ArrayBuffer}
   */
  function base64ToBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Derive an AES-GCM key from a PIN and salt using PBKDF2.
   * @param {string} pin - User's PIN
   * @param {Uint8Array} salt - Random salt
   * @returns {Promise<CryptoKey>}
   */
  async function deriveKey(pin, salt) {
    var keyMaterial = await crypto.subtle.importKey(
      'raw', strToBuffer(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
  }

  /**
   * Generate a random Data Encryption Key (DEK).
   * @returns {Promise<CryptoKey>}
   */
  async function generateDEK() {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, ['encrypt', 'decrypt']
    );
  }

  /**
   * Wrap (encrypt) the DEK with a Key Encryption Key.
   * @param {CryptoKey} dek - Data Encryption Key
   * @param {CryptoKey} kek - Key Encryption Key (PIN or question-derived)
   * @returns {Promise<{iv: string, data: string}>} Wrapped key as base64
   */
  async function wrapDEK(dek, kek) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var wrapped = await crypto.subtle.wrapKey('raw', dek, kek, {
      name: 'AES-GCM', iv: iv
    });
    return { iv: bufferToBase64(iv), data: bufferToBase64(wrapped) };
  }

  /**
   * Unwrap (decrypt) the DEK with a Key Encryption Key.
   * @param {{iv: string, data: string}} wrappedObj
   * @param {CryptoKey} kek
   * @returns {Promise<CryptoKey>}
   */
  async function unwrapDEK(wrappedObj, kek) {
    var iv = new Uint8Array(base64ToBuffer(wrappedObj.iv));
    var data = base64ToBuffer(wrappedObj.data);
    return crypto.subtle.unwrapKey(
      'raw', data, kek,
      { name: 'AES-GCM', iv: iv },
      { name: 'AES-GCM', length: 256 },
      true, ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data with AES-GCM.
   * @param {*} data - Any JSON-serializable value
   * @param {CryptoKey} key
   * @returns {Promise<{iv: string, data: string}>}
   */
  async function encrypt(data, key) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encoded = strToBuffer(JSON.stringify(data));
    var encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, encoded
    );
    return { iv: bufferToBase64(iv), data: bufferToBase64(encrypted) };
  }

  /**
   * Decrypt data with AES-GCM.
   * @param {{iv: string, data: string}} encObj
   * @param {CryptoKey} key
   * @returns {Promise<*>} Parsed JSON
   */
  async function decrypt(encObj, key) {
    var iv = new Uint8Array(base64ToBuffer(encObj.iv));
    var data = base64ToBuffer(encObj.data);
    var decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, key, data
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  /* ═══════════════════════════════════════════
     SIMPLE FALLBACK (no crypto.subtle)
     ═══════════════════════════════════════════ */

  /**
   * Simple XOR obfuscation for file:// protocol.
   * NOT cryptographically secure — just prevents casual reading.
   * @param {string} text
   * @param {string} key
   * @returns {string}
   */
  function xorObfuscate(text, key) {
    var result = '';
    for (var i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return btoa(result);
  }

  /**
   * Reverse XOR obfuscation.
   * @param {string} encoded
   * @param {string} key
   * @returns {string}
   */
  function xorDeobfuscate(encoded, key) {
    var decoded = atob(encoded);
    var result = '';
    for (var i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(
        decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return result;
  }

  /** Fallback "key" stored in memory (the PIN itself) */
  var fallbackKey = null;

  /* ═══════════════════════════════════════════
     PROFILE MANAGEMENT (Unencrypted metadata)
     ═══════════════════════════════════════════ */

  /**
   * Get all stored profiles.
   * @returns {Array<Object>} Profile metadata array
   */
  function getProfiles() {
    try {
      return JSON.parse(localStorage.getItem('ecostep_profiles') || '[]');
    } catch (e) {
      return [];
    }
  }

  /**
   * Save profiles array to localStorage.
   * @param {Array<Object>} profiles
   */
  function saveProfiles(profiles) {
    localStorage.setItem('ecostep_profiles', JSON.stringify(profiles));
  }

  /**
   * Hash a string with PBKDF2 (or simple hash fallback).
   * Used for PIN and security question answer hashing.
   * @param {string} value
   * @param {string} salt
   * @returns {Promise<string>} Base64 hash
   */
  async function hashValue(value, salt) {
    if (hasCrypto) {
      var keyMaterial = await crypto.subtle.importKey(
        'raw', strToBuffer(value), 'PBKDF2', false, ['deriveBits']
      );
      var bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: strToBuffer(salt), iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
      );
      return bufferToBase64(bits);
    }
    /* Fallback: simple string hash */
    var hash = 0;
    var combined = salt + ':' + value;
    for (var i = 0; i < combined.length; i++) {
      var chr = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return btoa(String(Math.abs(hash)));
  }

  /**
   * Generate a random salt string.
   * @returns {string}
   */
  function generateSalt() {
    if (hasCrypto) {
      return bufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
    }
    return btoa(String(Date.now()) + String(Math.random()));
  }

  /* ═══════════════════════════════════════════
     SESSION MANAGEMENT
     ═══════════════════════════════════════════ */

  /**
   * Initialize storage for a user session after successful auth.
   * @param {string} userId
   * @param {CryptoKey|string} key - AES key or fallback PIN string
   */
  function initSession(userId, key) {
    currentUserId = userId;
    cache = {};
    if (hasCrypto && key instanceof CryptoKey) {
      sessionKey = key;
      fallbackKey = null;
    } else {
      sessionKey = null;
      fallbackKey = String(key);
    }
    updateLastActive();
  }

  /**
   * End the current session.
   */
  function endSession() {
    currentUserId = null;
    sessionKey = null;
    fallbackKey = null;
    cache = {};
  }

  /**
   * Update the last-active timestamp for the current user.
   */
  function updateLastActive() {
    if (!currentUserId) { return; }
    localStorage.setItem(
      'ecostep_' + currentUserId + '_lastActive',
      String(Date.now())
    );
  }

  /**
   * Check if a user's session has expired (14 days of inactivity).
   * @param {string} userId
   * @returns {boolean}
   */
  function isSessionExpired(userId) {
    var lastActive = localStorage.getItem('ecostep_' + userId + '_lastActive');
    if (!lastActive) { return true; }
    var elapsed = Date.now() - parseInt(lastActive, 10);
    return elapsed > EcoStep.Data.SESSION_TIMEOUT_MS;
  }

  /**
   * Get a storage key namespaced for the current user.
   * @param {string} key
   * @returns {string}
   * @private
   */
  function nsKey(key) {
    return 'ecostep_' + currentUserId + '_' + key;
  }

  /* ═══════════════════════════════════════════
     DATA READ/WRITE
     ═══════════════════════════════════════════ */

  /**
   * Save data to encrypted user storage.
   * @param {string} key - Storage key (without namespace prefix)
   * @param {*} data - JSON-serializable data
   * @returns {Promise<void>}
   */
  async function setData(key, data) {
    if (!currentUserId) { throw new Error('No active session'); }

    cache[key] = data;

    try {
      if (hasCrypto && sessionKey) {
        var encrypted = await encrypt(data, sessionKey);
        localStorage.setItem(nsKey(key), JSON.stringify(encrypted));
      } else if (fallbackKey) {
        var obfuscated = xorObfuscate(JSON.stringify(data), fallbackKey);
        localStorage.setItem(nsKey(key), obfuscated);
      }
    } catch (e) {
      console.error('EcoStep Storage: Failed to save data', e);
      throw e;
    }
  }

  /**
   * Read data from encrypted user storage.
   * @param {string} key - Storage key (without namespace prefix)
   * @param {*} [defaultValue=null] - Default if key doesn't exist
   * @returns {Promise<*>}
   */
  async function getData(key, defaultValue) {
    if (!currentUserId) { throw new Error('No active session'); }

    /* Return from cache if available */
    if (cache.hasOwnProperty(key)) {
      return cache[key];
    }

    var raw = localStorage.getItem(nsKey(key));
    if (raw === null) {
      cache[key] = defaultValue !== undefined ? defaultValue : null;
      return cache[key];
    }

    try {
      if (hasCrypto && sessionKey) {
        var encObj = JSON.parse(raw);
        var data = await decrypt(encObj, sessionKey);
        cache[key] = data;
        return data;
      } else if (fallbackKey) {
        var deobfuscated = xorDeobfuscate(raw, fallbackKey);
        var data2 = JSON.parse(deobfuscated);
        cache[key] = data2;
        return data2;
      }
    } catch (e) {
      console.error('EcoStep Storage: Failed to read data', e);
      cache[key] = defaultValue !== undefined ? defaultValue : null;
      return cache[key];
    }

    return defaultValue !== undefined ? defaultValue : null;
  }

  /* ═══════════════════════════════════════════
     ENTRY MANAGEMENT (High-level API)
     ═══════════════════════════════════════════ */

  /**
   * Save an activity entry.
   * @param {Object} entry - Entry object with date, category, type, amount, co2
   * @returns {Promise<void>}
   */
  async function saveEntry(entry) {
    var entries = await getData('entries', []);
    entry.id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    entry.timestamp = new Date().toISOString();
    entries.push(entry);
    await setData('entries', entries);
    updateLastActive();
  }

  /**
   * Delete an activity entry by ID.
   * @param {string} entryId
   * @returns {Promise<void>}
   */
  async function deleteEntry(entryId) {
    var entries = await getData('entries', []);
    entries = entries.filter(function(e) { return e.id !== entryId; });
    await setData('entries', entries);
  }

  /**
   * Get entries filtered by date range.
   * @param {string} [startDate] - YYYY-MM-DD (inclusive)
   * @param {string} [endDate]   - YYYY-MM-DD (inclusive)
   * @returns {Promise<Array>}
   */
  async function getEntries(startDate, endDate) {
    var entries = await getData('entries', []);
    if (!startDate && !endDate) { return entries; }

    return entries.filter(function(e) {
      if (startDate && e.date < startDate) { return false; }
      if (endDate && e.date > endDate) { return false; }
      return true;
    });
  }

  /**
   * Get aggregated summary for a specific date.
   * @param {string} date - YYYY-MM-DD
   * @returns {Promise<{total: number, transport: number, diet: number, energy: number, entries: Array}>}
   */
  async function getDailySummary(date) {
    var entries = await getEntries(date, date);
    var summary = { total: 0, transport: 0, diet: 0, energy: 0, entries: entries };

    entries.forEach(function(e) {
      summary.total += e.co2 || 0;
      if (e.category === 'transport') { summary.transport += e.co2 || 0; }
      if (e.category === 'diet')      { summary.diet += e.co2 || 0; }
      if (e.category === 'energy')    { summary.energy += e.co2 || 0; }
    });

    /* Round to 2 decimal places */
    summary.total = Math.round(summary.total * 100) / 100;
    summary.transport = Math.round(summary.transport * 100) / 100;
    summary.diet = Math.round(summary.diet * 100) / 100;
    summary.energy = Math.round(summary.energy * 100) / 100;

    return summary;
  }

  /**
   * Get daily summaries for the last N days.
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array<{date: string, total: number, transport: number, diet: number, energy: number}>>}
   */
  async function getHistorySummaries(days) {
    var results = [];
    var today = new Date();

    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var dateStr = EcoStep.Data.formatDate(d);
      var summary = await getDailySummary(dateStr);
      results.push({
        date: dateStr,
        total: summary.total,
        transport: summary.transport,
        diet: summary.diet,
        energy: summary.energy
      });
    }

    return results;
  }

  /**
   * Calculate the user's current logging streak (consecutive days).
   * @returns {Promise<number>}
   */
  async function getStreak() {
    var streak = 0;
    var d = new Date();

    while (true) {
      var dateStr = EcoStep.Data.formatDate(d);
      var entries = await getEntries(dateStr, dateStr);
      if (entries.length === 0) { break; }
      streak++;
      d.setDate(d.getDate() - 1);
      if (streak > 365) { break; } /* safety limit */
    }

    return streak;
  }

  /**
   * Clear all data for the current user.
   * @returns {Promise<void>}
   */
  async function clearUserData() {
    if (!currentUserId) { return; }

    var prefix = 'ecostep_' + currentUserId + '_';
    var keysToRemove = [];

    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) {
        keysToRemove.push(k);
      }
    }

    keysToRemove.forEach(function(k) {
      localStorage.removeItem(k);
    });

    cache = {};
  }

  /**
   * Get user preferences.
   * @returns {Promise<Object>}
   */
  async function getPrefs() {
    return await getData('prefs', {
      theme: 'dark',
      defaultDistance: 8,
      dailyTarget: EcoStep.Data.DEFAULT_DAILY_TARGET
    });
  }

  /**
   * Save user preferences.
   * @param {Object} prefs
   * @returns {Promise<void>}
   */
  async function savePrefs(prefs) {
    await setData('prefs', prefs);
  }

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */

  window.EcoStep.Storage = {
    /* Crypto helpers (exposed for auth module) */
    hasCrypto: hasCrypto,
    deriveKey: deriveKey,
    generateDEK: generateDEK,
    wrapDEK: wrapDEK,
    unwrapDEK: unwrapDEK,
    hashValue: hashValue,
    generateSalt: generateSalt,

    /* Profile management */
    getProfiles: getProfiles,
    saveProfiles: saveProfiles,

    /* Session */
    initSession: initSession,
    endSession: endSession,
    updateLastActive: updateLastActive,
    isSessionExpired: isSessionExpired,

    /* Data read/write */
    setData: setData,
    getData: getData,

    /* Entry management */
    saveEntry: saveEntry,
    deleteEntry: deleteEntry,
    getEntries: getEntries,
    getDailySummary: getDailySummary,
    getHistorySummaries: getHistorySummaries,
    getStreak: getStreak,
    clearUserData: clearUserData,

    /* Preferences */
    getPrefs: getPrefs,
    savePrefs: savePrefs
  };

})();
