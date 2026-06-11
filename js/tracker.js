/**
 * @fileoverview EcoStep — Activity tracker module.
 * Renders tabbed input forms (Transport/Diet/Energy),
 * handles input validation, CO₂ calculation, and entry submission.
 *
 * @namespace EcoStep.Tracker
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /** Debounce timer for CO₂ preview */
  var previewTimer = null;

  /** Currently selected diet items: { type: count } */
  var dietSelections = {};

  /* ═══════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════ */

  /**
   * Render the activity logging section.
   * @param {HTMLElement} container
   */
  function render(container) {
    var profile = EcoStep.Auth.getCurrentProfile();
    var districtId = profile ? profile.districtId : 'ernakulam';

    container.innerHTML =
      '<div class="card section" id="log-section">' +
        '<div class="card-header">' +
          '<h2 class="card-title"><span class="section-title-icon">📝</span> Log Activity</h2>' +
        '</div>' +

        /* Tab Bar */
        '<div class="tab-bar" role="tablist" aria-label="Activity categories" id="activity-tabs">' +
          '<button class="tab-btn" role="tab" aria-selected="true" ' +
            'aria-controls="panel-transport" id="tab-transport" tabindex="0">' +
            '🚌 <span class="tab-text">Transport</span></button>' +
          '<button class="tab-btn" role="tab" aria-selected="false" ' +
            'aria-controls="panel-diet" id="tab-diet" tabindex="-1">' +
            '🍽️ <span class="tab-text">Diet</span></button>' +
          '<button class="tab-btn" role="tab" aria-selected="false" ' +
            'aria-controls="panel-energy" id="tab-energy" tabindex="-1">' +
            '⚡ <span class="tab-text">Energy</span></button>' +
        '</div>' +

        /* Transport Panel */
        '<div class="tab-panel active" role="tabpanel" id="panel-transport" ' +
          'aria-labelledby="tab-transport">' +
          renderTransportPanel(districtId) +
        '</div>' +

        /* Diet Panel */
        '<div class="tab-panel" role="tabpanel" id="panel-diet" ' +
          'aria-labelledby="tab-diet">' +
          renderDietPanel() +
        '</div>' +

        /* Energy Panel */
        '<div class="tab-panel" role="tabpanel" id="panel-energy" ' +
          'aria-labelledby="tab-energy">' +
          renderEnergyPanel() +
        '</div>' +
      '</div>';

    bindEvents(container);
    dietSelections = {};
  }

  /**
   * Render the transport input panel.
   * @param {string} districtId
   * @returns {string} HTML
   * @private
   */
  function renderTransportPanel(districtId) {
    var modes = EcoStep.Data.getDistrictTransportModes(districtId);
    var options = modes.map(function(m) {
      return '<option value="' + m.id + '">' + m.icon + ' ' + m.label +
             ' (' + m.factor + ' kg/km)</option>';
    }).join('');

    return (
      '<div class="form-group">' +
        '<label for="transport-mode" class="form-label">Mode of Transport</label>' +
        '<select id="transport-mode" class="form-select" aria-required="true">' +
          options +
        '</select>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="transport-distance" class="form-label">Distance (km)</label>' +
        '<input type="number" id="transport-distance" class="form-input" ' +
          'min="0.1" max="500" step="0.1" placeholder="Enter distance" ' +
          'inputmode="decimal" aria-required="true" aria-describedby="transport-error">' +
        '<div class="form-error" id="transport-error" role="alert"></div>' +
      '</div>' +
      '<div class="quick-actions">' +
        '<button class="quick-btn" data-distance="8" type="button" aria-label="Quick fill: Home to Campus, 8 km">' +
          '🏠→🏫 Home→Campus (8km)</button>' +
        '<button class="quick-btn" data-distance="8" type="button" aria-label="Quick fill: Campus to Home, 8 km">' +
          '🏫→🏠 Campus→Home (8km)</button>' +
        '<button class="quick-btn" data-distance="2" type="button" aria-label="Quick fill: Short trip, 2 km">' +
          '📍 Short Trip (2km)</button>' +
      '</div>' +
      '<div class="co2-preview" id="transport-preview" aria-live="polite">🌱 0.00 kg CO₂</div>' +
      '<button class="btn btn-primary" id="log-transport" style="width:100%">' +
        '+ Log This Trip</button>'
    );
  }

  /**
   * Render the diet input panel.
   * @returns {string} HTML
   * @private
   */
  function renderDietPanel() {
    var types = EcoStep.Data.DIET_TYPES;
    var cards = Object.keys(types).map(function(key) {
      var t = types[key];
      return (
        '<div class="meal-card" data-type="' + key + '" tabindex="0" ' +
          'role="checkbox" aria-checked="false" aria-label="' + t.label + ', ' + t.factor + ' kg CO₂ per meal">' +
          '<span class="meal-icon">' + t.icon + '</span>' +
          '<span class="meal-label">' + t.label + '</span>' +
          '<span class="text-sm text-muted">' + t.factor + ' kg</span>' +
          '<div class="meal-count hidden">' +
            '<button class="meal-count-btn" data-action="minus" aria-label="Decrease count" type="button">−</button>' +
            '<span class="meal-count-value" aria-live="polite">1</span>' +
            '<button class="meal-count-btn" data-action="plus" aria-label="Increase count" type="button">+</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<p class="text-sm text-muted mb-md">Select your meals and adjust quantities:</p>' +
      '<div class="meal-grid">' + cards + '</div>' +
      '<div class="co2-preview" id="diet-preview" aria-live="polite">🌱 0.00 kg CO₂</div>' +
      '<button class="btn btn-primary" id="log-diet" style="width:100%">' +
        '+ Log Meals</button>'
    );
  }

  /**
   * Render the energy input panel.
   * @returns {string} HTML
   * @private
   */
  function renderEnergyPanel() {
    return (
      '<div class="form-group">' +
        '<label for="energy-electricity" class="form-label">⚡ Electricity Used (kWh)</label>' +
        '<input type="number" id="energy-electricity" class="form-input" ' +
          'min="0" max="100" step="0.1" placeholder="e.g., 5" inputmode="decimal" ' +
          'aria-describedby="energy-elec-hint">' +
        '<div id="energy-elec-hint" class="text-sm text-muted mt-sm">' +
          'Average Kerala household: ~8 kWh/day</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="energy-lpg" class="form-label">🔥 LPG Used (kg)</label>' +
        '<input type="number" id="energy-lpg" class="form-input" ' +
          'min="0" max="14.2" step="0.1" placeholder="e.g., 0.5" inputmode="decimal" ' +
          'aria-describedby="energy-lpg-hint">' +
        '<div id="energy-lpg-hint" class="text-sm text-muted mt-sm">' +
          'A 14.2 kg cylinder lasts ~1 month</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="energy-ac" class="form-label">❄️ AC Usage (hours): ' +
          '<span id="ac-value-display">0</span>h</label>' +
        '<input type="range" id="energy-ac" class="form-range" ' +
          'min="0" max="24" step="0.5" value="0" ' +
          'aria-valuemin="0" aria-valuemax="24" aria-valuenow="0" ' +
          'aria-label="Air conditioning hours">' +
        '<div class="range-display">' +
          '<span>0h</span><span>12h</span><span>24h</span>' +
        '</div>' +
      '</div>' +
      '<div class="co2-preview" id="energy-preview" aria-live="polite">🌱 0.00 kg CO₂</div>' +
      '<button class="btn btn-primary" id="log-energy" style="width:100%">' +
        '+ Log Energy Usage</button>'
    );
  }

  /* ═══════════════════════════════════════════
     EVENT BINDING
     ═══════════════════════════════════════════ */

  /**
   * Bind all event listeners.
   * @param {HTMLElement} container
   * @private
   */
  function bindEvents(container) {
    /* Tab switching */
    var tabBar = container.querySelector('#activity-tabs');
    if (tabBar) {
      tabBar.addEventListener('click', function(e) {
        var btn = e.target.closest('[role="tab"]');
        if (btn) { switchTab(container, btn); }
      });
      EcoStep.A11y.setupTabKeyboard(tabBar, function(tab) {
        switchTab(container, tab);
      });
    }

    /* Transport events */
    var modeSelect = container.querySelector('#transport-mode');
    var distInput = container.querySelector('#transport-distance');
    if (modeSelect) {
      modeSelect.addEventListener('change', function() { updateTransportPreview(container); });
    }
    if (distInput) {
      distInput.addEventListener('input', function() {
        debouncePreview(function() { updateTransportPreview(container); });
      });
    }

    /* Quick action buttons */
    container.querySelectorAll('.quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dist = parseFloat(btn.dataset.distance) || 8;
        var input = container.querySelector('#transport-distance');
        if (input) {
          input.value = dist;
          updateTransportPreview(container);
        }
      });
    });

    /* Log transport */
    var logTransport = container.querySelector('#log-transport');
    if (logTransport) {
      logTransport.addEventListener('click', function() { submitTransport(container); });
    }

    /* Meal cards */
    container.querySelectorAll('.meal-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.meal-count-btn')) { return; }
        toggleMeal(card, container);
      });
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.target.closest('.meal-count-btn')) { toggleMeal(card, container); }
        }
      });
    });

    /* Meal count buttons */
    container.querySelectorAll('.meal-count-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var card = btn.closest('.meal-card');
        var type = card.dataset.type;
        var valueEl = card.querySelector('.meal-count-value');
        var current = dietSelections[type] || 1;

        if (btn.dataset.action === 'plus' && current < 10) {
          current++;
        } else if (btn.dataset.action === 'minus' && current > 1) {
          current--;
        }

        dietSelections[type] = current;
        valueEl.textContent = current;
        updateDietPreview(container);
      });
    });

    /* Log diet */
    var logDiet = container.querySelector('#log-diet');
    if (logDiet) {
      logDiet.addEventListener('click', function() { submitDiet(container); });
    }

    /* Energy inputs */
    var elecInput = container.querySelector('#energy-electricity');
    var lpgInput = container.querySelector('#energy-lpg');
    var acSlider = container.querySelector('#energy-ac');

    [elecInput, lpgInput].forEach(function(inp) {
      if (inp) {
        inp.addEventListener('input', function() {
          debouncePreview(function() { updateEnergyPreview(container); });
        });
      }
    });

    if (acSlider) {
      acSlider.addEventListener('input', function() {
        var display = container.querySelector('#ac-value-display');
        if (display) { display.textContent = acSlider.value; }
        acSlider.setAttribute('aria-valuenow', acSlider.value);
        updateEnergyPreview(container);
      });
    }

    /* Log energy */
    var logEnergy = container.querySelector('#log-energy');
    if (logEnergy) {
      logEnergy.addEventListener('click', function() { submitEnergy(container); });
    }
  }

  /* ═══════════════════════════════════════════
     TAB SWITCHING
     ═══════════════════════════════════════════ */

  /**
   * Switch the active tab.
   * @param {HTMLElement} container
   * @param {HTMLElement} activeTab
   * @private
   */
  function switchTab(container, activeTab) {
    /* Update tab buttons */
    container.querySelectorAll('[role="tab"]').forEach(function(tab) {
      var isActive = tab === activeTab;
      tab.setAttribute('aria-selected', String(isActive));
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    /* Update panels */
    container.querySelectorAll('[role="tabpanel"]').forEach(function(panel) {
      panel.classList.remove('active');
    });

    var panelId = activeTab.getAttribute('aria-controls');
    var panel = container.querySelector('#' + panelId);
    if (panel) { panel.classList.add('active'); }
  }

  /* ═══════════════════════════════════════════
     PREVIEWS
     ═══════════════════════════════════════════ */

  /**
   * Debounce the preview update.
   * @param {Function} fn
   * @private
   */
  function debouncePreview(fn) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(fn, 300);
  }

  /**
   * Update transport CO₂ preview.
   * @param {HTMLElement} container
   * @private
   */
  function updateTransportPreview(container) {
    var mode = container.querySelector('#transport-mode').value;
    var dist = parseFloat(container.querySelector('#transport-distance').value) || 0;
    var co2 = EcoStep.Data.calculateEmission('transport', mode, dist);
    updatePreviewDisplay(container.querySelector('#transport-preview'), co2);
  }

  /**
   * Update diet CO₂ preview.
   * @param {HTMLElement} container
   * @private
   */
  function updateDietPreview(container) {
    var total = 0;
    Object.keys(dietSelections).forEach(function(type) {
      total += EcoStep.Data.calculateEmission('diet', type, dietSelections[type]);
    });
    updatePreviewDisplay(container.querySelector('#diet-preview'), total);
  }

  /**
   * Update energy CO₂ preview.
   * @param {HTMLElement} container
   * @private
   */
  function updateEnergyPreview(container) {
    var elec = parseFloat(container.querySelector('#energy-electricity').value) || 0;
    var lpg = parseFloat(container.querySelector('#energy-lpg').value) || 0;
    var ac = parseFloat(container.querySelector('#energy-ac').value) || 0;

    var total = EcoStep.Data.calculateEmission('energy', 'electricity', elec) +
                EcoStep.Data.calculateEmission('energy', 'lpg', lpg) +
                EcoStep.Data.calculateEmission('energy', 'ac', ac);

    updatePreviewDisplay(container.querySelector('#energy-preview'), total);
  }

  /**
   * Update a preview display element.
   * @param {HTMLElement} el
   * @param {number} co2
   * @private
   */
  function updatePreviewDisplay(el, co2) {
    if (!el) { return; }
    var formatted = co2.toFixed(2);
    el.textContent = (co2 > 2 ? '⚠️' : '🌱') + ' ' + formatted + ' kg CO₂';
    el.classList.toggle('high', co2 > 2);
  }

  /* ═══════════════════════════════════════════
     SUBMISSION
     ═══════════════════════════════════════════ */

  /**
   * Submit a transport entry.
   * @param {HTMLElement} container
   * @private
   */
  async function submitTransport(container) {
    var mode = container.querySelector('#transport-mode').value;
    var distInput = container.querySelector('#transport-distance');
    var dist = parseFloat(distInput.value);
    var errorEl = container.querySelector('#transport-error');

    /* Validate */
    if (!dist || dist <= 0 || dist > 500) {
      showError(distInput, errorEl, 'Enter a valid distance (0.1 – 500 km).');
      return;
    }
    clearError(distInput, errorEl);

    var modeData = EcoStep.Data.TRANSPORT_MODES[mode];
    var co2 = EcoStep.Data.calculateEmission('transport', mode, dist);

    await EcoStep.Storage.saveEntry({
      date: EcoStep.Data.formatDate(new Date()),
      category: 'transport',
      type: mode,
      label: modeData ? modeData.label : mode,
      amount: dist,
      unit: 'km',
      co2: co2
    });

    /* Reset */
    distInput.value = '';
    updateTransportPreview(container);

    showToast('✅', modeData.icon + ' ' + dist + ' km logged — ' + co2.toFixed(2) + ' kg CO₂');
    EcoStep.A11y.announce('Transport entry logged: ' + co2.toFixed(2) + ' kg CO₂');

    /* Trigger dashboard refresh */
    document.dispatchEvent(new CustomEvent('ecostep:entryLogged'));
  }

  /**
   * Submit diet entries.
   * @param {HTMLElement} container
   * @private
   */
  async function submitDiet(container) {
    var types = Object.keys(dietSelections);
    if (types.length === 0) {
      EcoStep.A11y.announce('Please select at least one meal type.');
      showToast('⚠️', 'Select at least one meal type first.');
      return;
    }

    var totalCO2 = 0;
    var totalMeals = 0;

    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      var count = dietSelections[type];
      var typeData = EcoStep.Data.DIET_TYPES[type];
      var co2 = EcoStep.Data.calculateEmission('diet', type, count);

      await EcoStep.Storage.saveEntry({
        date: EcoStep.Data.formatDate(new Date()),
        category: 'diet',
        type: type,
        label: typeData ? typeData.label : type,
        amount: count,
        unit: 'meals',
        co2: co2
      });

      totalCO2 += co2;
      totalMeals += count;
    }

    /* Reset selections */
    dietSelections = {};
    container.querySelectorAll('.meal-card').forEach(function(card) {
      card.classList.remove('selected');
      card.setAttribute('aria-checked', 'false');
      card.querySelector('.meal-count').classList.add('hidden');
      card.querySelector('.meal-count-value').textContent = '1';
    });
    updateDietPreview(container);

    showToast('✅', totalMeals + ' meal(s) logged — ' + totalCO2.toFixed(2) + ' kg CO₂');
    EcoStep.A11y.announce('Diet entries logged: ' + totalCO2.toFixed(2) + ' kg CO₂');
    document.dispatchEvent(new CustomEvent('ecostep:entryLogged'));
  }

  /**
   * Submit energy entries.
   * @param {HTMLElement} container
   * @private
   */
  async function submitEnergy(container) {
    var elec = parseFloat(container.querySelector('#energy-electricity').value) || 0;
    var lpg = parseFloat(container.querySelector('#energy-lpg').value) || 0;
    var ac = parseFloat(container.querySelector('#energy-ac').value) || 0;

    if (elec === 0 && lpg === 0 && ac === 0) {
      showToast('⚠️', 'Enter at least one energy value.');
      EcoStep.A11y.announce('Please enter at least one energy value.');
      return;
    }

    var totalCO2 = 0;

    if (elec > 0) {
      var co2Elec = EcoStep.Data.calculateEmission('energy', 'electricity', elec);
      await EcoStep.Storage.saveEntry({
        date: EcoStep.Data.formatDate(new Date()),
        category: 'energy', type: 'electricity',
        label: 'Electricity (KSEB)', amount: elec, unit: 'kWh', co2: co2Elec
      });
      totalCO2 += co2Elec;
    }

    if (lpg > 0) {
      var co2Lpg = EcoStep.Data.calculateEmission('energy', 'lpg', lpg);
      await EcoStep.Storage.saveEntry({
        date: EcoStep.Data.formatDate(new Date()),
        category: 'energy', type: 'lpg',
        label: 'LPG Cooking Gas', amount: lpg, unit: 'kg', co2: co2Lpg
      });
      totalCO2 += co2Lpg;
    }

    if (ac > 0) {
      var co2Ac = EcoStep.Data.calculateEmission('energy', 'ac', ac);
      await EcoStep.Storage.saveEntry({
        date: EcoStep.Data.formatDate(new Date()),
        category: 'energy', type: 'ac',
        label: 'Air Conditioning', amount: ac, unit: 'hours', co2: co2Ac
      });
      totalCO2 += co2Ac;
    }

    /* Reset */
    container.querySelector('#energy-electricity').value = '';
    container.querySelector('#energy-lpg').value = '';
    container.querySelector('#energy-ac').value = 0;
    container.querySelector('#ac-value-display').textContent = '0';
    updateEnergyPreview(container);

    showToast('✅', 'Energy usage logged — ' + totalCO2.toFixed(2) + ' kg CO₂');
    EcoStep.A11y.announce('Energy entries logged: ' + totalCO2.toFixed(2) + ' kg CO₂');
    document.dispatchEvent(new CustomEvent('ecostep:entryLogged'));
  }

  /* ═══════════════════════════════════════════
     MEAL TOGGLE
     ═══════════════════════════════════════════ */

  /**
   * Toggle a meal card selection.
   * @param {HTMLElement} card
   * @param {HTMLElement} container
   * @private
   */
  function toggleMeal(card, container) {
    var type = card.dataset.type;
    var countEl = card.querySelector('.meal-count');

    if (card.classList.contains('selected')) {
      card.classList.remove('selected');
      card.setAttribute('aria-checked', 'false');
      countEl.classList.add('hidden');
      delete dietSelections[type];
    } else {
      card.classList.add('selected');
      card.setAttribute('aria-checked', 'true');
      countEl.classList.remove('hidden');
      dietSelections[type] = 1;
      card.querySelector('.meal-count-value').textContent = '1';
    }

    updateDietPreview(container);
  }

  /* ═══════════════════════════════════════════
     VALIDATION HELPERS
     ═══════════════════════════════════════════ */

  /**
   * Show a validation error on an input.
   * @param {HTMLElement} input
   * @param {HTMLElement} errorEl
   * @param {string} message
   * @private
   */
  function showError(input, errorEl, message) {
    input.setAttribute('aria-invalid', 'true');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
    EcoStep.A11y.announce('Error: ' + message);
  }

  /**
   * Clear a validation error.
   * @param {HTMLElement} input
   * @param {HTMLElement} errorEl
   * @private
   */
  function clearError(input, errorEl) {
    input.removeAttribute('aria-invalid');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }
  }

  /* ═══════════════════════════════════════════
     TOAST
     ═══════════════════════════════════════════ */

  /**
   * Show a toast notification.
   * @param {string} icon
   * @param {string} message
   */
  function showToast(icon, message) {
    var container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML =
      '<span class="toast-icon">' + icon + '</span>' +
      '<span class="toast-message">' + EcoStep.Auth.sanitize(message) + '</span>';

    container.appendChild(toast);

    setTimeout(function() {
      toast.classList.add('leaving');
      setTimeout(function() {
        if (toast.parentNode) { toast.parentNode.removeChild(toast); }
      }, 300);
    }, 3500);
  }

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */

  window.EcoStep.Tracker = {
    render: render,
    showToast: showToast
  };

})();
