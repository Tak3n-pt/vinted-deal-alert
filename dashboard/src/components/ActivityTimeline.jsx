import React from "react";
import { timeShort, tLogLevel, translateLog } from "../format.js";
import Empty from "./Empty.jsx";

const TONE_BY_LEVEL = { info: "primary", warn: "warning", error: "danger" };

export default function ActivityTimeline({ logs }) {
  if (!logs?.length) return <Empty text="Aucune activité récente" />;
  return (
    <ul className="timeline-widget mb-0 position-relative mb-n5">
      {logs.map((log) => {
        const tone = TONE_BY_LEVEL[log.level] ?? "secondary";
        return (
          <li className="timeline-item d-flex position-relative overflow-hidden" key={log.id}>
            <div className="timeline-time text-dark flex-shrink-0 text-end fs-3">{timeShort(log.createdAt)}</div>
            <div className="timeline-badge-wrap d-flex flex-column align-items-center">
              <span className={`timeline-badge border-2 border border-${tone} rounded-circle flex-shrink-0 my-8`}></span>
              <span className="timeline-badge-border d-block flex-shrink-0"></span>
            </div>
            <div className="timeline-desc fs-3 text-dark mt-n1">
              <span className={`badge bg-${tone}-subtle text-${tone} rounded-4 px-2 py-1 lh-sm fs-2 me-2`}>
                {tLogLevel(log.level)}
              </span>
              {translateLog(log.message)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
