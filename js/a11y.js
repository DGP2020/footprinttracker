/**
 * @fileoverview EcoStep — Accessibility utilities module.
 * Provides focus management, screen reader announcements,
 * keyboard navigation helpers, and focus trapping for modals.
 *
 * @namespace EcoStep.A11y
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /** @type {HTMLElement|null} Live region for screen reader announcements */
  var liveRegion = null;

  /** @type {HTMLElement|null} Element that had focus before a modal opened */
  var previousFocus = null;

  /** @type {HTMLElement|null} Currently trapped container */
  var trapContainer = null;

  /**
   * Initialize the accessibility module.
   * Creates an ARIA live region for dynamic announcements.
   */
  function init() {
    if (liveRegion) { return; }

    liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    liveRegion.id = 'a11y-live-region';
    document.body.appendChild(liveRegion);
  }

  /**
   * Announce a message to screen readers via the live region.
   * @param {string} message - Text to announce
   * @param {'polite'|'assertive'} [priority='polite'] - Urgency level
   */
  function announce(message, priority) {
    if (!liveRegion) { init(); }
    liveRegion.setAttribute('aria-live', priority || 'polite');
    /* Clear and re-set to trigger announcement */
    liveRegion.textContent = '';
    setTimeout(function() {
      liveRegion.textContent = message;
    }, 100);
  }

  /**
   * Get all focusable elements within a container.
   * @param {HTMLElement} container
   * @returns {HTMLElement[]}
   */
  function getFocusable(container) {
    var selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]'
    ].join(', ');

    return Array.from(container.querySelectorAll(selector))
      .filter(function(el) {
        return el.offsetParent !== null; /* visible only */
      });
  }

  /**
   * Trap keyboard focus within a container (for modals).
   * @param {HTMLElement} container - The container to trap focus in
   */
  function trapFocus(container) {
    previousFocus = document.activeElement;
    trapContainer = container;

    var focusable = getFocusable(container);
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    document.addEventListener('keydown', handleTrapKeydown);
  }

  /**
   * Release the focus trap and restore previous focus.
   */
  function releaseFocus() {
    document.removeEventListener('keydown', handleTrapKeydown);
    trapContainer = null;

    if (previousFocus && previousFocus.focus) {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  /**
   * Handle Tab/Shift+Tab within a focus trap.
   * @param {KeyboardEvent} e
   * @private
   */
  function handleTrapKeydown(e) {
    if (e.key !== 'Tab' || !trapContainer) { return; }

    var focusable = getFocusable(trapContainer);
    if (focusable.length === 0) { return; }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /**
   * Generate a text description of chart data for screen readers.
   * @param {string} chartType - e.g., 'bar', 'donut', 'ring'
   * @param {Object} data - Chart data object
   * @returns {string} Readable description
   */
  function describeChart(chartType, data) {
    if (!data) { return 'No data available.'; }

    switch (chartType) {
      case 'ring':
        return 'Progress ring showing ' + (data.value || 0).toFixed(1) +
               ' kg CO\u2082 of ' + (data.target || 0).toFixed(1) +
               ' kg daily target. ' +
               Math.round(((data.value || 0) / (data.target || 1)) * 100) +
               '% used.';

      case 'bar':
        if (!data.labels || !data.values) { return 'No data available.'; }
        var barDesc = 'Bar chart showing daily emissions. ';
        for (var i = 0; i < data.labels.length; i++) {
          barDesc += data.labels[i] + ': ' + (data.values[i] || 0).toFixed(1) + ' kg. ';
        }
        return barDesc;

      case 'donut':
        if (!data.segments) { return 'No data available.'; }
        var donutDesc = 'Donut chart showing emission breakdown. ';
        data.segments.forEach(function(seg) {
          donutDesc += seg.label + ': ' + seg.percent.toFixed(0) + '%. ';
        });
        return donutDesc;

      default:
        return 'Chart data visualization.';
    }
  }

  /**
   * Set up keyboard navigation for a tab bar.
   * Arrow keys move between tabs, Enter/Space activates.
   * @param {HTMLElement} tabList - Element with role="tablist"
   * @param {Function} onActivate - Callback(tabElement) when a tab is activated
   */
  function setupTabKeyboard(tabList, onActivate) {
    tabList.addEventListener('keydown', function(e) {
      var tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
      var currentIndex = tabs.indexOf(document.activeElement);

      if (currentIndex === -1) { return; }

      var newIndex = -1;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = (currentIndex + 1) % tabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = tabs.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (onActivate) { onActivate(tabs[currentIndex]); }
          return;
      }

      if (newIndex >= 0) {
        tabs[newIndex].focus();
        if (onActivate) { onActivate(tabs[newIndex]); }
      }
    });
  }

  /* ─── Export ─── */

  window.EcoStep.A11y = {
    init: init,
    announce: announce,
    trapFocus: trapFocus,
    releaseFocus: releaseFocus,
    describeChart: describeChart,
    setupTabKeyboard: setupTabKeyboard,
    getFocusable: getFocusable
  };

})();
