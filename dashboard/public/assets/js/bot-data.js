(function () {
  "use strict";

  var REFRESH_MS = 12000;
  var lastPayload = null;
  var charts = {
    newsletter: null,
    visitors: null
  };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function text(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback || "--";
    return String(value);
  }

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function euro(value) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0
    }).format(number(value));
  }

  function shortCount(value) {
    var total = number(value);
    return total >= 1000 ? (total / 1000).toFixed(1) + "k" : String(total);
  }

  function timeOnly(value) {
    if (!value) return "--:--";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--:--";
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function timeAgo(value) {
    if (!value) return "--";
    var time = new Date(value).getTime();
    if (Number.isNaN(time)) return "--";
    var minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
    if (minutes < 1) return "a l'instant";
    if (minutes < 60) return "il y a " + minutes + " min";
    var hours = Math.round(minutes / 60);
    if (hours < 24) return "il y a " + hours + " h";
    return "il y a " + Math.round(hours / 24) + " j";
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function cardByText(label) {
    var target = normalize(label);
    return Array.from(document.querySelectorAll(".card")).find(function (card) {
      return normalize(card.textContent).includes(target);
    });
  }

  function rowsIn(card, selector) {
    return card ? Array.from(card.querySelectorAll(selector)) : [];
  }

  function collectRefs() {
    var dealsCard = cardByText("Deals Trouves");
    var itemsCard = cardByText("Articles Scannes");
    var upgradeBody = document.querySelector(".upgrade-plan .card-body");
    var bestCard = document.querySelector(".material-pro-bg");
    var metricsCard = cardByText("Metriques Rapides");
    var pendingCard = cardByText("Deals en Attente");
    var newsletterCard = cardByText("Activite de Scraping");
    var contactsCard = cardByText("Top Vendeurs");
    var projectsCard = cardByText("Derniers Deals Trouves");
    var visitorsChart = document.querySelector("#our-visitors");
    var visitorsCard = visitorsChart ? visitorsChart.closest(".card") : null;
    var bandwidthCard = cardByText("Couverture Recherches");
    var alertsCard = cardByText("Deals Aujourd'hui");

    return {
      dealsCount: dealsCard ? dealsCard.querySelector("h4.card-title") : null,
      itemsCount: itemsCard ? itemsCard.querySelector("h2") : null,
      upgradeStatus: upgradeBody ? upgradeBody.querySelector("p.text-white") : null,
      upgradeTitle: upgradeBody ? upgradeBody.querySelector("h3") : null,
      upgradeDetails: upgradeBody
        ? Array.from(upgradeBody.querySelectorAll(".hstack.gap-2")).slice(0, 2).map(function (row) {
            return {
              label: row.querySelector("p"),
              value: row.querySelector("h6")
            };
          })
        : [],
      bestTitle: bestCard ? bestCard.querySelector("h4.card-title") : null,
      bestSubtitle: bestCard ? bestCard.querySelector("p.card-subtitle") : null,
      bestPrice: bestCard ? bestCard.querySelector(".fw-bold.text-primary") : null,
      bestScore: bestCard ? bestCard.querySelector(".badge") : null,
      bestLink: bestCard ? bestCard.querySelector("a") : null,
      metricRows: rowsIn(metricsCard, ".card-body > .hstack"),
      pendingTitle: pendingCard ? pendingCard.querySelector("h3.card-title") : null,
      pendingSubtitle: pendingCard ? pendingCard.querySelector("p.card-subtitle") : null,
      newsletterChart: document.querySelector("#newsletter-campaign"),
      newsletterTotals: rowsIn(newsletterCard, ".row.text-center h2"),
      contacts: rowsIn(contactsCard, ".message-widget.contact-widget > a"),
      projectRows: rowsIn(projectsCard, "tbody tr"),
      visitorsChart: visitorsChart,
      visitorsLegend: rowsIn(visitorsCard, ".list-inline-item div"),
      bandwidthCount: bandwidthCard ? bandwidthCard.querySelector("h2") : null,
      alertsTitle: alertsCard ? alertsCard.querySelector("h3.card-title") : null,
      alertsCount: alertsCard ? alertsCard.querySelector("h2") : null
    };
  }

  var refs = null;

  async function fetchJson(url) {
    var response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      var error = new Error("HTTP " + response.status + " for " + url);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function loadDashboardData() {
    try {
      return await fetchJson("/api/public/dashboard?limit=100");
    } catch (publicError) {
      var status = await fetchJson("/api/status");
      var deals = await fetchJson("/api/deals?limit=100");
      var scans = await fetchJson("/api/scans?limit=100");
      var logs = await fetchJson("/api/logs?limit=100");
      var searches = await fetchJson("/api/searches");
      return {
        status: status.status || {},
        deals: deals.deals || [],
        scans: scans.scans || [],
        logs: logs.logs || [],
        searches: (searches.searches || []).filter(function (search) { return search.enabled; })
      };
    }
  }

  function scoreLevel(score) {
    if (score >= 80) return "Score haut";
    if (score >= 60) return "Score moyen";
    return "Score bas";
  }

  function dealTitle(deal) {
    return text(deal && deal.title, "Aucun deal aujourd'hui");
  }

  function dealMeta(deal) {
    if (!deal) return "En attente du prochain scan";
    var bits = [];
    if (deal.model) bits.push(deal.model);
    if (deal.storageGb) bits.push(deal.storageGb + "GB");
    if (deal.sellerName) bits.push(deal.sellerName);
    return bits.length ? bits.join(" • ") : timeAgo(deal.createdAt);
  }

  function activeSearchCount(payload) {
    if (payload && Number.isFinite(Number(payload.activeSearchCount))) return Number(payload.activeSearchCount);
    var searches = Array.isArray(payload && payload.searches) ? payload.searches : [];
    return searches.filter(function (search) { return search.enabled !== false; }).length;
  }

  function computeStats(payload) {
    var status = payload.status || {};
    var deals = Array.isArray(payload.deals) ? payload.deals : [];
    var scans = Array.isArray(payload.scans) ? payload.scans : [];
    var searchesCount = activeSearchCount(payload);
    var dealsCount = deals.length;
    var itemsTotal = scans.reduce(function (sum, scan) { return sum + number(scan.listings); }, 0);
    var alertsCount = deals.filter(function (deal) { return Boolean(deal.sent); }).length;
    var pendingCount = deals.filter(function (deal) { return Boolean(deal.shouldAlert) && !deal.sent; }).length;
    var avgScore = deals.length
      ? Math.round(deals.reduce(function (sum, deal) { return sum + number(deal.score); }, 0) / deals.length)
      : 0;
    var alertRate = deals.length ? Math.round((alertsCount / deals.length) * 100) : 0;
    var high = deals.filter(function (deal) { return number(deal.score) >= 80; }).length;
    var mid = deals.filter(function (deal) {
      var score = number(deal.score);
      return score >= 60 && score < 80;
    }).length;
    var low = deals.filter(function (deal) { return number(deal.score) < 60; }).length;

    return {
      status: status,
      deals: deals,
      scans: scans,
      searchesCount: searchesCount,
      dealsCount: dealsCount,
      itemsTotal: itemsTotal,
      itemsFmt: shortCount(itemsTotal),
      alertsCount: alertsCount,
      pendingCount: pendingCount,
      avgScore: avgScore,
      alertRate: alertRate,
      botLabel: status.paused ? "En pause" : status.running ? "Actif" : "Inactif",
      nextScanFmt: timeOnly(status.nextScanAt),
      high: high,
      mid: mid,
      low: low
    };
  }

  function hourlyBuckets(items, dateKey, valueKey) {
    var now = Date.now();
    var buckets = Array(24).fill(0);
    items.forEach(function (item) {
      var time = new Date(item[dateKey]).getTime();
      if (Number.isNaN(time)) return;
      var age = (now - time) / 3600000;
      if (age >= 0 && age < 24) {
        buckets[23 - Math.floor(age)] += valueKey ? number(item[valueKey]) : 1;
      }
    });
    return buckets;
  }

  function hourlyLabels() {
    var now = Date.now();
    return Array.from({ length: 24 }, function (_, index) {
      return new Date(now - (23 - index) * 3600000).toLocaleTimeString("fr-FR", { hour: "2-digit" });
    });
  }

  function renderNewsletter(stats) {
    if (!refs.newsletterChart || !window.ApexCharts) return;
    var scanCounts = hourlyBuckets(stats.scans, "startedAt", "listings");
    var dealCounts = hourlyBuckets(stats.deals, "createdAt");
    var options = {
      series: [
        { name: "Items scannes", data: scanCounts },
        { name: "Deals trouves", data: dealCounts }
      ],
      chart: { type: "area", height: 285, fontFamily: "inherit", toolbar: { show: false } },
      dataLabels: { enabled: false },
      fill: { type: "solid", opacity: 0.07, colors: ["#1B84FF", "#43CED7"] },
      stroke: { curve: "smooth", width: 2, colors: ["var(--bs-primary)", "var(--bs-secondary)"] },
      xaxis: {
        categories: hourlyLabels(),
        tickAmount: 6,
        labels: { rotate: 0, style: { fontSize: "12px", colors: "#a1aab2" } },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: { min: 0, labels: { style: { fontSize: "12px", colors: "#a1aab2" } } },
      tooltip: { theme: "dark" },
      colors: ["var(--bs-primary)", "var(--bs-secondary)"],
      grid: { borderColor: "var(--bs-border-color)", strokeDashArray: 4 }
    };

    if (charts.newsletter) {
      charts.newsletter.updateOptions(options, false, true);
      return;
    }
    refs.newsletterChart.innerHTML = "";
    charts.newsletter = new ApexCharts(refs.newsletterChart, options);
    charts.newsletter.render();
  }

  function renderVisitors(stats) {
    if (!refs.visitorsChart || !window.ApexCharts) return;
    var options = {
      series: [stats.high, stats.mid, stats.low],
      labels: ["Score 80+", "Score 60-79", "Score <60"],
      chart: { type: "donut", height: 220, fontFamily: "inherit" },
      dataLabels: { enabled: false },
      stroke: { width: 0 },
      plotOptions: {
        pie: {
          expandOnClick: true,
          donut: {
            size: "83",
            labels: {
              show: true,
              name: { show: true, offsetY: 7 },
              value: { show: false },
              total: { show: true, color: "#a1aab2", fontSize: "13px", label: "Scores" }
            }
          }
        }
      },
      colors: ["var(--bs-primary)", "var(--bs-purple)", "var(--bs-secondary)"],
      tooltip: { show: true, fillSeriesColor: false },
      legend: { show: false }
    };

    if (charts.visitors) {
      charts.visitors.updateOptions(options, false, true);
      return;
    }
    refs.visitorsChart.innerHTML = "";
    charts.visitors = new ApexCharts(refs.visitorsChart, options);
    charts.visitors.render();
  }

  function updateMetricRow(row, label, value) {
    if (!row) return;
    var labels = row.querySelectorAll("h6");
    setText(labels[0], label);
    setText(labels[labels.length - 1], value);
  }

  function updateContacts(deals) {
    refs.contacts.forEach(function (row, index) {
      var deal = deals[index];
      if (!deal) return;
      row.href = deal.url || "javascript:void(0)";
      if (deal.url) row.target = "_blank";
      setText(row.querySelector("h5"), dealTitle(deal));
      setText(row.querySelector("span.text-muted"), euro(deal.finalPrice) + " • " + timeAgo(deal.createdAt));
    });
  }

  function updateProjects(deals) {
    refs.projectRows.forEach(function (row, index) {
      var deal = deals[index];
      if (!deal) return;
      var title = row.querySelector("td:first-child h5");
      var model = row.querySelector("td:first-child p");
      var seller = row.querySelector("td:nth-child(2) p");
      var age = row.querySelector("td:nth-child(2) span");
      var badge = row.querySelector("td:nth-child(3) .badge");
      var price = row.querySelector("td:nth-child(4) p");
      setText(title, dealTitle(deal));
      setText(model, text(deal.model, "Modele inconnu"));
      setText(seller, text(deal.sellerName, text(deal.riskLevel, "Deal")));
      setText(age, timeAgo(deal.createdAt));
      setText(badge, text(deal.riskLevel, scoreLevel(number(deal.score))) + " • " + number(deal.score) + " / 100");
      setText(price, euro(deal.finalPrice));
    });
  }

  function updateDom(payload) {
    if (!refs) refs = collectRefs();
    var stats = computeStats(payload);
    var bestDeal = stats.status.bestCandidate || stats.deals[0];

    setText(refs.dealsCount, stats.dealsCount + " deals");
    setText(refs.itemsCount, stats.itemsFmt);

    setText(refs.upgradeStatus, "Bot " + stats.botLabel.toLowerCase() + " en ce moment.");
    setText(refs.upgradeTitle, "Bonoitec Flash");
    if (refs.upgradeDetails[0]) {
      setText(refs.upgradeDetails[0].label, "Recherches");
      setText(refs.upgradeDetails[0].value, stats.searchesCount + " actives");
    }
    if (refs.upgradeDetails[1]) {
      setText(refs.upgradeDetails[1].label, "Prochain scan");
      setText(refs.upgradeDetails[1].value, stats.nextScanFmt);
    }

    setText(refs.bestTitle, dealTitle(bestDeal));
    setText(refs.bestSubtitle, dealMeta(bestDeal));
    setText(refs.bestPrice, bestDeal ? euro(bestDeal.finalPrice) : "--");
    setText(refs.bestScore, bestDeal ? "Score " + number(bestDeal.score) + "/100" : "Aucun deal");
    if (refs.bestLink) {
      refs.bestLink.textContent = bestDeal && bestDeal.url ? "Voir sur Vinted ->" : "En attente du prochain scan";
      refs.bestLink.href = bestDeal && bestDeal.url ? bestDeal.url : "javascript:void(0)";
      if (bestDeal && bestDeal.url) refs.bestLink.target = "_blank";
    }

    updateMetricRow(refs.metricRows[0], "Score moyen", stats.avgScore + "/100");
    updateMetricRow(refs.metricRows[1], "Taux alerte", stats.alertRate + "%");
    updateMetricRow(refs.metricRows[2], "Recherches actives", String(stats.searchesCount));

    setText(refs.pendingTitle, "Deals en Attente");
    setText(refs.pendingSubtitle, stats.pendingCount + " a examiner");

    if (refs.newsletterTotals[0]) setText(refs.newsletterTotals[0], stats.itemsTotal.toLocaleString("fr-FR"));
    if (refs.newsletterTotals[1]) setText(refs.newsletterTotals[1], String(stats.dealsCount));
    if (refs.newsletterTotals[2]) setText(refs.newsletterTotals[2], stats.alertRate + "%");

    updateContacts(stats.deals.slice(0, 4));
    updateProjects(stats.deals.slice(0, 4));

    if (refs.visitorsLegend[0]) setText(refs.visitorsLegend[0], "Score 80+");
    if (refs.visitorsLegend[1]) setText(refs.visitorsLegend[1], "Score 60-79");
    if (refs.visitorsLegend[2]) setText(refs.visitorsLegend[2], "Score <60");

    setText(refs.bandwidthCount, stats.searchesCount + " actives");
    setText(refs.alertsTitle, "Alertes envoyees");
    setText(refs.alertsCount, String(stats.alertsCount));

    renderNewsletter(stats);
    renderVisitors(stats);
  }

  function showUnavailable(error) {
    if (!refs) refs = collectRefs();
    if (lastPayload) {
      updateDom(lastPayload);
      return;
    }
    setText(refs.dealsCount, "--");
    setText(refs.itemsCount, "--");
    setText(refs.upgradeStatus, error && error.status === 401 ? "Connexion requise pour les donnees live." : "Donnees live indisponibles.");
    setText(refs.bestTitle, "Aucun deal aujourd'hui");
    setText(refs.bestSubtitle, "En attente du prochain scan");
  }

  async function refresh() {
    try {
      var payload = await loadDashboardData();
      lastPayload = payload;
      updateDom(payload);
    } catch (error) {
      showUnavailable(error);
      if (window.console && console.warn) console.warn("[bot-data]", error);
    }
  }

  function start() {
    refs = collectRefs();
    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
