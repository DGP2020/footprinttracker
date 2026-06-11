/**
 * @fileoverview EcoStep — Authentication module.
 * Handles profile creation, 6-digit PIN auth with rate limiting,
 * security question-based PIN reset, and 14-day auto-logout.
 *
 * @namespace EcoStep.Auth
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /** @type {Object|null} Currently logged-in profile */
  var currentProfile = null;

  /** PIN attempt tracking: { userId: { count, lockoutUntil } } */
  var attempts = {};

  /** Inactivity heartbeat timer */
  var heartbeatTimer = null;

  /* ═══════════════════════════════════════════
     PROFILE CREATION
     ═══════════════════════════════════════════ */

  /**
   * Create a new user profile.
   * @param {Object} params
   * @param {string} params.name - Display name
   * @param {string} params.pin - 6-digit PIN
   * @param {string} params.districtId - Kerala district key
   * @param {Array<{questionId: string, answer: string}>} params.securityAnswers - 3 Q&A pairs
   * @returns {Promise<Object>} The created profile
   * @throws {Error} If validation fails
   */
  async function createProfile(params) {
    /* Validate */
    if (!params.name || params.name.trim().length < 1) {
      throw new Error('Name is required.');
    }
    if (!params.pin || !/^\d{6}$/.test(params.pin)) {
      throw new Error('PIN must be exactly 6 digits.');
    }
    if (!params.districtId || !EcoStep.Data.DISTRICTS[params.districtId]) {
      throw new Error('Valid district is required.');
    }
    if (!params.securityAnswers || params.securityAnswers.length !== 3) {
      throw new Error('Exactly 3 security answers are required.');
    }
    for (var i = 0; i < params.securityAnswers.length; i++) {
      if (!params.securityAnswers[i].answer || params.securityAnswers[i].answer.trim().length < 1) {
        throw new Error('All security answers must be filled in.');
      }
    }

    var Storage = EcoStep.Storage;
    var salt = Storage.generateSalt();
    var userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    /* Hash PIN */
    var pinHash = await Storage.hashValue(params.pin, salt);

    /* Hash security answers */
    var hashedAnswers = [];
    for (var j = 0; j < params.securityAnswers.length; j++) {
      var ans = params.securityAnswers[j];
      var answerHash = await Storage.hashValue(
        ans.answer.trim().toLowerCase(), salt
      );
      hashedAnswers.push({
        questionId: ans.questionId,
        hash: answerHash
      });
    }

    var profile = {
      id: userId,
      name: params.name.trim(),
      districtId: params.districtId,
      salt: salt,
      pinHash: pinHash,
      securityAnswers: hashedAnswers,
      createdAt: new Date().toISOString(),
      color: getAvatarColor(params.name)
    };

    /* Handle DEK wrapping if Web Crypto is available */
    if (Storage.hasCrypto) {
      var dek = await Storage.generateDEK();
      var pinKEK = await Storage.deriveKey(params.pin, new Uint8Array(base64ToUint8(salt)));
      var questionsKey = params.securityAnswers
        .map(function(a) { return a.answer.trim().toLowerCase(); })
        .join('|');
      var questionKEK = await Storage.deriveKey(questionsKey, new Uint8Array(base64ToUint8(salt)));

      profile.wrappedKeyByPIN = await Storage.wrapDEK(dek, pinKEK);
      profile.wrappedKeyByQuestions = await Storage.wrapDEK(dek, questionKEK);
    }

    /* Save profile */
    var profiles = Storage.getProfiles();
    profiles.push(profile);
    Storage.saveProfiles(profiles);

    /* Initialize session with this profile */
    if (Storage.hasCrypto && profile.wrappedKeyByPIN) {
      var pinKEK2 = await Storage.deriveKey(params.pin, new Uint8Array(base64ToUint8(salt)));
      var dek2 = await Storage.unwrapDEK(profile.wrappedKeyByPIN, pinKEK2);
      Storage.initSession(userId, dek2);
    } else {
      Storage.initSession(userId, params.pin);
    }

    /* Save initial preferences */
    await Storage.savePrefs({
      theme: 'dark',
      defaultDistance: 8,
      dailyTarget: EcoStep.Data.DEFAULT_DAILY_TARGET
    });

    /* Save initial empty entries */
    await Storage.setData('entries', []);

    currentProfile = profile;
    startHeartbeat();

    return profile;
  }

  /**
   * Convert base64 string to Uint8Array.
   * @param {string} base64
   * @returns {Uint8Array}
   * @private
   */
  function base64ToUint8(base64) {
    try {
      var binary = atob(base64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (e) {
      return new Uint8Array(16);
    }
  }

  /* ═══════════════════════════════════════════
     LOGIN / PIN VERIFICATION
     ═══════════════════════════════════════════ */

  /**
   * Attempt login with a 6-digit PIN.
   * @param {string} userId - Profile ID
   * @param {string} pin - Entered PIN
   * @returns {Promise<{success: boolean, error?: string, lockoutSeconds?: number}>}
   */
  async function login(userId, pin) {
    var Storage = EcoStep.Storage;

    /* Check rate limiting */
    if (isLockedOut(userId)) {
      var remaining = Math.ceil((attempts[userId].lockoutUntil - Date.now()) / 1000);
      return {
        success: false,
        error: 'Account locked. Try again in ' + remaining + ' seconds.',
        lockoutSeconds: remaining
      };
    }

    /* Find profile */
    var profiles = Storage.getProfiles();
    var profile = profiles.find(function(p) { return p.id === userId; });
    if (!profile) {
      return { success: false, error: 'Profile not found.' };
    }

    /* Check session expiry */
    if (Storage.isSessionExpired(userId)) {
      return { success: false, error: 'Session expired due to 14 days of inactivity. Please log in again.' };
    }

    /* Verify PIN */
    var pinHash = await Storage.hashValue(pin, profile.salt);

    if (pinHash !== profile.pinHash) {
      recordFailedAttempt(userId);
      var attemptsLeft = EcoStep.Data.MAX_PIN_ATTEMPTS - (attempts[userId] ? attempts[userId].count : 0);
      if (attemptsLeft <= 0) {
        return {
          success: false,
          error: 'Account locked for 60 seconds.',
          lockoutSeconds: 60
        };
      }
      return {
        success: false,
        error: 'Incorrect PIN. ' + attemptsLeft + ' attempts remaining.'
      };
    }

    /* PIN correct — clear attempts */
    clearAttempts(userId);

    /* Initialize session */
    if (Storage.hasCrypto && profile.wrappedKeyByPIN) {
      try {
        var pinKEK = await Storage.deriveKey(pin, new Uint8Array(base64ToUint8(profile.salt)));
        var dek = await Storage.unwrapDEK(profile.wrappedKeyByPIN, pinKEK);
        Storage.initSession(userId, dek);
      } catch (e) {
        /* Crypto failed; fall back */
        Storage.initSession(userId, pin);
      }
    } else {
      Storage.initSession(userId, pin);
    }

    currentProfile = profile;
    startHeartbeat();

    return { success: true };
  }

  /**
   * Log out the current user.
   */
  function logout() {
    EcoStep.Storage.endSession();
    currentProfile = null;
    stopHeartbeat();
  }

  /**
   * Get the currently logged-in profile.
   * @returns {Object|null}
   */
  function getCurrentProfile() {
    return currentProfile;
  }

  /* ═══════════════════════════════════════════
     PIN RESET (Security Questions)
     ═══════════════════════════════════════════ */

  /**
   * Get security question IDs for a user (not the answers).
   * @param {string} userId
   * @returns {Array<{questionId: string, question: string}>|null}
   */
  function getSecurityQuestions(userId) {
    var profiles = EcoStep.Storage.getProfiles();
    var profile = profiles.find(function(p) { return p.id === userId; });
    if (!profile || !profile.securityAnswers) { return null; }

    var allQuestions = EcoStep.Data.SECURITY_QUESTIONS;
    return profile.securityAnswers.map(function(sa) {
      var q = allQuestions.find(function(aq) { return aq.id === sa.questionId; });
      return {
        questionId: sa.questionId,
        question: q ? q.question : 'Unknown question'
      };
    });
  }

  /**
   * Verify security answers and reset PIN.
   * @param {string} userId
   * @param {Array<{questionId: string, answer: string}>} answers - User's answers
   * @param {string} newPin - New 6-digit PIN
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function resetPin(userId, answers, newPin) {
    var Storage = EcoStep.Storage;

    if (!newPin || !/^\d{6}$/.test(newPin)) {
      return { success: false, error: 'New PIN must be exactly 6 digits.' };
    }

    var profiles = Storage.getProfiles();
    var profileIndex = profiles.findIndex(function(p) { return p.id === userId; });
    if (profileIndex === -1) {
      return { success: false, error: 'Profile not found.' };
    }

    var profile = profiles[profileIndex];

    /* Verify all 3 answers */
    for (var i = 0; i < profile.securityAnswers.length; i++) {
      var stored = profile.securityAnswers[i];
      var provided = answers.find(function(a) { return a.questionId === stored.questionId; });
      if (!provided) {
        return { success: false, error: 'Incorrect security answers.' };
      }
      var answerHash = await Storage.hashValue(
        provided.answer.trim().toLowerCase(), profile.salt
      );
      if (answerHash !== stored.hash) {
        return { success: false, error: 'Incorrect security answers.' };
      }
    }

    /* All answers correct — update PIN */
    var newPinHash = await Storage.hashValue(newPin, profile.salt);
    profile.pinHash = newPinHash;

    /* Re-wrap DEK with new PIN if crypto is available */
    if (Storage.hasCrypto && profile.wrappedKeyByQuestions) {
      try {
        var questionsKey = answers
          .sort(function(a, b) { return a.questionId.localeCompare(b.questionId); })
          .map(function(a) { return a.answer.trim().toLowerCase(); })
          .join('|');
        var questionKEK = await Storage.deriveKey(
          questionsKey, new Uint8Array(base64ToUint8(profile.salt))
        );
        var dek = await Storage.unwrapDEK(profile.wrappedKeyByQuestions, questionKEK);
        var newPinKEK = await Storage.deriveKey(
          newPin, new Uint8Array(base64ToUint8(profile.salt))
        );
        profile.wrappedKeyByPIN = await Storage.wrapDEK(dek, newPinKEK);
      } catch (e) {
        console.warn('EcoStep Auth: Could not re-wrap DEK, falling back', e);
      }
    }

    profiles[profileIndex] = profile;
    Storage.saveProfiles(profiles);
    clearAttempts(userId);

    return { success: true };
  }

  /**
   * Delete a profile and all associated data.
   * @param {string} userId
   * @param {string} pin - Must verify PIN before deletion
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function deleteProfile(userId, pin) {
    var Storage = EcoStep.Storage;
    var profiles = Storage.getProfiles();
    var profile = profiles.find(function(p) { return p.id === userId; });

    if (!profile) {
      return { success: false, error: 'Profile not found.' };
    }

    /* Verify PIN */
    var pinHash = await Storage.hashValue(pin, profile.salt);
    if (pinHash !== profile.pinHash) {
      return { success: false, error: 'Incorrect PIN.' };
    }

    /* Clear user data */
    Storage.initSession(userId, pin);
    await Storage.clearUserData();
    Storage.endSession();

    /* Remove profile */
    profiles = profiles.filter(function(p) { return p.id !== userId; });
    Storage.saveProfiles(profiles);

    return { success: true };
  }

  /* ═══════════════════════════════════════════
     RATE LIMITING
     ═══════════════════════════════════════════ */

  /**
   * Record a failed PIN attempt.
   * @param {string} userId
   * @private
   */
  function recordFailedAttempt(userId) {
    if (!attempts[userId]) {
      attempts[userId] = { count: 0, lockoutUntil: 0 };
    }
    attempts[userId].count++;

    if (attempts[userId].count >= EcoStep.Data.MAX_PIN_ATTEMPTS) {
      attempts[userId].lockoutUntil = Date.now() + EcoStep.Data.LOCKOUT_DURATION_MS;
      attempts[userId].count = 0;
    }
  }

  /**
   * Check if a user is currently locked out.
   * @param {string} userId
   * @returns {boolean}
   * @private
   */
  function isLockedOut(userId) {
    if (!attempts[userId]) { return false; }
    if (attempts[userId].lockoutUntil <= Date.now()) {
      attempts[userId].lockoutUntil = 0;
      return false;
    }
    return true;
  }

  /**
   * Clear attempt counter for a user.
   * @param {string} userId
   * @private
   */
  function clearAttempts(userId) {
    delete attempts[userId];
  }

  /* ═══════════════════════════════════════════
     HEARTBEAT (Activity Tracking)
     ═══════════════════════════════════════════ */

  /**
   * Start the activity heartbeat (updates lastActive every 60s).
   * @private
   */
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(function() {
      EcoStep.Storage.updateLastActive();
    }, 60000);

    /* Also update on user interactions (debounced via heartbeat interval) */
    document.addEventListener('click', onUserActivity);
    document.addEventListener('keydown', onUserActivity);
  }

  /**
   * Stop the activity heartbeat.
   * @private
   */
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    document.removeEventListener('click', onUserActivity);
    document.removeEventListener('keydown', onUserActivity);
  }

  /** Debounce flag for user activity */
  var lastActivityUpdate = 0;

  /**
   * Handle user activity events (debounced to 60s).
   * @private
   */
  function onUserActivity() {
    var now = Date.now();
    if (now - lastActivityUpdate > 60000) {
      lastActivityUpdate = now;
      EcoStep.Storage.updateLastActive();
    }
  }

  /* ═══════════════════════════════════════════
     AVATAR HELPERS
     ═══════════════════════════════════════════ */

  /** Color palette for profile avatars */
  var AVATAR_COLORS = [
    '#22c55e', '#3b82f6', '#a855f7', '#f59e0b',
    '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'
  ];

  /**
   * Get a deterministic avatar color based on name.
   * @param {string} name
   * @returns {string} Hex color
   * @private
   */
  function getAvatarColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  /**
   * Get initials from a name (1-2 chars).
   * @param {string} name
   * @returns {string}
   */
  function getInitials(name) {
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  /* ═══════════════════════════════════════════
     INPUT SANITIZATION
     ═══════════════════════════════════════════ */

  /**
   * Sanitize a string to prevent XSS.
   * Escapes HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  function sanitize(str) {
    if (typeof str !== 'string') { return ''; }
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, function(c) { return map[c]; });
  }

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */

  window.EcoStep.Auth = {
    createProfile: createProfile,
    login: login,
    logout: logout,
    getCurrentProfile: getCurrentProfile,
    getSecurityQuestions: getSecurityQuestions,
    resetPin: resetPin,
    deleteProfile: deleteProfile,
    getInitials: getInitials,
    sanitize: sanitize
  };

})();
