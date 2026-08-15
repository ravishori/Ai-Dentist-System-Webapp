"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, apiFetch } from "../../../lib/api";
import {
  AuthGate,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../../../components/ui-states";

type Practitioner = {
  id: string;
  organizationId: string;
  userId: string;
  displayName: string | null;
  status: string;
};

type Assignment = {
  id: string;
  branchId: string;
  createdAt: string;
};

type Schedule = {
  id: string;
  branchId: string;
  timezone: string;
  intervals: Array<{ weekday: number; startMinute: number; endMinute: number }>;
};

type Unavailability = {
  id: string;
  kind: string;
  status: string;
  startAtUtc: string;
  endAtUtc: string;
  timezone: string;
};

type AvailabilityResult = {
  practitionerId: string;
  branchId: string;
  timezone: string | null;
  durationMinutes: number;
  windowStartAtUtc: string;
  windowEndAtUtc: string;
  available: Array<{ startAtUtc: string; endAtUtc: string }>;
  unavailable: Array<{ startAtUtc: string; endAtUtc: string; reason: string }>;
  conflicts: Array<{
    appointmentId: string;
    branchId: string;
    startAtUtc: string;
    endAtUtc: string;
    reason: string;
  }>;
  advisory: boolean;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export default function PractitionerDetailPage() {
  const params = useParams<{ practitionerId: string }>();
  return (
    <section className="section">
      <div className="container stack-lg">
        <PageHeader
          eyebrow="Practitioner detail"
          title="Profile & availability"
          lead="Update profile, assign branches, write schedules/leave, and query advisory availability windows."
        />
        <AuthGate>
          <PractitionerDetail practitionerId={params.practitionerId} />
        </AuthGate>
      </div>
    </section>
  );
}

function PractitionerDetail({ practitionerId }: { practitionerId: string }) {
  const [practitioner, setPractitioner] = useState<Practitioner | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [lastSchedule, setLastSchedule] = useState<Schedule | null>(null);
  const [lastLeave, setLastLeave] = useState<Unavailability | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);

  const [scheduleForm, setScheduleForm] = useState({
    branchId: "",
    timezone: "Asia/Singapore",
    weekday: "1",
    startLocal: "09:00",
    endLocal: "17:00",
  });
  const [leaveForm, setLeaveForm] = useState({
    kind: "leave",
    timezone: "Asia/Singapore",
    startAtLocal: "",
    endAtLocal: "",
  });
  const [availabilityForm, setAvailabilityForm] = useState({
    branchId: "",
    startAtLocal: "",
    endAtLocal: "",
    durationMinutes: "30",
  });
  const [cancelIntervalId, setCancelIntervalId] = useState("");
  const [replaceScheduleId, setReplaceScheduleId] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const body = await apiFetch<{ practitioner: Practitioner; assignments: Assignment[] }>(
        `/api/practitioners/${practitionerId}`,
      );
      setPractitioner(body.practitioner);
      setAssignments(body.assignments);
      setDisplayName(body.practitioner.displayName ?? "");
    } catch (err) {
      setPractitioner(null);
      setError(describeError(err));
    }
  }, [practitionerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function withBusy(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  async function onUpdate(event: FormEvent) {
    event.preventDefault();
    await withBusy("update", async () => {
      const body = await apiFetch<{ practitioner: Practitioner; assignments: Assignment[] }>(
        `/api/practitioners/${practitionerId}/update`,
        {
          method: "POST",
          body: JSON.stringify({ displayName: displayName.trim() }),
        },
      );
      setPractitioner(body.practitioner);
      setAssignments(body.assignments);
      setMessage("Display name updated.");
    });
  }

  async function onActivate() {
    await withBusy("activate", async () => {
      const body = await apiFetch<{ practitioner: Practitioner; assignments: Assignment[] }>(
        `/api/practitioners/${practitionerId}/activate`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setPractitioner(body.practitioner);
      setAssignments(body.assignments);
      setMessage("Practitioner activated.");
    });
  }

  async function onDeactivate() {
    await withBusy("deactivate", async () => {
      const body = await apiFetch<{
        practitioner: Practitioner;
        assignments: Assignment[];
        conflicts?: unknown[];
      }>(`/api/practitioners/${practitionerId}/deactivate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPractitioner(body.practitioner);
      setAssignments(body.assignments);
      const conflictCount = Array.isArray(body.conflicts) ? body.conflicts.length : 0;
      setMessage(
        conflictCount > 0
          ? `Deactivated with ${conflictCount} operational conflict(s).`
          : "Practitioner deactivated.",
      );
    });
  }

  async function onAssign(event: FormEvent) {
    event.preventDefault();
    await withBusy("assign", async () => {
      const body = await apiFetch<{ practitioner: Practitioner; assignments: Assignment[] }>(
        `/api/practitioners/${practitionerId}/branches`,
        {
          method: "POST",
          body: JSON.stringify({ branchId: branchId.trim() }),
        },
      );
      setPractitioner(body.practitioner);
      setAssignments(body.assignments);
      setBranchId("");
      setMessage(`Assigned branch ${body.assignments.at(-1)?.branchId ?? ""}.`);
    });
  }

  async function onUnassign(targetBranchId: string) {
    await withBusy(`unassign-${targetBranchId}`, async () => {
      const body = await apiFetch<{ practitioner: Practitioner; assignments: Assignment[] }>(
        `/api/practitioners/${practitionerId}/branches/${targetBranchId}/unassign`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setPractitioner(body.practitioner);
      setAssignments(body.assignments);
      setMessage(`Unassigned branch ${targetBranchId}.`);
    });
  }

  async function onCreateSchedule(event: FormEvent) {
    event.preventDefault();
    await withBusy("schedule", async () => {
      const body = await apiFetch<{ schedule: Schedule }>(
        `/api/practitioners/${practitionerId}/schedules`,
        {
          method: "POST",
          body: JSON.stringify({
            branchId: scheduleForm.branchId.trim(),
            timezone: scheduleForm.timezone.trim(),
            intervals: [
              {
                weekday: Number(scheduleForm.weekday),
                startLocal: scheduleForm.startLocal,
                endLocal: scheduleForm.endLocal,
              },
            ],
          }),
        },
      );
      setLastSchedule(body.schedule);
      setReplaceScheduleId(body.schedule.id);
      setMessage(`Created schedule ${body.schedule.id}. There is no schedule list GET — keep this id.`);
    });
  }

  async function submitReplaceSchedule() {
    await withBusy("replace", async () => {
      const body = await apiFetch<{ schedule: Schedule }>(
        `/api/practitioners/${practitionerId}/schedules/${replaceScheduleId.trim()}/replace`,
        {
          method: "POST",
          body: JSON.stringify({
            timezone: scheduleForm.timezone.trim(),
            intervals: [
              {
                weekday: Number(scheduleForm.weekday),
                startLocal: scheduleForm.startLocal,
                endLocal: scheduleForm.endLocal,
              },
            ],
          }),
        },
      );
      setLastSchedule(body.schedule);
      setMessage(`Replaced schedule ${body.schedule.id}.`);
    });
  }

  async function onCreateLeave(event: FormEvent) {
    event.preventDefault();
    await withBusy("leave", async () => {
      const body = await apiFetch<{
        unavailability: Unavailability;
        conflicts?: unknown[];
      }>(`/api/practitioners/${practitionerId}/unavailability`, {
        method: "POST",
        body: JSON.stringify({
          kind: leaveForm.kind,
          timezone: leaveForm.timezone.trim(),
          startAtUtc: new Date(leaveForm.startAtLocal).toISOString(),
          endAtUtc: new Date(leaveForm.endAtLocal).toISOString(),
        }),
      });
      setLastLeave(body.unavailability);
      setCancelIntervalId(body.unavailability.id);
      const conflictCount = Array.isArray(body.conflicts) ? body.conflicts.length : 0;
      setMessage(
        conflictCount > 0
          ? `Created leave ${body.unavailability.id} with ${conflictCount} conflict(s).`
          : `Created unavailability ${body.unavailability.id}.`,
      );
    });
  }

  async function onCancelLeave(event: FormEvent) {
    event.preventDefault();
    await withBusy("cancel-leave", async () => {
      const body = await apiFetch<{ unavailability: Unavailability }>(
        `/api/practitioners/${practitionerId}/unavailability/${cancelIntervalId.trim()}/cancel`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setLastLeave(body.unavailability);
      setMessage(`Cancelled unavailability ${body.unavailability.id}.`);
    });
  }

  async function onQueryAvailability(event: FormEvent) {
    event.preventDefault();
    await withBusy("availability", async () => {
      const params = new URLSearchParams({
        branchId: availabilityForm.branchId.trim(),
        startAtUtc: new Date(availabilityForm.startAtLocal).toISOString(),
        endAtUtc: new Date(availabilityForm.endAtLocal).toISOString(),
        durationMinutes: availabilityForm.durationMinutes.trim(),
      });
      const body = await apiFetch<{ availability: AvailabilityResult }>(
        `/api/practitioners/${practitionerId}/availability?${params.toString()}`,
      );
      setAvailability(body.availability);
      setMessage("Availability loaded (advisory — booking is not auto-gated).");
    });
  }

  if (!practitioner && !error) {
    return <LoadingState label="Loading practitioner…" />;
  }
  if (error && !practitioner) {
    return <ErrorState title="Practitioner not available" body={error} />;
  }
  if (!practitioner) {
    return null;
  }

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <Link className="btn btn-ghost" href="/practitioners">
          ← Practitioners
        </Link>
        <span className={`badge ${practitioner.status === "active" ? "badge-ok" : "badge-neutral"}`}>
          {practitioner.status}
        </span>
      </div>
      {error ? <ErrorState title="Request failed" body={error} /> : null}
      {message ? (
        <p className="panel" style={{ margin: 0, color: "var(--ok)" }}>
          {message}
        </p>
      ) : null}

      <div className="panel stack">
        <p className="eyebrow">Profile</p>
        <p style={{ margin: 0 }}>
          <strong>Id</strong> <code>{practitioner.id}</code>
        </p>
        <p style={{ margin: 0 }}>
          <strong>User</strong> <code>{practitioner.userId}</code>
        </p>
        <form className="stack" onSubmit={onUpdate}>
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" type="submit" disabled={busy !== null}>
              {busy === "update" ? "Saving…" : "Update name"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy !== null || practitioner.status === "active"}
              onClick={() => void onActivate()}
            >
              {busy === "activate" ? "Working…" : "Activate"}
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={busy !== null || practitioner.status !== "active"}
              onClick={() => void onDeactivate()}
            >
              {busy === "deactivate" ? "Working…" : "Deactivate"}
            </button>
          </div>
        </form>
      </div>

      <div className="panel stack">
        <p className="eyebrow">Branch assignments</p>
        {assignments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No branches assigned yet. There is no branch directory API — enter a known branch id.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {assignments.map((assignment) => (
              <li key={assignment.id} style={{ marginBottom: "0.55rem" }}>
                <code>{assignment.branchId}</code>{" "}
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void onUnassign(assignment.branchId)}
                >
                  Unassign
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="toolbar" onSubmit={onAssign}>
          <div className="field" style={{ flex: "1 1 14rem" }}>
            <label htmlFor="branchId">Branch id</label>
            <input
              id="branchId"
              required
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={busy !== null}>
            {busy === "assign" ? "Assigning…" : "Assign branch"}
          </button>
        </form>
      </div>

      <div className="panel stack">
        <p className="eyebrow">Weekly schedule (write-only list)</p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          Schedules are created/replaced via POST. There is no GET directory of schedules — store
          returned schedule ids from create responses.
        </p>
        <form className="stack" onSubmit={onCreateSchedule}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="scheduleBranchId">Branch id</label>
              <input
                id="scheduleBranchId"
                required
                value={scheduleForm.branchId}
                onChange={(e) => setScheduleForm((f) => ({ ...f, branchId: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="scheduleTimezone">Timezone</label>
              <input
                id="scheduleTimezone"
                required
                value={scheduleForm.timezone}
                onChange={(e) => setScheduleForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="weekday">Weekday</label>
              <select
                id="weekday"
                value={scheduleForm.weekday}
                onChange={(e) => setScheduleForm((f) => ({ ...f, weekday: e.target.value }))}
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={String(index)}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="startLocal">Start local (HH:MM)</label>
              <input
                id="startLocal"
                required
                pattern="([01]\d|2[0-3]):[0-5]\d"
                value={scheduleForm.startLocal}
                onChange={(e) => setScheduleForm((f) => ({ ...f, startLocal: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="endLocal">End local (HH:MM or 24:00)</label>
              <input
                id="endLocal"
                required
                value={scheduleForm.endLocal}
                onChange={(e) => setScheduleForm((f) => ({ ...f, endLocal: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="replaceScheduleId">Schedule id (for replace)</label>
              <input
                id="replaceScheduleId"
                value={replaceScheduleId}
                onChange={(e) => setReplaceScheduleId(e.target.value)}
                placeholder="From create response"
              />
            </div>
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" type="submit" disabled={busy !== null}>
              {busy === "schedule" ? "Creating…" : "Create schedule"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={busy !== null || !replaceScheduleId.trim()}
              onClick={() => void submitReplaceSchedule()}
            >
              {busy === "replace" ? "Replacing…" : "Replace schedule"}
            </button>
          </div>
        </form>
        {lastSchedule ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Last schedule <code>{lastSchedule.id}</code> · branch <code>{lastSchedule.branchId}</code>{" "}
            · {lastSchedule.intervals.length} interval(s)
          </p>
        ) : null}
      </div>

      <div className="panel stack">
        <p className="eyebrow">Unavailability / leave (write-only list)</p>
        <form className="stack" onSubmit={onCreateLeave}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="leaveKind">Kind</label>
              <select
                id="leaveKind"
                value={leaveForm.kind}
                onChange={(e) => setLeaveForm((f) => ({ ...f, kind: e.target.value }))}
              >
                <option value="break">break</option>
                <option value="leave">leave</option>
                <option value="exception">exception</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="leaveTimezone">Timezone</label>
              <input
                id="leaveTimezone"
                required
                value={leaveForm.timezone}
                onChange={(e) => setLeaveForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="leaveStart">Start (local browser)</label>
              <input
                id="leaveStart"
                type="datetime-local"
                required
                value={leaveForm.startAtLocal}
                onChange={(e) => setLeaveForm((f) => ({ ...f, startAtLocal: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="leaveEnd">End (local browser)</label>
              <input
                id="leaveEnd"
                type="datetime-local"
                required
                value={leaveForm.endAtLocal}
                onChange={(e) => setLeaveForm((f) => ({ ...f, endAtLocal: e.target.value }))}
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy !== null}>
            {busy === "leave" ? "Creating…" : "Create unavailability"}
          </button>
        </form>
        <form className="toolbar" onSubmit={onCancelLeave}>
          <div className="field" style={{ flex: "1 1 14rem" }}>
            <label htmlFor="cancelIntervalId">Interval id to cancel</label>
            <input
              id="cancelIntervalId"
              required
              value={cancelIntervalId}
              onChange={(e) => setCancelIntervalId(e.target.value)}
              placeholder="From create response"
            />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={busy !== null}>
            {busy === "cancel-leave" ? "Cancelling…" : "Cancel interval"}
          </button>
        </form>
        {lastLeave ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            Last interval <code>{lastLeave.id}</code> · {lastLeave.kind} · {lastLeave.status}
          </p>
        ) : null}
      </div>

      <div className="panel stack">
        <p className="eyebrow">Advisory availability</p>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          GET availability returns advisory free/busy windows. Appointment create does not enforce
          these results.
        </p>
        <form className="stack" onSubmit={onQueryAvailability}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="availBranchId">Branch id</label>
              <input
                id="availBranchId"
                required
                value={availabilityForm.branchId}
                onChange={(e) => setAvailabilityForm((f) => ({ ...f, branchId: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="durationMinutes">Duration (minutes)</label>
              <input
                id="durationMinutes"
                type="number"
                min={1}
                max={1440}
                required
                value={availabilityForm.durationMinutes}
                onChange={(e) =>
                  setAvailabilityForm((f) => ({ ...f, durationMinutes: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="availStart">Window start (local browser)</label>
              <input
                id="availStart"
                type="datetime-local"
                required
                value={availabilityForm.startAtLocal}
                onChange={(e) =>
                  setAvailabilityForm((f) => ({ ...f, startAtLocal: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="availEnd">Window end (local browser)</label>
              <input
                id="availEnd"
                type="datetime-local"
                required
                value={availabilityForm.endAtLocal}
                onChange={(e) => setAvailabilityForm((f) => ({ ...f, endAtLocal: e.target.value }))}
              />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy !== null}>
            {busy === "availability" ? "Querying…" : "Query availability"}
          </button>
        </form>
        {availability ? (
          <div className="stack">
            <p style={{ margin: 0 }}>
              <span className="badge badge-warn">advisory</span>{" "}
              {availability.available.length} available range(s) · {availability.unavailable.length}{" "}
              unavailable · {availability.conflicts.length} conflict(s)
            </p>
            {availability.available.length > 0 ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Available start</th>
                      <th>Available end</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availability.available.map((range) => (
                      <tr key={`${range.startAtUtc}-${range.endAtUtc}`}>
                        <td>{new Date(range.startAtUtc).toLocaleString()}</td>
                        <td>{new Date(range.endAtUtc).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No available ranges in this window.
              </p>
            )}
            {availability.conflicts.length > 0 ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Conflict</th>
                      <th>Appointment</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availability.conflicts.map((conflict) => (
                      <tr key={`${conflict.appointmentId}-${conflict.reason}`}>
                        <td>{conflict.reason}</td>
                        <td>
                          <Link href={`/appointments/${conflict.appointmentId}`}>
                            {conflict.appointmentId}
                          </Link>
                        </td>
                        <td>{new Date(conflict.startAtUtc).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return `${err.message} (HTTP ${err.status})`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}
