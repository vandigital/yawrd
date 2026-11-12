// Original component: VanClaw. Portability corrections: Codex; see CONTRIBUTION-EVIDENCE.md.
import type { CSSProperties } from "react";
import {
  type ProjectProgressData,
  assertProjectProgressData,
  SYNTHETIC_NOTICE,
} from "../contracts/build-progress/contract.ts";

export type { ProjectProgressData };

export type ProjectProgressProps = {
  data: ProjectProgressData;
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
};

/** Synthetic notice displayed at the top of the component. */
const NOTICE_TEXT = SYNTHETIC_NOTICE;

/**
 * ProjectProgress — public-facing, read-only React/TypeScript component
 * consuming ProjectProgressData from contracts/build-progress/contract.ts.
 *
 * Displays milestones, public tasks, and recent accepted activity.
 * Renders the synthetic notice before content for synthetic data.
 * Escapes all untrusted text as plain text (never HTML injection).
 * Uses only supplied validated HTTPS links (rel="noopener noreferrer").
 *
 * Validation: malformed input throws synchronously; nothing is rendered.
 *
 * @param data — ProjectProgressData, pre-validated by the caller or
 *               asserted inside the component before any rendering.
 */
export function ProjectProgress({ data }: ProjectProgressProps) {
  assertProjectProgressData(data);

  const isSynthetic = data.dataKind === "synthetic";
  const showNotice = isSynthetic && data.notice === NOTICE_TEXT;

  const style = {
    container: { maxWidth: 480, fontFamily: "sans-serif", margin: "0 auto" } as CSSProperties,
    notice: {
      background: "#fff3cd",
      color: "#856404",
      border: "1px solid #ffeeba",
      borderRadius: 4,
      padding: "8px 12px",
      marginBottom: 16,
      fontSize: 13,
    } as CSSProperties,
    section: { marginBottom: 20 } as CSSProperties,
    heading: { fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 8 } as CSSProperties,
    empty: { color: "#6c757d", fontStyle: "italic", fontSize: 14, margin: "8px 0" } as CSSProperties,
    list: { listStyle: "none", padding: 0, margin: 0 } as CSSProperties,
    listItem: {
      padding: "6px 0",
      borderBottom: "1px solid #e9ecef",
      fontSize: 14,
    } as CSSProperties,
    label: {
      display: "inline-block",
      minWidth: 88,
      fontWeight: 600,
      fontSize: 13,
    } as CSSProperties,
    activity: { marginBottom: 12 } as CSSProperties,
    activitySummary: { display: "block", marginBottom: 2 } as CSSProperties,
    activityMeta: { fontSize: 12, color: "#6c757d" } as CSSProperties,
    link: { fontSize: 12, color: "#0366d6" } as CSSProperties,
  };

  const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

  const milestones = data.milestones;
  const tasks = data.tasks;
  const activity = data.recentActivity;

  return (
    <div style={style.container} role="region" aria-label="Project Progress">
      {showNotice && (
        <div style={style.notice}>
          <strong>Notice:</strong>{" "}
          <span>{NOTICE_TEXT}</span>
        </div>
      )}

      {/* Milestones */}
      <section style={style.section}>
        <h2 style={style.heading}>Milestones</h2>
        {milestones.length === 0 ? (
          <p style={style.empty}>No published milestones yet</p>
        ) : (
          <ul style={style.list} aria-label="Milestones">
            {milestones.map((m) => (
              <li key={m.id} style={style.listItem}>
                <span style={style.label}>{statusLabel(m.status)}</span>{" "}
                {m.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tasks */}
      <section style={style.section}>
        <h2 style={style.heading}>Tasks</h2>
        {tasks.length === 0 ? (
          <p style={style.empty}>No public tasks yet</p>
        ) : (
          <ul style={style.list} aria-label="Public tasks">
            {tasks.map((t) => (
              <li key={t.id} style={style.listItem}>
                <span style={style.label}>{statusLabel(t.status)}</span>{" "}
                {t.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent Activity */}
      <section style={style.section}>
        <h2 style={style.heading}>Recent Activity</h2>
        {activity.length === 0 ? (
          <p style={style.empty}>No accepted activity published yet</p>
        ) : (
          <ul style={style.list} aria-label="Recent accepted activity">
            {activity.map((a) => (
              <li key={a.id} style={style.activity}>
                <span style={style.activitySummary}>{a.summary}</span>
                <span style={style.activityMeta}>
                  Accepted on {a.acceptedOn}
                </span>
                {a.link && (
                  <br />
                )}
                {a.link && (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={style.link}
                  >
                    {a.link}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default ProjectProgress;
