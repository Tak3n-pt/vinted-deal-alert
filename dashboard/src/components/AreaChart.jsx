import React from "react";
import Chart from "react-apexcharts";

/**
 * Bigger area chart used on the Dashboard hero panel. Mirrors MaterialPro's
 * Newsletter_Campaign chart config from assets/js/dashboards/dashboard3.js
 * (two smooth series, primary + secondary, transparent fill, no toolbar).
 */
export default function AreaChart({ categories, series, height = 280 }) {
  const options = {
    chart: { fontFamily: "inherit", type: "area", height, offsetX: -15, toolbar: { show: false } },
    legend: { show: false },
    dataLabels: { enabled: false },
    fill: { type: "solid", opacity: 0.07, colors: ["#1B84FF", "#43CED7"] },
    stroke: { curve: "smooth", show: true, width: 2, colors: ["var(--bs-primary)", "var(--bs-secondary)"] },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: 6,
      labels: { rotate: 0, style: { fontSize: "12px", colors: "#a1aab2" } },
      crosshairs: {
        position: "front",
        stroke: { color: ["var(--bs-primary)", "var(--bs-secondary)"], width: 1, dashArray: 3 }
      }
    },
    yaxis: { tickAmount: 6, labels: { style: { fontSize: "12px", colors: "#a1aab2" } } },
    tooltip: { theme: "dark" },
    colors: ["var(--bs-primary)", "var(--bs-secondary)"],
    grid: { borderColor: "var(--bs-border-color)", strokeDashArray: 4, yaxis: { lines: { show: true } } },
    markers: { strokeColor: ["var(--bs-primary)", "var(--bs-secondary)"], strokeWidth: 3 }
  };
  return <Chart options={options} series={series} type="area" height={height} />;
}
