/**
 * @fileoverview EcoStep — Main application controller.
 * Orchestrates auth, dashboard, tracker, insights, charts, and export.
 * Manages view switching, date navigation, theme toggle, and PWA setup.
 *
 * @namespace EcoStep.App
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /** Current viewing date */
  var currentDate = new Date();

  /** Debounce timer for last-active updates */
  var heartbeatDebounce = 0;

  /* ═══════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════ */

  /**
   * Boot the application.
   */
  function init() {
    /* Initialize accessibility module */
    EcoStep.A11y.init();

    /* Register service worker for PWA */
    registerSW();

    /* Check if test mode */
    if (window.location.search.indexOf('test=true') >= 0) {
      if (EcoStep.Tests) { EcoStep.Tests.run(); }
      return;
    }

    /* Show auth or dashboard */
    showAuthScreen();
  }

  /* ═══════════════════════════════════════════
     AUTH SCREEN
     ═══════════════════════════════════════════ */

  /**
   * Render the authentication screen.
   */
  function showAuthScreen() {
    var app = document.getElementById('app');
    var profiles = EcoStep.Storage.getProfiles();

    var html =
      '<div class="auth-screen" id="auth-screen">' +
        '<div class="card auth-card">' +
          '<span class="auth-logo" aria-hidden="true">🌿</span>' +
          '<h1 class="auth-title">EcoStep</h1>' +
          '<p class="auth-subtitle">Kerala Carbon Footprint Tracker</p>';

    if (profiles.length > 0) {
      html +=
        '<p class="text-sm text-muted mb-md">Select your profile:</p>' +
        '<div class="profile-list" id="profile-list">';

      profiles.forEach(function(p) {
        var initials = EcoStep.Auth.getInitials(p.name);
        var districtName = EcoStep.Data.DISTRICTS[p.districtId]
          ? EcoStep.Data.DISTRICTS[p.districtId].name : p.districtId;
        var expired = EcoStep.Storage.isSessionExpired(p.id);

        html +=
          '<button class="profile-card" data-userid="' + p.id + '" ' +
            'aria-label="Log in as ' + EcoStep.Auth.sanitize(p.name) + '">' +
            '<div class="user-avatar" style="background:' + (p.color || '#22c55e') + '">' +
              initials +
            '</div>' +
            '<div class="profile-card-info">' +
              '<div class="profile-card-name">' + EcoStep.Auth.sanitize(p.name) + '</div>' +
              '<div class="profile-card-district">' + districtName +
                (expired ? ' · <span style="color:var(--amber)">Session expired</span>' : '') +
              '</div>' +
            '</div>' +
          '</button>';
      });

      html += '</div>';
    }

    html +=
          '<button class="btn btn-primary" id="btn-create-profile" style="width:100%">' +
            '+ Create New Profile</button>' +
        '</div>' +
      '</div>';

    app.innerHTML = html;

    /* Bind profile click */
    app.querySelectorAll('.profile-card').forEach(function(card) {
      card.addEventListener('click', function() {
        showPinEntry(card.dataset.userid);
      });
    });

    /* Bind create profile */
    var createBtn = document.getElementById('btn-create-profile');
    if (createBtn) {
      createBtn.addEventListener('click', showCreateProfile);
    }
  }

  /**
   * Show the PIN entry screen for a profile.
   * @param {string} userId
   */
  function showPinEntry(userId) {
    var profiles = EcoStep.Storage.getProfiles();
    var profile = profiles.find(function(p) { return p.id === userId; });
    if (!profile) { return; }

    var app = document.getElementById('app');
    var initials = EcoStep.Auth.getInitials(profile.name);

    app.innerHTML =
      '<div class="auth-screen" id="auth-screen">' +
        '<div class="card auth-card">' +
          '<div class="user-avatar" style="background:' + (profile.color || '#22c55e') +
            ';width:56px;height:56px;font-size:1.25rem;margin:0 auto var(--space-md)">' +
            initials + '</div>' +
          '<h1 class="auth-title" style="font-size:1.25rem">' +
            EcoStep.Auth.sanitize(profile.name) + '</h1>' +
          '<p class="auth-subtitle">Enter your 6-digit PIN</p>' +

          '<div class="pin-input-group" id="pin-group">' +
            '<input class="pin-digit" type="password" inputmode="numeric" maxlength="1" ' +
              'autocomplete="off" aria-label="PIN digit 1">' +
            '<input class="pin-digit" type="password" inputmode="numeric" maxlength="1" ' +
              'autocomplete="off" aria-label="PIN digit 2">' +
            '<input class="pin-digit" type="password" inputmode="numeric" maxlength="1" ' +
              'autocomplete="off" aria-label="PIN digit 3">' +
            '<input class="pin-digit" type="password" inputmode="numeric" maxlength="1" ' +
              'autocomplete="off" aria-label="PIN digit 4">' +
            '<input class="pin-digit" type="password" inputmode="numeric" maxlength="1" ' +
              'autocomplete="off" aria-label="PIN digit 5">' +
            '<input class="pin-digit" type="password" inputmode="numeric" maxlength="1" ' +
              'autocomplete="off" aria-label="PIN digit 6">' +
          '</div>' +

          '<div class="lockout-message" id="pin-error" role="alert"></div>' +

          '<div class="flex items-center justify-between mt-md">' +
            '<button class="btn btn-ghost btn-sm" id="btn-forgot-pin">Forgot PIN?</button>' +
            '<button class="btn btn-ghost btn-sm" id="btn-back-auth">← Back</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* Focus first PIN digit */
    var digits = app.querySelectorAll('.pin-digit');
    if (digits.length > 0) { digits[0].focus(); }

    /* PIN digit navigation */
    digits.forEach(function(digit, idx) {
      digit.addEventListener('input', function() {
        if (digit.value.length === 1 && idx < digits.length - 1) {
          digits[idx + 1].focus();
        }
        /* Auto-submit on last digit */
        if (idx === digits.length - 1 && digit.value.length === 1) {
          var pin = Array.from(digits).map(function(d) { return d.value; }).join('');
          if (pin.length === 6) { attemptLogin(userId, pin); }
        }
      });

      digit.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && digit.value === '' && idx > 0) {
          digits[idx - 1].focus();
          digits[idx - 1].value = '';
        }
      });

      /* Only allow digits */
      digit.addEventListener('beforeinput', function(e) {
        if (e.data && !/^\d$/.test(e.data)) {
          e.preventDefault();
        }
      });
    });

    /* Back button */
    document.getElementById('btn-back-auth').addEventListener('click', showAuthScreen);

    /* Forgot PIN */
    document.getElementById('btn-forgot-pin').addEventListener('click', function() {
      showPinReset(userId);
    });
  }

  /**
   * Attempt login with entered PIN.
   * @param {string} userId
   * @param {string} pin
   * @private
   */
  async function attemptLogin(userId, pin) {
    var errorEl = document.getElementById('pin-error');
    var result = await EcoStep.Auth.login(userId, pin);

    if (result.success) {
      EcoStep.A11y.announce('Login successful. Welcome back!');
      showDashboard();
    } else {
      errorEl.textContent = result.error;
      errorEl.classList.add('visible');
      EcoStep.A11y.announce(result.error, 'assertive');

      /* Shake and clear PIN */
      var digits = document.querySelectorAll('.pin-digit');
      digits.forEach(function(d) {
        d.value = '';
        d.setAttribute('aria-invalid', 'true');
      });
      setTimeout(function() {
        digits.forEach(function(d) { d.removeAttribute('aria-invalid'); });
        if (digits[0]) { digits[0].focus(); }
      }, 500);

      /* Auto-retry countdown for lockout */
      if (result.lockoutSeconds) {
        var countdown = result.lockoutSeconds;
        var timer = setInterval(function() {
          countdown--;
          if (countdown <= 0) {
            clearInterval(timer);
            errorEl.textContent = 'You may try again now.';
            setTimeout(function() { errorEl.classList.remove('visible'); }, 2000);
          } else {
            errorEl.textContent = 'Locked out. Try again in ' + countdown + 's.';
          }
        }, 1000);
      }
    }
  }

  /**
   * Show the PIN reset screen (security questions).
   * @param {string} userId
   */
  function showPinReset(userId) {
    var questions = EcoStep.Auth.getSecurityQuestions(userId);
    if (!questions) {
      EcoStep.Tracker.showToast('⚠️', 'No security questions found for this profile.');
      return;
    }

    var app = document.getElementById('app');
    var html =
      '<div class="auth-screen">' +
        '<div class="card auth-card" style="max-width:480px">' +
          '<h1 class="auth-title" style="font-size:1.25rem">Reset PIN</h1>' +
          '<p class="auth-subtitle">Answer your security questions</p>';

    questions.forEach(function(q, i) {
      html +=
        '<div class="form-group">' +
          '<label for="reset-q' + i + '" class="form-label">' + (i + 1) + '. ' +
            EcoStep.Auth.sanitize(q.question) + '</label>' +
          '<input type="text" id="reset-q' + i + '" class="form-input" ' +
            'data-question-id="' + q.questionId + '" autocomplete="off" ' +
            'aria-required="true">' +
        '</div>';
    });

    html +=
          '<div class="form-group">' +
            '<label for="reset-new-pin" class="form-label">New 6-digit PIN</label>' +
            '<input type="password" id="reset-new-pin" class="form-input" ' +
              'maxlength="6" inputmode="numeric" autocomplete="off" ' +
              'aria-required="true" placeholder="Enter 6 digits">' +
          '</div>' +
          '<div class="form-error visible" id="reset-error" role="alert" style="display:none"></div>' +
          '<button class="btn btn-primary mt-md" id="btn-reset-submit" style="width:100%">' +
            'Reset PIN</button>' +
          '<button class="btn btn-ghost btn-sm mt-md" id="btn-reset-back">← Back to Login</button>' +
        '</div>' +
      '</div>';

    app.innerHTML = html;

    document.getElementById('btn-reset-back').addEventListener('click', function() {
      showPinEntry(userId);
    });

    document.getElementById('btn-reset-submit').addEventListener('click', async function() {
      var answers = [];
      var answerInputs = app.querySelectorAll('[data-question-id]');
      answerInputs.forEach(function(inp) {
        answers.push({
          questionId: inp.dataset.questionId,
          answer: inp.value
        });
      });

      var newPin = document.getElementById('reset-new-pin').value;
      var errorEl = document.getElementById('reset-error');

      var result = await EcoStep.Auth.resetPin(userId, answers, newPin);

      if (result.success) {
        EcoStep.Tracker.showToast('✅', 'PIN reset successful! Please log in.');
        EcoStep.A11y.announce('PIN has been reset. Please log in with your new PIN.');
        showPinEntry(userId);
      } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
        EcoStep.A11y.announce(result.error, 'assertive');
      }
    });
  }

  /* ═══════════════════════════════════════════
     CREATE PROFILE
     ═══════════════════════════════════════════ */

  /**
   * Show the profile creation form.
   */
  function showCreateProfile() {
    var app = document.getElementById('app');
    var allQuestions = EcoStep.Data.SECURITY_QUESTIONS;
    var districts = EcoStep.Data.getDistrictList();

    var districtOptions = districts.map(function(d) {
      return '<option value="' + d.id + '">' + d.name + '</option>';
    }).join('');

    var questionOptions = allQuestions.map(function(q) {
      return '<option value="' + q.id + '">' + q.question + '</option>';
    }).join('');

    var html =
      '<div class="auth-screen">' +
        '<div class="card auth-card" style="max-width:480px;text-align:left">' +
          '<h1 class="auth-title text-center" style="font-size:1.5rem">Create Profile</h1>' +
          '<p class="auth-subtitle text-center">Set up your EcoStep account</p>' +

          '<div class="form-group">' +
            '<label for="create-name" class="form-label">Your Name</label>' +
            '<input type="text" id="create-name" class="form-input" ' +
              'placeholder="Enter your name" aria-required="true" maxlength="50">' +
          '</div>' +

          '<div class="form-group">' +
            '<label for="create-district" class="form-label">Your District</label>' +
            '<select id="create-district" class="form-select" aria-required="true">' +
              '<option value="">— Select District —</option>' +
              districtOptions +
            '</select>' +
          '</div>' +

          '<div class="form-group">' +
            '<label for="create-pin" class="form-label">6-digit PIN</label>' +
            '<input type="password" id="create-pin" class="form-input" ' +
              'maxlength="6" inputmode="numeric" autocomplete="off" ' +
              'aria-required="true" placeholder="Enter 6 digits">' +
          '</div>' +

          '<div class="form-group">' +
            '<label for="create-pin-confirm" class="form-label">Confirm PIN</label>' +
            '<input type="password" id="create-pin-confirm" class="form-input" ' +
              'maxlength="6" inputmode="numeric" autocomplete="off" ' +
              'aria-required="true" placeholder="Re-enter 6 digits">' +
          '</div>' +

          '<hr style="border-color:var(--glass-border);margin:var(--space-lg) 0">' +
          '<p class="form-label" style="margin-bottom:var(--space-md)">' +
            '🔒 Security Questions (for PIN reset)</p>';

    for (var i = 0; i < 3; i++) {
      html +=
        '<div class="form-group">' +
          '<label for="create-sq-' + i + '" class="form-label">Question ' + (i + 1) + '</label>' +
          '<select id="create-sq-' + i + '" class="form-select" aria-required="true">' +
            '<option value="">— Select Question —</option>' +
            questionOptions +
          '</select>' +
          '<input type="text" id="create-sa-' + i + '" class="form-input mt-sm" ' +
            'placeholder="Your answer" aria-required="true" autocomplete="off">' +
        '</div>';
    }

    html +=
          '<div class="form-error" id="create-error" role="alert"></div>' +
          '<button class="btn btn-primary mt-md" id="btn-create-submit" style="width:100%">' +
            'Create Account</button>' +
          '<button class="btn btn-ghost btn-sm mt-md" id="btn-create-back">← Back</button>' +
        '</div>' +
      '</div>';

    app.innerHTML = html;

    document.getElementById('btn-create-back').addEventListener('click', showAuthScreen);

    document.getElementById('btn-create-submit').addEventListener('click', async function() {
      var errorEl = document.getElementById('create-error');
      errorEl.classList.remove('visible');

      var name = document.getElementById('create-name').value.trim();
      var districtId = document.getElementById('create-district').value;
      var pin = document.getElementById('create-pin').value;
      var pinConfirm = document.getElementById('create-pin-confirm').value;

      /* Validation */
      if (!name) {
        showCreateError(errorEl, 'Please enter your name.');
        return;
      }
      if (!districtId) {
        showCreateError(errorEl, 'Please select your district.');
        return;
      }
      if (!pin || !/^\d{6}$/.test(pin)) {
        showCreateError(errorEl, 'PIN must be exactly 6 digits.');
        return;
      }
      if (pin !== pinConfirm) {
        showCreateError(errorEl, 'PINs do not match.');
        return;
      }

      /* Security questions */
      var securityAnswers = [];
      var usedQuestions = {};
      for (var j = 0; j < 3; j++) {
        var qId = document.getElementById('create-sq-' + j).value;
        var answer = document.getElementById('create-sa-' + j).value.trim();
        if (!qId) {
          showCreateError(errorEl, 'Please select all 3 security questions.');
          return;
        }
        if (usedQuestions[qId]) {
          showCreateError(errorEl, 'Each security question must be different.');
          return;
        }
        if (!answer) {
          showCreateError(errorEl, 'Please answer all security questions.');
          return;
        }
        usedQuestions[qId] = true;
        securityAnswers.push({ questionId: qId, answer: answer });
      }

      try {
        await EcoStep.Auth.createProfile({
          name: name,
          pin: pin,
          districtId: districtId,
          securityAnswers: securityAnswers
        });

        EcoStep.Tracker.showToast('🎉', 'Welcome to EcoStep, ' + name + '!');
        EcoStep.A11y.announce('Profile created successfully. Welcome to EcoStep!');
        showDashboard();
      } catch (e) {
        showCreateError(errorEl, e.message || 'Failed to create profile.');
      }
    });
  }

  /**
   * Show error on create profile form.
   * @param {HTMLElement} el
   * @param {string} msg
   * @private
   */
  function showCreateError(el, msg) {
    el.textContent = msg;
    el.classList.add('visible');
    EcoStep.A11y.announce(msg, 'assertive');
  }

  /* ═══════════════════════════════════════════
     DASHBOARD
     ═══════════════════════════════════════════ */

  /**
   * Show the main dashboard.
   */
  async function showDashboard() {
    var profile = EcoStep.Auth.getCurrentProfile();
    if (!profile) { showAuthScreen(); return; }

    var app = document.getElementById('app');
    var districtName = EcoStep.Data.DISTRICTS[profile.districtId]
      ? EcoStep.Data.DISTRICTS[profile.districtId].name : profile.districtId;

    app.innerHTML =
      '<a href="#main-content" class="skip-link">Skip to main content</a>' +

      /* Header */
      '<header class="app-header" role="banner">' +
        '<div class="app-logo">' +
          '<span class="app-logo-icon" aria-hidden="true">🌿</span>' +
          '<span class="app-logo-text">EcoStep</span>' +
        '</div>' +
        '<div class="header-controls">' +
          '<div class="header-user-info">' +
            '<div class="user-avatar" style="background:' + (profile.color || '#22c55e') + '">' +
              EcoStep.Auth.getInitials(profile.name) + '</div>' +
            '<div>' +
              '<div class="user-name">' + EcoStep.Auth.sanitize(profile.name) + '</div>' +
              '<div class="district-badge">' + districtName + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="date-nav">' +
            '<button class="btn btn-icon btn-ghost" id="date-prev" aria-label="Previous day">◀</button>' +
            '<span class="date-nav-label" id="date-label"></span>' +
            '<button class="btn btn-icon btn-ghost" id="date-next" aria-label="Next day">▶</button>' +
          '</div>' +
          '<button class="btn btn-icon btn-ghost" id="theme-toggle" ' +
            'aria-label="Toggle dark/light theme">🌙</button>' +
          '<button class="btn btn-ghost btn-sm" id="btn-logout">Logout</button>' +
        '</div>' +
      '</header>' +

      '<main id="main-content" class="app-container">' +
        /* Stats */
        '<div class="stats-grid" id="stats-grid"></div>' +

        /* Progress Ring */
        '<div class="card section" id="ring-section">' +
          '<div id="progress-ring-mount"></div>' +
          '<p class="text-center text-sm text-muted" id="comparison-text"></p>' +
        '</div>' +

        /* Tracker (tabs) */
        '<div id="tracker-mount"></div>' +

        /* Insights */
        '<div id="insights-mount"></div>' +

        /* Charts */
        '<div class="card section">' +
          '<div class="card-header">' +
            '<h2 class="card-title"><span class="section-title-icon">📊</span> Weekly Trend</h2>' +
          '</div>' +
          '<div class="chart-container" id="bar-chart-mount"></div>' +
        '</div>' +

        '<div class="card section">' +
          '<div class="card-header">' +
            '<h2 class="card-title"><span class="section-title-icon">🍩</span> Today\'s Breakdown</h2>' +
          '</div>' +
          '<div id="donut-chart-mount"></div>' +
        '</div>' +

        /* Activity Log */
        '<div class="card section">' +
          '<div class="card-header">' +
            '<h2 class="card-title"><span class="section-title-icon">📋</span> Activity Log</h2>' +
          '</div>' +
          '<div class="activity-log" id="activity-log" role="list" ' +
            'aria-label="Today\'s logged activities"></div>' +
        '</div>' +

        /* Export */
        '<div class="card section" id="export-section" role="region" ' +
          'aria-label="Data export">' +
          '<div class="card-header">' +
            '<h2 class="card-title"><span class="section-title-icon">📥</span> Export Data</h2>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="export-range" class="form-label">Date Range</label>' +
            '<select id="export-range" class="form-select">' +
              '<option value="all">All Data</option>' +
              '<option value="7">Last 7 Days</option>' +
              '<option value="30">Last 30 Days</option>' +
            '</select>' +
          '</div>' +
          '<div class="export-buttons">' +
            '<button class="btn btn-secondary" id="export-csv" aria-label="Export as CSV">' +
              '📄 Export CSV</button>' +
            '<button class="btn btn-secondary" id="export-json" aria-label="Export as JSON">' +
              '📋 Export JSON</button>' +
          '</div>' +
        '</div>' +

      '</main>';

    /* Bind header events */
    bindDashboardEvents();

    /* Set date label */
    updateDateLabel();

    /* Load theme preference */
    var prefs = await EcoStep.Storage.getPrefs();
    if (prefs.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.getElementById('theme-toggle').textContent = '☀️';
    }

    /* Render all sections */
    EcoStep.Tracker.render(document.getElementById('tracker-mount'));
    await refreshDashboardData();

    /* Listen for new entries */
    document.addEventListener('ecostep:entryLogged', function() {
      refreshDashboardData();
    });
  }

  /**
   * Bind dashboard event handlers.
   * @private
   */
  function bindDashboardEvents() {
    /* Theme toggle */
    document.getElementById('theme-toggle').addEventListener('click', async function() {
      var html = document.documentElement;
      var isLight = html.getAttribute('data-theme') === 'light';
      html.setAttribute('data-theme', isLight ? 'dark' : 'light');
      this.textContent = isLight ? '🌙' : '☀️';

      var prefs = await EcoStep.Storage.getPrefs();
      prefs.theme = isLight ? 'dark' : 'light';
      await EcoStep.Storage.savePrefs(prefs);
    });

    /* Date navigation */
    document.getElementById('date-prev').addEventListener('click', function() {
      currentDate.setDate(currentDate.getDate() - 1);
      updateDateLabel();
      refreshDashboardData();
    });

    document.getElementById('date-next').addEventListener('click', function() {
      var tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (currentDate < tomorrow) {
        currentDate.setDate(currentDate.getDate() + 1);
        updateDateLabel();
        refreshDashboardData();
      }
    });

    /* Logout */
    document.getElementById('btn-logout').addEventListener('click', function() {
      EcoStep.Auth.logout();
      document.documentElement.removeAttribute('data-theme');
      showAuthScreen();
      EcoStep.A11y.announce('Logged out successfully.');
    });

    /* Export */
    document.getElementById('export-csv').addEventListener('click', function() {
      var range = document.getElementById('export-range').value;
      EcoStep.Export.exportCSV(range);
    });

    document.getElementById('export-json').addEventListener('click', function() {
      var range = document.getElementById('export-range').value;
      EcoStep.Export.exportJSON(range);
    });
  }

  /**
   * Refresh all dashboard data views.
   * @private
   */
  async function refreshDashboardData() {
    var dateStr = EcoStep.Data.formatDate(currentDate);
    var summary = await EcoStep.Storage.getDailySummary(dateStr);
    var streak = await EcoStep.Storage.getStreak();
    var prefs = await EcoStep.Storage.getPrefs();
    var profile = EcoStep.Auth.getCurrentProfile();
    var target = prefs.dailyTarget || EcoStep.Data.DEFAULT_DAILY_TARGET;

    /* Stats grid */
    var pctVsAvg = EcoStep.Data.NATIONAL_AVG_DAILY > 0
      ? Math.round(((summary.total - EcoStep.Data.NATIONAL_AVG_DAILY) / EcoStep.Data.NATIONAL_AVG_DAILY) * 100)
      : 0;
    var vsClass = pctVsAvg <= 0 ? 'eco-green' : (pctVsAvg <= 30 ? 'warning' : 'danger');
    var vsText = pctVsAvg <= 0
      ? (Math.abs(pctVsAvg) + '% below avg ✅')
      : (pctVsAvg + '% above avg ⚠️');

    document.getElementById('stats-grid').innerHTML =
      '<div class="card stat-card">' +
        '<div class="stat-value eco-green" id="stat-total" aria-live="polite">' +
          summary.total.toFixed(1) + '</div>' +
        '<div class="stat-label">kg CO₂ Today</div>' +
      '</div>' +
      '<div class="card stat-card">' +
        '<div class="stat-value eco-green">🔥 ' + streak + '</div>' +
        '<div class="stat-label">Day Streak</div>' +
      '</div>' +
      '<div class="card stat-card">' +
        '<div class="stat-value ' + vsClass + '">' + vsText + '</div>' +
        '<div class="stat-label">vs India Avg (5 kg)</div>' +
      '</div>';

    /* Progress ring */
    EcoStep.Charts.renderProgressRing(
      document.getElementById('progress-ring-mount'),
      summary.total, target
    );

    /* Comparison text */
    if (profile) {
      document.getElementById('comparison-text').textContent =
        EcoStep.Data.getComparison(summary.total, profile.districtId);
    }

    /* Insights */
    await EcoStep.Insights.render(document.getElementById('insights-mount'));

    /* Bar chart (7 days) */
    var history = await EcoStep.Storage.getHistorySummaries(7);
    EcoStep.Charts.renderBarChart(
      document.getElementById('bar-chart-mount'), history
    );

    /* Donut chart */
    EcoStep.Charts.renderDonutChart(
      document.getElementById('donut-chart-mount'), {
        transport: summary.transport,
        diet: summary.diet,
        energy: summary.energy
      }
    );

    /* Activity log */
    renderActivityLog(summary.entries);
  }

  /**
   * Render the activity log list.
   * @param {Array} entries
   * @private
   */
  function renderActivityLog(entries) {
    var logEl = document.getElementById('activity-log');
    if (!logEl) { return; }

    if (entries.length === 0) {
      logEl.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">📋</div>' +
          '<p class="empty-state-text">No activities logged yet today.</p>' +
        '</div>';
      return;
    }

    var html = '';
    entries.forEach(function(e) {
      var icon = getCategoryIcon(e.category, e.type);
      html +=
        '<div class="log-item" role="listitem">' +
          '<div class="log-left">' +
            '<span class="log-icon">' + icon + '</span>' +
            '<span class="log-detail">' +
              '<strong>' + EcoStep.Auth.sanitize(e.label || e.type) + '</strong> · ' +
              e.amount + ' ' + (e.unit || '') +
            '</span>' +
          '</div>' +
          '<span class="log-co2">' + (e.co2 || 0).toFixed(2) + ' kg</span>' +
          '<button class="log-delete" data-id="' + e.id + '" ' +
            'aria-label="Delete entry: ' + EcoStep.Auth.sanitize(e.label || e.type) + '">' +
            '✕</button>' +
        '</div>';
    });

    logEl.innerHTML = html;

    /* Bind delete buttons */
    logEl.querySelectorAll('.log-delete').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await EcoStep.Storage.deleteEntry(btn.dataset.id);
        EcoStep.Tracker.showToast('🗑️', 'Entry deleted.');
        EcoStep.A11y.announce('Activity entry deleted.');
        refreshDashboardData();
      });
    });
  }

  /**
   * Get icon for a category/type.
   * @param {string} category
   * @param {string} type
   * @returns {string}
   * @private
   */
  function getCategoryIcon(category, type) {
    switch (category) {
      case 'transport':
        var mode = EcoStep.Data.TRANSPORT_MODES[type];
        return mode ? mode.icon : '🚗';
      case 'diet':
        var diet = EcoStep.Data.DIET_TYPES[type];
        return diet ? diet.icon : '🍽️';
      case 'energy':
        var energy = EcoStep.Data.ENERGY_TYPES[type];
        return energy ? energy.icon : '⚡';
      default:
        return '📌';
    }
  }

  /**
   * Update the date label in the header.
   * @private
   */
  function updateDateLabel() {
    var label = document.getElementById('date-label');
    if (label) {
      label.textContent = EcoStep.Data.formatDateDisplay(currentDate);
    }
  }

  /* ═══════════════════════════════════════════
     PWA
     ═══════════════════════════════════════════ */

  /**
   * Register the service worker.
   * @private
   */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function(err) {
        console.warn('EcoStep: SW registration failed:', err);
      });
    }
  }

  /* ═══════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════ */

  /* Start when DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.EcoStep.App = {
    showAuthScreen: showAuthScreen,
    showDashboard: showDashboard,
    refreshDashboardData: refreshDashboardData
  };

})();
