import React from "react";
import Chart from "react-apexcharts";

/**
 * Stacked-area timeline for the Statistiques hero. Two series (sent + rejected)
 * over N days. Smooth curves, dark tooltip, MP-style transparent fill.
 */
export default function TimelineChart({ days, sent, rejected, height = 320 }) {
  const options = {
    chart: { type: "area", height, fontFamily: "inherit", toolbar: { show: false }, foreColor: "#adb0bb", stacked: false },
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: 2, colors: ["var(--bs-primary)", "var(--bs-secondary)"] },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 100],
        colorStops: [
          [
            { offset: 0, color: "#1e88e5", opacity: 0.5 },
            { offset: 100, color: "#1e88e5", opacity: 0 }
          ],
          [
            { offset: 0, color: "#26c6da", opacity: 0.35 },
            { offset: 100, color: "#26c6da", opacity: 0 }
          ]
        ]
      }
    },
    colors: ["#1e88e5", "#26c6da"],
    xaxis: {
      categories: days,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { rotate: 0, style: { fontSize: "11px", colors: "#a1aab2" }, formatter: (val) => formatDayShort(val) }
    },
    yaxis: { tickAmount: 5, labels: { style: { fontSize: "11px", colors: "#a1aab2" } } },
    grid: { borderColor: "var(--bs-border-color)", strokeDashArray: 4 },
    tooltip: { theme: "dark", x: { formatter: (val, ctx) => days[ctx?.dataPointIndex] ?? "" } },
    markers: { size: 0, hover: { size: 5 } }
  };
  const series = [
    { name: "Alertes envoyées", data: sent },
    { name: "Opportunités rejetées", data: rejected }
  ];
  return <Chart options={options} series={series} type="area" height={height} />;
}

function formatDayShort(day) {
  if (!day) return "";
  const parts = String(day).split("-");
  if (parts.length !== 3) return day;
  return `${parts[2]}/${parts[1]}`;
}
