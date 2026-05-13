import React from "react";
import Chart from "react-apexcharts";

/** "Our Visitors" donut — clone of MP dashboard3.js Our_Visitors config. */
export default function OurVisitorsDonut({ series = [50, 40, 30, 10], labels = ["Mobile", "Tablet", "Other", "Desktop"] }) {
  const options = {
    series,
    labels,
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
            total: { show: true, color: "#a1aab2", fontSize: "13px", label: "Our Visitor" }
          }
        }
      }
    },
    colors: ["var(--bs-primary)", "var(--bs-secondary)", "#eceff180", "var(--bs-purple)"],
    tooltip: { fillSeriesColor: false },
    legend: { show: false }
  };
  return <Chart options={options} series={series} type="donut" height={220} />;
}
