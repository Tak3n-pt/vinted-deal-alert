import React from "react";
import Chart from "react-apexcharts";

/** Compact white-line chart on a colored card — clones MaterialPro's Bandwidth_usage. */
export default function MiniLineChart({ data = [0, 8, 12, 10, 6, 8, 15, 23] }) {
  const options = {
    chart: { height: 50, type: "line", foreColor: "#adb0bb", toolbar: { show: false }, sparkline: { enabled: true } },
    colors: ["#fff"],
    fill: { type: "solid", opacity: 1, colors: ["#fff"] },
    grid: { show: false },
    stroke: { curve: "smooth", lineCap: "square", colors: ["#fff"], width: 2 },
    markers: { size: 0, colors: ["#fff"], strokeColors: "transparent", shape: "square", hover: { size: 7 } },
    xaxis: { axisBorder: { show: false }, axisTicks: { show: false }, labels: { show: false } },
    yaxis: { labels: { show: false } },
    tooltip: { theme: "dark", x: { show: false } }
  };
  const series = [{ name: "", data }];
  return <Chart options={options} series={series} type="line" height={50} />;
}
