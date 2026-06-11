/**
 * @fileoverview EcoStep — Smart insights engine.
 * Analyzes user activity data and generates context-aware,
 * district-specific reduction tips ranked by impact.
 *
 * @namespace EcoStep.Insights
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /** Maximum insights shown per refresh */
  var MAX_INSIGHTS = 3;

  /** Days before a tip can repeat */
  var TIP_COOLDOWN_DAYS = 7;

  /* ═══════════════════════════════════════════
     RULE DEFINITIONS
     ═══════════════════════════════════════════ */

  /**
   * @typedef {Object} InsightRule
   * @property {string}   id       - Unique rule ID
   * @property {string}   type     - 'high-impact' | 'positive' | 'motivational' | 'alert'
   * @property {string}   icon     - Emoji icon
   * @property {number}   impact   - Priority score (higher = shown first)
   * @property {Function} check    - (data) => boolean — should this rule fire?
   * @property {Function} message  - (data) => string — the insight text
   */

  /** @type {InsightRule[]} */
  var RULES = [
    /* ─── High Impact Rules ─── */
    {
      id: 'switch_car_to_bus',
      type: 'high-impact',
      icon: '🚌',
      impact: 95,
      check: function(d) {
        return countByType(d.entries, 'transport', ['car_petrol', 'car_diesel']) >= 2;
      },
      message: function(d) {
        var bestMode = getBestPublicTransit(d.districtId);
        return '<strong>Switch one car trip to ' + bestMode + '</strong> — ' +
               'you could save ~1.3 kg CO₂ daily. That\'s nearly 475 kg/year!';
      }
    },
    {
      id: 'auto_to_metro',
      type: 'high-impact',
      icon: '🚇',
      impact: 90,
      check: function(d) {
        return d.districtId === 'ernakulam' &&
               countByType(d.entries, 'transport', ['auto_rickshaw_cng', 'auto_rickshaw_petrol']) >= 1;
      },
      message: function() {
        return '<strong>Try Kochi Metro or Water Metro</strong> for your commute — ' +
               '70% lower emissions than an auto-rickshaw, and often faster!';
      }
    },
    {
      id: 'beef_to_fish',
      type: 'high-impact',
      icon: '🐟',
      impact: 85,
      check: function(d) {
        return countByType(d.entries, 'diet', ['beef']) >= 1;
      },
      message: function() {
        return '<strong>Switching beef to fish</strong> cuts meal emissions by 76%. ' +
               'Kerala\'s fresh seafood is delicious and far more sustainable!';
      }
    },
    {
      id: 'solar_rooftop',
      type: 'high-impact',
      icon: '☀️',
      impact: 80,
      check: function(d) {
        var elecTotal = sumByType(d.entries, 'energy', 'electricity');
        return elecTotal > 8;
      },
      message: function() {
        return '<strong>KSEB solar rooftop subsidy</strong> could cut your grid use by 40%. ' +
               'Kerala gets ~300 sunny days — perfect for solar panels!';
      }
    },
    {
      id: 'suv_emissions',
      type: 'high-impact',
      icon: '🚙',
      impact: 75,
      check: function(d) {
        return countByType(d.entries, 'transport', ['jeep_suv']) >= 1;
      },
      message: function() {
        return '<strong>SUVs emit 45% more than sedans.</strong> Consider carpooling ' +
               'or using public transport for daily commutes.';
      }
    },

    /* ─── Medium Impact Rules ─── */
    {
      id: 'meatless_day',
      type: 'high-impact',
      icon: '🥗',
      impact: 70,
      check: function(d) {
        return countByType(d.entries, 'diet', ['chicken', 'beef', 'fish']) >= 3;
      },
      message: function() {
        return '<strong>One meatless day per week</strong> saves ~200 kg CO₂ per year. ' +
               'Kerala\'s sadya thali is a delicious start!';
      }
    },
    {
      id: 'ac_temperature',
      type: 'high-impact',
      icon: '❄️',
      impact: 65,
      check: function(d) {
        var acTotal = sumByType(d.entries, 'energy', 'ac');
        return acTotal > 4;
      },
      message: function(d) {
        var acHours = sumByType(d.entries, 'energy', 'ac');
        return '<strong>Set your AC to 26°C</strong> instead of 22°C — saves 24% energy. ' +
               'You used ' + acHours.toFixed(1) + 'h today; that\'s ₹' +
               Math.round(acHours * 7) + ' on your KSEB bill!';
      }
    },
    {
      id: 'cycling_option',
      type: 'high-impact',
      icon: '🚲',
      impact: 60,
      check: function(d) {
        return d.entries.some(function(e) {
          return e.category === 'transport' &&
                 ['auto_rickshaw_cng', 'auto_rickshaw_petrol', 'two_wheeler'].indexOf(e.type) >= 0 &&
                 e.amount <= 5;
        });
      },
      message: function() {
        return '<strong>Short trips under 5 km?</strong> Try cycling or walking — ' +
               'zero emissions, great exercise, and often just as fast in city traffic!';
      }
    },

    /* ─── Alert Rules ─── */
    {
      id: 'weekly_increase',
      type: 'alert',
      icon: '📈',
      impact: 55,
      check: function(d) {
        return d.weeklyChange > 15;
      },
      message: function(d) {
        return '<strong>Your emissions rose ' + Math.round(d.weeklyChange) +
               '% this week.</strong> Main contributor: ' + d.topCategory +
               '. Small changes in this area can help!';
      }
    },

    /* ─── Positive Rules ─── */
    {
      id: 'below_average',
      type: 'positive',
      icon: '🌿',
      impact: 50,
      check: function(d) {
        return d.todayTotal > 0 && d.todayTotal < EcoStep.Data.NATIONAL_AVG_DAILY;
      },
      message: function(d) {
        var pct = Math.round((1 - d.todayTotal / EcoStep.Data.NATIONAL_AVG_DAILY) * 100);
        return '<strong>You\'re ' + pct + '% below India\'s daily average</strong> — ' +
               'excellent work! Keep these sustainable habits going. 🌍';
      }
    },
    {
      id: 'green_commute',
      type: 'positive',
      icon: '🚶',
      impact: 45,
      check: function(d) {
        return d.entries.some(function(e) {
          return e.category === 'transport' &&
                 (e.type === 'walking' || e.type === 'cycling');
        });
      },
      message: function() {
        return '<strong>Zero-emission commute today!</strong> Walking and cycling are ' +
               'the greenest ways to travel. Your lungs and the planet thank you! 💚';
      }
    },
    {
      id: 'vegan_choice',
      type: 'positive',
      icon: '🥬',
      impact: 40,
      check: function(d) {
        return countByType(d.entries, 'diet', ['vegan']) >= 1;
      },
      message: function() {
        return '<strong>Vegan meals have the lowest carbon footprint</strong> — ' +
               '40% less than vegetarian and 94% less than beef. Great choice!';
      }
    },

    /* ─── Motivational Rules ─── */
    {
      id: 'streak_7',
      type: 'motivational',
      icon: '🔥',
      impact: 35,
      check: function(d) {
        return d.streak >= 7 && d.streak < 30;
      },
      message: function(d) {
        return '<strong>🎉 ' + d.streak + '-day streak!</strong> Consistency is key to ' +
               'understanding your footprint. Keep tracking!';
      }
    },
    {
      id: 'streak_30',
      type: 'motivational',
      icon: '🏆',
      impact: 38,
      check: function(d) {
        return d.streak >= 30;
      },
      message: function(d) {
        return '<strong>🏆 ' + d.streak + '-day streak!</strong> You\'re a sustainability champion! ' +
               'A full month of tracking shows incredible dedication.';
      }
    },
    {
      id: 'first_entry',
      type: 'motivational',
      icon: '🌱',
      impact: 30,
      check: function(d) {
        return d.streak === 1 && d.entries.length <= 3;
      },
      message: function() {
        return '<strong>Welcome to your sustainability journey!</strong> ' +
               'Every entry helps build a clearer picture of your footprint. ' +
               'Try logging all three categories today!';
      }
    }
  ];

  /* ═══════════════════════════════════════════
     ANALYSIS & RENDERING
     ═══════════════════════════════════════════ */

  /**
   * Generate and render insights for the current user.
   * @param {HTMLElement} container
   * @returns {Promise<void>}
   */
  async function render(container) {
    var profile = EcoStep.Auth.getCurrentProfile();
    if (!profile) { return; }

    var today = EcoStep.Data.formatDate(new Date());
    var todaySummary = await EcoStep.Storage.getDailySummary(today);
    var streak = await EcoStep.Storage.getStreak();
    var weekData = await EcoStep.Storage.getHistorySummaries(7);

    /* Calculate weekly change */
    var thisWeekTotal = 0;
    var lastWeekEstimate = 0;
    weekData.forEach(function(d, i) {
      if (i >= 4) { thisWeekTotal += d.total; }
      else { lastWeekEstimate += d.total; }
    });
    /* Normalize to comparable periods */
    var weeklyChange = lastWeekEstimate > 0
      ? ((thisWeekTotal / 3) - (lastWeekEstimate / 4)) / (lastWeekEstimate / 4) * 100
      : 0;

    /* Find top category */
    var catTotals = { transport: 0, diet: 0, energy: 0 };
    todaySummary.entries.forEach(function(e) {
      if (catTotals.hasOwnProperty(e.category)) {
        catTotals[e.category] += e.co2 || 0;
      }
    });
    var topCategory = 'transport';
    Object.keys(catTotals).forEach(function(k) {
      if (catTotals[k] > catTotals[topCategory]) { topCategory = k; }
    });

    var analysisData = {
      entries: todaySummary.entries,
      todayTotal: todaySummary.total,
      streak: streak,
      districtId: profile.districtId,
      weeklyChange: weeklyChange,
      topCategory: topCategory
    };

    /* Get shown tips history */
    var shownTips = await EcoStep.Storage.getData('shownTips', {});
    var now = Date.now();

    /* Evaluate rules */
    var triggered = [];
    RULES.forEach(function(rule) {
      /* Check cooldown */
      if (shownTips[rule.id]) {
        var daysSince = (now - shownTips[rule.id]) / (1000 * 60 * 60 * 24);
        if (daysSince < TIP_COOLDOWN_DAYS && rule.type !== 'positive' && rule.type !== 'motivational') {
          return;
        }
      }

      try {
        if (rule.check(analysisData)) {
          triggered.push({
            id: rule.id,
            type: rule.type,
            icon: rule.icon,
            impact: rule.impact,
            html: rule.message(analysisData)
          });
        }
      } catch (e) {
        /* Skip rules that error */
      }
    });

    /* Sort by impact (highest first) and take top N */
    triggered.sort(function(a, b) { return b.impact - a.impact; });
    var selected = triggered.slice(0, MAX_INSIGHTS);

    /* Update shown tips */
    selected.forEach(function(tip) {
      shownTips[tip.id] = now;
    });
    await EcoStep.Storage.setData('shownTips', shownTips);

    /* Render */
    renderInsights(container, selected, todaySummary);
  }

  /**
   * Render the insights panel.
   * @param {HTMLElement} container
   * @param {Array} insights
   * @param {Object} todaySummary
   * @private
   */
  function renderInsights(container, insights, todaySummary) {
    var html =
      '<div class="card section" id="insights-panel" role="complementary" ' +
        'aria-label="Smart insights and tips">' +
        '<div class="card-header">' +
          '<h2 class="card-title"><span class="section-title-icon">💡</span> Smart Insights</h2>' +
        '</div>';

    if (insights.length === 0) {
      if (todaySummary.entries.length === 0) {
        html +=
          '<div class="empty-state">' +
            '<div class="empty-state-icon">🌍</div>' +
            '<p class="empty-state-text">Log some activities above to get personalized insights!</p>' +
          '</div>';
      } else {
        html +=
          '<div class="insight-item positive">' +
            '<span class="insight-icon">✨</span>' +
            '<span class="insight-text">' +
              '<strong>Looking good!</strong> Keep logging consistently to unlock more detailed insights.' +
            '</span>' +
          '</div>';
      }
    } else {
      html += '<div class="insights-list" role="list">';
      insights.forEach(function(tip) {
        html +=
          '<div class="insight-item ' + tip.type + '" role="listitem">' +
            '<span class="insight-icon">' + tip.icon + '</span>' +
            '<span class="insight-text">' + tip.html + '</span>' +
          '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  /* ═══════════════════════════════════════════
     ANALYSIS HELPERS
     ═══════════════════════════════════════════ */

  /**
   * Count entries of specific types within a category.
   * @param {Array} entries
   * @param {string} category
   * @param {string[]} types
   * @returns {number}
   * @private
   */
  function countByType(entries, category, types) {
    return entries.filter(function(e) {
      return e.category === category && types.indexOf(e.type) >= 0;
    }).length;
  }

  /**
   * Sum amounts for a specific category and type.
   * @param {Array} entries
   * @param {string} category
   * @param {string} type
   * @returns {number}
   * @private
   */
  function sumByType(entries, category, type) {
    return entries
      .filter(function(e) { return e.category === category && e.type === type; })
      .reduce(function(sum, e) { return sum + (e.amount || 0); }, 0);
  }

  /**
   * Get the best public transit option name for a district.
   * @param {string} districtId
   * @returns {string}
   * @private
   */
  function getBestPublicTransit(districtId) {
    var district = EcoStep.Data.DISTRICTS[districtId];
    if (!district) { return 'public bus'; }

    if (district.transportModes.indexOf('kochi_metro') >= 0) { return 'Kochi Metro'; }
    if (district.transportModes.indexOf('water_metro') >= 0) { return 'Water Metro'; }
    return 'KSRTC bus';
  }

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */

  window.EcoStep.Insights = {
    render: render
  };

})();
