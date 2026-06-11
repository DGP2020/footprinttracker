/**
 * @fileoverview EcoStep — Built-in test suite.
 * Activated via ?test=true query parameter.
 * Zero test framework dependencies — custom assertion library.
 *
 * @namespace EcoStep.Tests
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  var results = [];
  var currentModule = '';

  /* ═══════════════════════════════════════════
     ASSERTION HELPERS
     ═══════════════════════════════════════════ */

  /**
   * Assert a condition is true.
   * @param {boolean} condition
   * @param {string} message
   */
  function assert(condition, message) {
    results.push({
      module: currentModule,
      test: message,
      passed: !!condition,
      error: condition ? null : 'Assertion failed'
    });
  }

  /**
   * Assert two values are strictly equal.
   * @param {*} actual
   * @param {*} expected
   * @param {string} message
   */
  function assertEqual(actual, expected, message) {
    var passed = actual === expected;
    results.push({
      module: currentModule,
      test: message,
      passed: passed,
      error: passed ? null : 'Expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)
    });
  }

  /**
   * Assert a value is approximately equal (for floats).
   * @param {number} actual
   * @param {number} expected
   * @param {number} tolerance
   * @param {string} message
   */
  function assertApprox(actual, expected, tolerance, message) {
    var passed = Math.abs(actual - expected) <= tolerance;
    results.push({
      module: currentModule,
      test: message,
      passed: passed,
      error: passed ? null : 'Expected ~' + expected + ' (±' + tolerance + '), got ' + actual
    });
  }

  /**
   * Assert a function throws an error.
   * @param {Function} fn
   * @param {string} message
   */
  function assertThrows(fn, message) {
    var threw = false;
    try { fn(); } catch (e) { threw = true; }
    results.push({
      module: currentModule,
      test: message,
      passed: threw,
      error: threw ? null : 'Expected function to throw'
    });
  }

  /**
   * Assert a value is truthy.
   * @param {*} value
   * @param {string} message
   */
  function assertTruthy(value, message) {
    results.push({
      module: currentModule,
      test: message,
      passed: !!value,
      error: value ? null : 'Expected truthy value, got ' + JSON.stringify(value)
    });
  }

  /**
   * Set current test module name.
   * @param {string} name
   */
  function describe(name) {
    currentModule = name;
  }

  /* ═══════════════════════════════════════════
     TEST SUITES
     ═══════════════════════════════════════════ */

  /**
   * Run all test suites.
   */
  function run() {
    results = [];

    testDataModule();
    testEmissionCalculations();
    testDistrictData();
    testDateFormatting();
    testSanitization();
    testInsightHelpers();
    testChartDescriptions();
    testStorageHelpers();

    renderResults();
    logResults();
  }

  /* ─── data.js tests ─── */
  function testDataModule() {
    describe('data.js — Constants');

    assert(Object.keys(EcoStep.Data.TRANSPORT_MODES).length >= 10,
      'Has at least 10 transport modes');

    assert(Object.keys(EcoStep.Data.DIET_TYPES).length >= 5,
      'Has at least 5 diet types');

    assert(Object.keys(EcoStep.Data.ENERGY_TYPES).length >= 3,
      'Has at least 3 energy types');

    assert(Object.keys(EcoStep.Data.DISTRICTS).length === 14,
      'Has all 14 Kerala districts');

    assertEqual(EcoStep.Data.NATIONAL_AVG_DAILY, 5.0,
      'National average is 5.0 kg/day');

    assert(EcoStep.Data.SECURITY_QUESTIONS.length >= 5,
      'Has at least 5 security questions');

    /* All transport factors are non-negative */
    var allPositive = true;
    Object.keys(EcoStep.Data.TRANSPORT_MODES).forEach(function(key) {
      if (EcoStep.Data.TRANSPORT_MODES[key].factor < 0) { allPositive = false; }
    });
    assert(allPositive, 'All transport factors are non-negative');

    /* Walking and cycling are zero emission */
    assertEqual(EcoStep.Data.TRANSPORT_MODES.walking.factor, 0,
      'Walking has zero emission factor');
    assertEqual(EcoStep.Data.TRANSPORT_MODES.cycling.factor, 0,
      'Cycling has zero emission factor');
  }

  /* ─── Emission calculations ─── */
  function testEmissionCalculations() {
    describe('data.js — Calculations');

    /* Transport */
    assertApprox(
      EcoStep.Data.calculateEmission('transport', 'car_petrol', 10),
      1.5, 0.001, 'Car petrol 10km = 1.5 kg CO₂'
    );

    assertApprox(
      EcoStep.Data.calculateEmission('transport', 'kochi_metro', 25),
      0.5, 0.001, 'Kochi Metro 25km = 0.5 kg CO₂'
    );

    assertEqual(
      EcoStep.Data.calculateEmission('transport', 'walking', 100),
      0, 'Walking 100km = 0 kg CO₂'
    );

    /* Diet */
    assertApprox(
      EcoStep.Data.calculateEmission('diet', 'beef', 1),
      5.0, 0.001, 'Beef 1 meal = 5.0 kg CO₂'
    );

    assertApprox(
      EcoStep.Data.calculateEmission('diet', 'vegan', 3),
      0.9, 0.001, 'Vegan 3 meals = 0.9 kg CO₂'
    );

    /* Energy */
    assertApprox(
      EcoStep.Data.calculateEmission('energy', 'electricity', 10),
      8.2, 0.001, 'Electricity 10 kWh = 8.2 kg CO₂'
    );

    /* Edge cases */
    assertEqual(
      EcoStep.Data.calculateEmission('transport', 'car_petrol', 0),
      0, 'Zero distance = 0 CO₂'
    );

    assertEqual(
      EcoStep.Data.calculateEmission('transport', 'car_petrol', -5),
      0, 'Negative distance = 0 CO₂'
    );

    assertThrows(function() {
      EcoStep.Data.calculateEmission('invalid', 'type', 10);
    }, 'Invalid category throws error');

    /* Unknown type returns 0 */
    assertEqual(
      EcoStep.Data.calculateEmission('transport', 'nonexistent', 10),
      0, 'Unknown transport type returns 0'
    );
  }

  /* ─── District data ─── */
  function testDistrictData() {
    describe('data.js — Districts');

    /* All 14 districts present */
    var districts = EcoStep.Data.getDistrictList();
    assertEqual(districts.length, 14, 'getDistrictList returns 14 districts');

    /* Ernakulam has metro */
    var ernakulamModes = EcoStep.Data.getDistrictTransportModes('ernakulam');
    var hasMetro = ernakulamModes.some(function(m) { return m.id === 'kochi_metro'; });
    assert(hasMetro, 'Ernakulam has Kochi Metro');

    var hasWaterMetro = ernakulamModes.some(function(m) { return m.id === 'water_metro'; });
    assert(hasWaterMetro, 'Ernakulam has Water Metro');

    /* Non-metro districts lack metro */
    var thrissurModes = EcoStep.Data.getDistrictTransportModes('thrissur');
    var thrissurNoMetro = !thrissurModes.some(function(m) { return m.id === 'kochi_metro'; });
    assert(thrissurNoMetro, 'Thrissur does not have Kochi Metro');

    /* Hill districts have jeep */
    var idukkiModes = EcoStep.Data.getDistrictTransportModes('idukki');
    var hasJeep = idukkiModes.some(function(m) { return m.id === 'jeep_suv'; });
    assert(hasJeep, 'Idukki has Jeep/SUV');

    /* Invalid district returns empty */
    var invalidModes = EcoStep.Data.getDistrictTransportModes('fake_district');
    assertEqual(invalidModes.length, 0, 'Invalid district returns empty array');

    /* All districts have walking */
    var allHaveWalking = true;
    Object.keys(EcoStep.Data.DISTRICTS).forEach(function(id) {
      var modes = EcoStep.Data.getDistrictTransportModes(id);
      if (!modes.some(function(m) { return m.id === 'walking'; })) {
        allHaveWalking = false;
      }
    });
    assert(allHaveWalking, 'All districts have walking mode');
  }

  /* ─── Date formatting ─── */
  function testDateFormatting() {
    describe('data.js — Formatting');

    var testDate = new Date(2026, 5, 11); /* Jun 11, 2026 (month is 0-indexed) */
    assertEqual(
      EcoStep.Data.formatDate(testDate),
      '2026-06-11', 'formatDate returns YYYY-MM-DD'
    );

    assertEqual(
      EcoStep.Data.formatDateDisplay(testDate),
      'Jun 11, 2026', 'formatDateDisplay returns readable date'
    );

    /* Edge: single digit day/month */
    var jan1 = new Date(2026, 0, 1);
    assertEqual(
      EcoStep.Data.formatDate(jan1),
      '2026-01-01', 'formatDate pads single digits'
    );
  }

  /* ─── Sanitization ─── */
  function testSanitization() {
    describe('auth.js — Sanitization');

    assertEqual(
      EcoStep.Auth.sanitize('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
      'Escapes HTML script tags'
    );

    assertEqual(
      EcoStep.Auth.sanitize('Hello & "World"'),
      'Hello &amp; &quot;World&quot;',
      'Escapes ampersands and quotes'
    );

    assertEqual(
      EcoStep.Auth.sanitize('Normal text'),
      'Normal text',
      'Leaves normal text unchanged'
    );

    assertEqual(
      EcoStep.Auth.sanitize(''),
      '',
      'Empty string stays empty'
    );

    assertEqual(
      EcoStep.Auth.sanitize(null),
      '',
      'Null returns empty string'
    );

    assertEqual(
      EcoStep.Auth.sanitize(123),
      '',
      'Number returns empty string'
    );
  }

  /* ─── Insight helpers ─── */
  function testInsightHelpers() {
    describe('insights.js — Logic');

    /* Comparison text */
    var comparison = EcoStep.Data.getComparison(5.0, 'ernakulam');
    assert(comparison.length > 0, 'getComparison returns non-empty string');

    var zeroComparison = EcoStep.Data.getComparison(0.001, 'ernakulam');
    assert(zeroComparison.indexOf('short auto') >= 0 || zeroComparison.indexOf('Less') >= 0,
      'Low emission gives "less than" comparison');

    var invalidComparison = EcoStep.Data.getComparison(5.0, 'invalid');
    assertEqual(invalidComparison, '', 'Invalid district returns empty comparison');
  }

  /* ─── Chart accessibility descriptions ─── */
  function testChartDescriptions() {
    describe('a11y.js — Chart Descriptions');

    var ringDesc = EcoStep.A11y.describeChart('ring', { value: 3.2, target: 5.0 });
    assert(ringDesc.indexOf('3.2') >= 0, 'Ring description includes current value');
    assert(ringDesc.indexOf('5.0') >= 0, 'Ring description includes target');
    assert(ringDesc.indexOf('64%') >= 0, 'Ring description includes percentage');

    var barDesc = EcoStep.A11y.describeChart('bar', {
      labels: ['Mon', 'Tue'],
      values: [3.5, 2.1]
    });
    assert(barDesc.indexOf('Mon') >= 0, 'Bar description includes labels');
    assert(barDesc.indexOf('3.5') >= 0, 'Bar description includes values');

    var emptyDesc = EcoStep.A11y.describeChart('ring', null);
    assertEqual(emptyDesc, 'No data available.', 'Null data returns "No data available"');

    var unknownDesc = EcoStep.A11y.describeChart('unknown', {});
    assertEqual(unknownDesc, 'Chart data visualization.',
      'Unknown chart type returns generic description');
  }

  /* ─── Storage helpers ─── */
  function testStorageHelpers() {
    describe('storage.js — Utilities');

    /* generateSalt returns non-empty */
    var salt = EcoStep.Storage.generateSalt();
    assert(salt.length > 0, 'generateSalt returns non-empty string');

    /* Two salts are different */
    var salt2 = EcoStep.Storage.generateSalt();
    assert(salt !== salt2, 'Two generated salts are different');

    /* hasCrypto is a boolean */
    assert(typeof EcoStep.Storage.hasCrypto === 'boolean',
      'hasCrypto is a boolean');

    /* Session expiry check works */
    assert(typeof EcoStep.Storage.isSessionExpired('nonexistent_user') === 'boolean',
      'isSessionExpired returns boolean for unknown user');

    assert(EcoStep.Storage.isSessionExpired('nonexistent_user') === true,
      'Nonexistent user session is expired');

    /* getProfiles returns array */
    var profiles = EcoStep.Storage.getProfiles();
    assert(Array.isArray(profiles), 'getProfiles returns an array');
  }

  /* ═══════════════════════════════════════════
     RESULTS RENDERING
     ═══════════════════════════════════════════ */

  /**
   * Render test results in a styled overlay.
   * @private
   */
  function renderResults() {
    var passed = results.filter(function(r) { return r.passed; }).length;
    var failed = results.filter(function(r) { return !r.passed; }).length;
    var total = results.length;

    /* Group by module */
    var modules = {};
    results.forEach(function(r) {
      if (!modules[r.module]) { modules[r.module] = []; }
      modules[r.module].push(r);
    });

    var html = '<div class="test-overlay">' +
      '<h1 class="test-title">🌿 EcoStep Test Runner</h1>';

    Object.keys(modules).forEach(function(modName) {
      var modResults = modules[modName];
      var modPassed = modResults.filter(function(r) { return r.passed; }).length;
      var modIcon = modPassed === modResults.length ? '✅' : '❌';

      html += '<div class="test-module">' +
        '<div class="test-module-name">' + modIcon + ' ' + modName +
        ' — ' + modPassed + '/' + modResults.length + ' passed</div>';

      modResults.forEach(function(r) {
        html += '<div class="test-result ' + (r.passed ? 'pass' : 'fail') + '">' +
          (r.passed ? '✓' : '✗') + ' ' + r.test +
          (r.error ? ' — <em>' + r.error + '</em>' : '') +
          '</div>';
      });

      html += '</div>';
    });

    html += '<div class="test-summary" style="color:' +
      (failed === 0 ? 'var(--green-400)' : 'var(--red)') + '">' +
      '🧪 Total: ' + passed + '/' + total + ' passed | ' +
      failed + ' failed</div></div>';

    document.getElementById('app').innerHTML = html;
  }

  /**
   * Log results to console for CI integration.
   * @private
   */
  function logResults() {
    var passed = results.filter(function(r) { return r.passed; }).length;
    var failed = results.filter(function(r) { return !r.passed; }).length;

    console.log('\n=== EcoStep Test Results ===');
    console.log('Total: ' + results.length + ' | Passed: ' + passed + ' | Failed: ' + failed);

    results.forEach(function(r) {
      if (!r.passed) {
        console.error('FAIL: [' + r.module + '] ' + r.test + ' — ' + r.error);
      }
    });

    console.log(JSON.stringify({
      total: results.length,
      passed: passed,
      failed: failed,
      results: results
    }));
  }

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */

  window.EcoStep.Tests = {
    run: run
  };

})();
