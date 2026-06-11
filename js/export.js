/**
 * @fileoverview EcoStep — Data export module.
 * Generates CSV and JSON downloads from user activity data.
 * Supports date range filtering. Uses Blob API — no server needed.
 *
 * @namespace EcoStep.Export
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /**
   * Export user entries as a CSV file download.
   * @param {'all'|'7'|'30'|'custom'} range - Date range to export
   * @param {string} [customStart] - YYYY-MM-DD (for custom range)
   * @param {string} [customEnd]   - YYYY-MM-DD (for custom range)
   * @returns {Promise<void>}
   */
  async function exportCSV(range, customStart, customEnd) {
    var entries = await getFilteredEntries(range, customStart, customEnd);
    if (entries.length === 0) {
      EcoStep.A11y.announce('No data to export for selected range.');
      return;
    }

    var headers = ['Date', 'Category', 'Type', 'Amount', 'Unit', 'CO2_kg', 'Timestamp'];
    var rows = [headers.join(',')];

    entries.forEach(function(e) {
      var row = [
        escapeCSV(e.date || ''),
        escapeCSV(e.category || ''),
        escapeCSV(e.type || ''),
        String(e.amount || 0),
        escapeCSV(getUnit(e.category, e.type)),
        String(e.co2 || 0),
        escapeCSV(e.timestamp || '')
      ];
      rows.push(row.join(','));
    });

    var csv = rows.join('\n');
    var profile = EcoStep.Auth.getCurrentProfile();
    var filename = 'ecostep_' + sanitizeFilename(profile ? profile.name : 'user') +
                   '_' + EcoStep.Data.formatDate(new Date()) + '.csv';

    downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
    EcoStep.A11y.announce('CSV file downloaded with ' + entries.length + ' entries.');
  }

  /**
   * Export user entries as a JSON file download.
   * @param {'all'|'7'|'30'|'custom'} range
   * @param {string} [customStart]
   * @param {string} [customEnd]
   * @returns {Promise<void>}
   */
  async function exportJSON(range, customStart, customEnd) {
    var entries = await getFilteredEntries(range, customStart, customEnd);
    if (entries.length === 0) {
      EcoStep.A11y.announce('No data to export for selected range.');
      return;
    }

    var profile = EcoStep.Auth.getCurrentProfile();
    var data = {
      exportedAt: new Date().toISOString(),
      application: 'EcoStep — Kerala Carbon Tracker',
      version: '1.0.0',
      user: {
        name: profile ? profile.name : 'Unknown',
        district: profile ? profile.districtId : 'Unknown'
      },
      dateRange: {
        type: range,
        start: customStart || null,
        end: customEnd || null
      },
      totalEntries: entries.length,
      totalCO2_kg: Math.round(
        entries.reduce(function(sum, e) { return sum + (e.co2 || 0); }, 0) * 100
      ) / 100,
      entries: entries
    };

    var json = JSON.stringify(data, null, 2);
    var filename = 'ecostep_' + sanitizeFilename(profile ? profile.name : 'user') +
                   '_' + EcoStep.Data.formatDate(new Date()) + '.json';

    downloadBlob(json, filename, 'application/json;charset=utf-8;');
    EcoStep.A11y.announce('JSON file downloaded with ' + entries.length + ' entries.');
  }

  /* ═══════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════ */

  /**
   * Get entries filtered by the specified range.
   * @param {'all'|'7'|'30'|'custom'} range
   * @param {string} [customStart]
   * @param {string} [customEnd]
   * @returns {Promise<Array>}
   * @private
   */
  async function getFilteredEntries(range, customStart, customEnd) {
    var start = null;
    var end = EcoStep.Data.formatDate(new Date());

    switch (range) {
      case '7':
        var d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        start = EcoStep.Data.formatDate(d7);
        break;
      case '30':
        var d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        start = EcoStep.Data.formatDate(d30);
        break;
      case 'custom':
        start = customStart || null;
        end = customEnd || end;
        break;
      case 'all':
      default:
        /* No filter — get everything */
        return await EcoStep.Storage.getEntries();
    }

    return await EcoStep.Storage.getEntries(start, end);
  }

  /**
   * Escape a value for CSV (handles commas, quotes, newlines).
   * @param {string} value
   * @returns {string}
   * @private
   */
  function escapeCSV(value) {
    if (!value) { return '""'; }
    var str = String(value);
    if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\n') >= 0) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Get the measurement unit for a given category/type.
   * @param {string} category
   * @param {string} type
   * @returns {string}
   * @private
   */
  function getUnit(category, type) {
    switch (category) {
      case 'transport':
        return 'km';
      case 'diet':
        return 'meals';
      case 'energy':
        var energyType = EcoStep.Data.ENERGY_TYPES[type];
        return energyType ? energyType.unit : 'units';
      default:
        return 'units';
    }
  }

  /**
   * Sanitize a string for use as a filename.
   * @param {string} name
   * @returns {string}
   * @private
   */
  function sanitizeFilename(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 30);
  }

  /**
   * Trigger a file download using Blob API.
   * @param {string} content
   * @param {string} filename
   * @param {string} mimeType
   * @private
   */
  function downloadBlob(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    setTimeout(function() {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */

  window.EcoStep.Export = {
    exportCSV: exportCSV,
    exportJSON: exportJSON
  };

})();
