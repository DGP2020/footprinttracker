/**
 * @fileoverview EcoStep — Charts module.
 * Renders SVG progress ring, Canvas bar chart, and SVG donut chart.
 * Zero charting library dependencies. Accessible with aria-labels.
 *
 * @namespace EcoStep.Charts
 */
;(function() {
  'use strict';

  window.EcoStep = window.EcoStep || {};

  /* ─── Color Constants ─── */
  var COLORS = {
    transport: '#38bdf8',   /* sky blue */
    diet:      '#f59e0b',   /* amber */
    energy:    '#a855f7',   /* purple */
    grid:      'rgba(255, 255, 255, 0.06)',
    gridText:  'rgba(255, 255, 255, 0.3)',
    bg:        'transparent'
  };

  var LIGHT_COLORS = {
    transport: '#0284c7',
    diet:      '#d97706',
    energy:    '#7c3aed',
    grid:      'rgba(0, 0, 0, 0.06)',
    gridText:  'rgba(0, 0, 0, 0.3)',
    bg:        'transparent'
  };

  /**
   * Get the active color set based on theme.
   * @returns {Object}
   * @private
   */
  function getColors() {
    return document.documentElement.getAttribute('data-theme') === 'light'
      ? LIGHT_COLORS : COLORS;
  }

  /* ═══════════════════════════════════════════
     PROGRESS RING (SVG)
     ═══════════════════════════════════════════ */

  /**
   * Render the progress ring showing today's CO₂ vs target.
   * @param {HTMLElement} container
   * @param {number} value - Current CO₂ in kg
   * @param {number} target - Daily target in kg
   */
  function renderProgressRing(container, value, target) {
    var radius = 70;
    var stroke = 10;
    var normalizedRadius = radius - stroke;
    var circumference = 2 * Math.PI * normalizedRadius;
    var progress = Math.min(value / target, 1.5);
    var offset = circumference - (progress * circumference);

    /* Color based on progress */
    var color;
    if (progress <= 0.6)  { color = '#22c55e'; } /* green */
    else if (progress <= 0.85) { color = '#f59e0b'; } /* amber */
    else { color = '#ef4444'; } /* red */

    var description = EcoStep.A11y.describeChart('ring', { value: value, target: target });

    var svg =
      '<div class="progress-ring-container">' +
        '<svg class="progress-ring" width="' + (radius * 2) + '" height="' + (radius * 2) + '" ' +
          'role="img" aria-label="' + description + '">' +
          '<title>' + description + '</title>' +
          '<circle class="progress-ring-bg" ' +
            'cx="' + radius + '" cy="' + radius + '" r="' + normalizedRadius + '"/>' +
          '<circle class="progress-ring-fill" ' +
            'cx="' + radius + '" cy="' + radius + '" r="' + normalizedRadius + '" ' +
            'stroke="' + color + '" ' +
            'stroke-dasharray="' + circumference + ' ' + circumference + '" ' +
            'stroke-dashoffset="' + offset + '" ' +
            'style="filter: drop-shadow(0 0 6px ' + color + '40)"/>' +
        '</svg>' +
        '<div class="progress-ring-center">' +
          '<div class="progress-ring-value" style="color:' + color + '">' +
            value.toFixed(1) + '</div>' +
          '<div class="progress-ring-label">kg CO₂ today</div>' +
        '</div>' +
      '</div>';

    container.innerHTML = svg;
  }

  /* ═══════════════════════════════════════════
     BAR CHART (Canvas)
     ═══════════════════════════════════════════ */

  /**
   * Render a stacked bar chart for daily history.
   * @param {HTMLElement} container
   * @param {Array<{date:string, transport:number, diet:number, energy:number}>} data
   */
  function renderBarChart(container, data) {
    if (!data || data.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">📊</div>' +
          '<p class="empty-state-text">Start logging to see your trends here!</p>' +
        '</div>';
      return;
    }

    var c = getColors();
    var width = container.clientWidth || 400;
    var height = 200;
    var dpr = window.devicePixelRatio || 1;
    var padding = { top: 20, right: 10, bottom: 40, left: 45 };

    /* Compute max value */
    var maxVal = 0;
    data.forEach(function(d) {
      var total = d.transport + d.diet + d.energy;
      if (total > maxVal) { maxVal = total; }
    });
    maxVal = Math.max(maxVal, 1);
    /* Round up to nice number */
    maxVal = Math.ceil(maxVal / 2) * 2;

    /* Build accessible data table (hidden) */
    var tableHTML = '<table class="sr-only"><caption>Daily emissions history</caption>' +
      '<tr><th>Date</th><th>Transport</th><th>Diet</th><th>Energy</th><th>Total</th></tr>';
    data.forEach(function(d) {
      var total = (d.transport + d.diet + d.energy).toFixed(1);
      tableHTML += '<tr><td>' + d.date + '</td><td>' + d.transport.toFixed(1) +
        '</td><td>' + d.diet.toFixed(1) + '</td><td>' + d.energy.toFixed(1) +
        '</td><td>' + total + '</td></tr>';
    });
    tableHTML += '</table>';

    var description = EcoStep.A11y.describeChart('bar', {
      labels: data.map(function(d) { return d.date.slice(5); }),
      values: data.map(function(d) { return d.transport + d.diet + d.energy; })
    });

    container.innerHTML =
      '<canvas id="bar-chart-canvas" class="chart-canvas" ' +
        'role="img" aria-label="' + description + '" ' +
        'width="' + (width * dpr) + '" height="' + (height * dpr) + '" ' +
        'style="width:' + width + 'px;height:' + height + 'px"></canvas>' +
      '<div class="chart-legend">' +
        '<div class="chart-legend-item">' +
          '<span class="chart-legend-dot" style="background:' + c.transport + '"></span>' +
          'Transport</div>' +
        '<div class="chart-legend-item">' +
          '<span class="chart-legend-dot" style="background:' + c.diet + '"></span>' +
          'Diet</div>' +
        '<div class="chart-legend-item">' +
          '<span class="chart-legend-dot" style="background:' + c.energy + '"></span>' +
          'Energy</div>' +
      '</div>' +
      tableHTML;

    var canvas = container.querySelector('#bar-chart-canvas');
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var barWidth = Math.max(6, (chartWidth / data.length) * 0.6);
    var barGap = (chartWidth / data.length) - barWidth;

    /* Draw grid lines */
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = c.gridText;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';

    var gridLines = 4;
    for (var g = 0; g <= gridLines; g++) {
      var yVal = (maxVal / gridLines) * g;
      var yPos = padding.top + chartHeight - (chartHeight * g / gridLines);
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      ctx.fillText(yVal.toFixed(1), padding.left - 5, yPos + 4);
    }

    /* Draw bars with animation */
    var animProgress = 0;
    var animStart = performance.now();
    var animDuration = 600;

    function animateBars(timestamp) {
      animProgress = Math.min((timestamp - animStart) / animDuration, 1);
      /* Ease out cubic */
      var ease = 1 - Math.pow(1 - animProgress, 3);

      /* Clear bars area */
      ctx.clearRect(padding.left, padding.top - 1,
                    chartWidth + 1, chartHeight + 1);

      /* Redraw grid */
      ctx.strokeStyle = c.grid;
      ctx.fillStyle = c.gridText;
      for (var gg = 0; gg <= gridLines; gg++) {
        var yyVal = (maxVal / gridLines) * gg;
        var yyPos = padding.top + chartHeight - (chartHeight * gg / gridLines);
        ctx.beginPath();
        ctx.moveTo(padding.left, yyPos);
        ctx.lineTo(width - padding.right, yyPos);
        ctx.stroke();
      }

      /* Draw each bar */
      data.forEach(function(d, i) {
        var x = padding.left + i * (barWidth + barGap) + barGap / 2;
        var categories = [
          { val: d.transport, color: c.transport },
          { val: d.diet,      color: c.diet },
          { val: d.energy,    color: c.energy }
        ];

        var yOffset = 0;
        categories.forEach(function(cat) {
          var barH = (cat.val / maxVal) * chartHeight * ease;
          var y = padding.top + chartHeight - yOffset - barH;

          ctx.fillStyle = cat.color;
          roundRect(ctx, x, y, barWidth, barH, 3);
          ctx.fill();

          yOffset += barH;
        });

        /* Date label */
        ctx.fillStyle = c.gridText;
        ctx.textAlign = 'center';
        ctx.font = '10px Inter, sans-serif';
        var dateLabel = d.date.slice(5); /* MM-DD */
        ctx.fillText(dateLabel, x + barWidth / 2,
                     padding.top + chartHeight + 16);
      });

      if (animProgress < 1) {
        requestAnimationFrame(animateBars);
      }
    }

    requestAnimationFrame(animateBars);
  }

  /* ═══════════════════════════════════════════
     DONUT CHART (SVG)
     ═══════════════════════════════════════════ */

  /**
   * Render a category breakdown donut chart.
   * @param {HTMLElement} container
   * @param {{transport: number, diet: number, energy: number}} data
   */
  function renderDonutChart(container, data) {
    var c = getColors();
    var total = data.transport + data.diet + data.energy;

    if (total === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">🍩</div>' +
          '<p class="empty-state-text">No data yet for today\'s breakdown.</p>' +
        '</div>';
      return;
    }

    var segments = [
      { label: 'Transport', value: data.transport, color: c.transport },
      { label: 'Diet',      value: data.diet,      color: c.diet },
      { label: 'Energy',    value: data.energy,     color: c.energy }
    ].filter(function(s) { return s.value > 0; });

    segments.forEach(function(s) {
      s.percent = (s.value / total) * 100;
    });

    var description = EcoStep.A11y.describeChart('donut', { segments: segments });

    var size = 160;
    var center = size / 2;
    var radius = 55;
    var strokeWidth = 20;

    var paths = '';
    var cumulativePercent = 0;

    segments.forEach(function(seg) {
      var startAngle = cumulativePercent * 3.6 * (Math.PI / 180);
      cumulativePercent += seg.percent;
      var endAngle = cumulativePercent * 3.6 * (Math.PI / 180);

      var x1 = center + radius * Math.cos(startAngle - Math.PI / 2);
      var y1 = center + radius * Math.sin(startAngle - Math.PI / 2);
      var x2 = center + radius * Math.cos(endAngle - Math.PI / 2);
      var y2 = center + radius * Math.sin(endAngle - Math.PI / 2);
      var largeArc = seg.percent > 50 ? 1 : 0;

      paths +=
        '<path d="M ' + x1 + ' ' + y1 + ' A ' + radius + ' ' + radius +
        ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + '" ' +
        'fill="none" stroke="' + seg.color + '" stroke-width="' + strokeWidth + '" ' +
        'stroke-linecap="round" ' +
        'style="filter: drop-shadow(0 0 4px ' + seg.color + '40)">' +
        '<title>' + seg.label + ': ' + seg.value.toFixed(1) + ' kg (' +
        seg.percent.toFixed(0) + '%)</title></path>';
    });

    var html =
      '<div style="display:flex;align-items:center;justify-content:center;gap:1.5rem;flex-wrap:wrap">' +
        '<svg width="' + size + '" height="' + size + '" role="img" ' +
          'aria-label="' + description + '">' +
          '<desc>' + description + '</desc>' +
          paths +
          '<text x="' + center + '" y="' + (center - 6) + '" text-anchor="middle" ' +
            'fill="var(--text-primary)" font-size="18" font-weight="800" ' +
            'font-family="Inter, sans-serif">' + total.toFixed(1) + '</text>' +
          '<text x="' + center + '" y="' + (center + 14) + '" text-anchor="middle" ' +
            'fill="var(--text-muted)" font-size="11" ' +
            'font-family="Inter, sans-serif">kg CO₂</text>' +
        '</svg>' +
        '<div class="chart-legend" style="flex-direction:column;align-items:flex-start">';

    segments.forEach(function(seg) {
      html +=
        '<div class="chart-legend-item">' +
          '<span class="chart-legend-dot" style="background:' + seg.color + '"></span>' +
          seg.label + ': ' + seg.value.toFixed(1) + ' kg (' + seg.percent.toFixed(0) + '%)' +
        '</div>';
    });

    html += '</div></div>';
    container.innerHTML = html;
  }

  /* ═══════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════ */

  /**
   * Draw a rounded rectangle on canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r - Corner radius
   * @private
   */
  function roundRect(ctx, x, y, w, h, r) {
    if (h < 1) { return; }
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ═══════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════ */

  window.EcoStep.Charts = {
    renderProgressRing: renderProgressRing,
    renderBarChart: renderBarChart,
    renderDonutChart: renderDonutChart
  };

})();
