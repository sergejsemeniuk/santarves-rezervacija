import { useState, useEffect, useMemo } from "react";
import { Box, ChevronLeft, ChevronRight, X, Plus, CalendarClock } from "lucide-react";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => ({ id }));
const WEEKDAY_LABELS = ["Pr", "An", "Tr", "Kt", "Pn"];
const BOOKINGS_COLLECTION = "bookings";
const LOCALE = "lt-LT";

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function formatShort(d) {
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

function formatRange(monday) {
  const friday = addDays(monday, 4);
  const sameMonth = monday.getMonth() === friday.getMonth();
  const startStr = monday.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: sameMonth ? undefined : "long",
  });
  const endStr = friday.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function isWeekday(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function docId(date, periodId) {
  return `${date}_${periodId}`;
}

export default function CubeRoomBooking() {
  const [bookings, setBookings] = useState({});
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ teacher: "", className: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, BOOKINGS_COLLECTION),
      (snapshot) => {
        const next = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (!next[data.date]) next[data.date] = {};
          next[data.date][data.periodId] = {
            teacher: data.teacher,
            className: data.className,
            note: data.note || "",
          };
        });
        setBookings(next);
        setLoading(false);
        setConnectionError(false);
      },
      () => {
        setLoading(false);
        setConnectionError(true);
      }
    );
    return () => unsub();
  }, []);

  const weekDays = useMemo(
    () => WEEKDAY_LABELS.map((label, i) => ({ label, date: addDays(weekStart, i) })),
    [weekStart]
  );

  const openCell = (date, periodId) => {
    setForm({ teacher: "", className: "", note: "" });
    setFormError("");
    setModal({ date, periodId, locked: true });
  };

  const openQuick = () => {
    setForm({ teacher: "", className: "", note: "" });
    setFormError("");
    setModal({ date: dateKey(weekDays[0].date), periodId: null, locked: false });
  };

  const freePeriodsForDate = (dateStr) => {
    const dayBookings = bookings[dateStr] || {};
    return PERIODS.filter((p) => !dayBookings[p.id]);
  };

  const submitBooking = async (e) => {
    e.preventDefault();
    if (!modal) return;
    const { date, periodId } = modal;

    if (!date || !isWeekday(date)) {
      setFormError("Kabinetas prieinamas tik darbo dienomis.");
      return;
    }
    if (!periodId) {
      setFormError("Pasirinkite pamoką.");
      return;
    }
    if (!form.teacher.trim() || !form.className.trim()) {
      setFormError("Nurodykite mokytojo vardą ir klasę.");
      return;
    }
    if ((bookings[date] || {})[periodId]) {
      setFormError("Šis laikas jau užimtas — pasirinkite kitą.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, BOOKINGS_COLLECTION, docId(date, periodId)), {
        date,
        periodId,
        teacher: form.teacher.trim(),
        className: form.className.trim(),
        note: form.note.trim(),
        createdAt: serverTimestamp(),
      });
      setModal(null);
    } catch (err) {
      setFormError("Nepavyko išsaugoti rezervacijos. Patikrinkite ryšį ir bandykite dar kartą.");
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await deleteDoc(doc(db, BOOKINGS_COLLECTION, docId(cancelTarget.date, cancelTarget.periodId)));
      setCancelTarget(null);
    } catch (err) {
      // rezervacija liks užimta — vartotojas tai pamatys tvarkaraštyje
    } finally {
      setCancelling(false);
    }
  };

  const todayKey = dateKey(new Date());

  return (
    <div className="croom">
      <div className="wrap">
        <div className="hero">
          <div className="hero-title">
            <div className="cube-badge">
              <Box size={26} strokeWidth={2.2} />
            </div>
            <div>
              <h1>IMO kubų rezervacijos sistema</h1>
              <p className="subtitle">Vienas kabinetas — bendras tvarkaraštis visiems mokytojams</p>
            </div>
          </div>
          <button className="quick-btn" onClick={openQuick}>
            <Plus size={18} /> Rezervuoti kubus
          </button>
        </div>

        <div className="nav-row">
          <div className="nav-btns">
            <button className="icon-btn" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Ankstesnė savaitė">
              <ChevronLeft size={18} />
            </button>
            <button className="today-btn" onClick={() => setWeekStart(getMonday(new Date()))}>
              Šiandien
            </button>
            <button className="icon-btn" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Kita savaitė">
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="range-label">{formatRange(weekStart)}</span>
        </div>

        {connectionError && (
          <div className="form-error" style={{ marginBottom: 16 }}>
            Nepavyko prisijungti prie duomenų bazės. Patikrinkite Firebase nustatymus faile src/firebase.js ir Firestore prieigos taisykles.
          </div>
        )}

        {loading ? (
          <div className="empty-hint">Kraunamas tvarkaraštis…</div>
        ) : (
          <div className="grid-scroll">
            <table>
              <thead>
                <tr>
                  <th className="period-col" style={{ background: "var(--surface)" }}></th>
                  {weekDays.map((w) => {
                    const key = dateKey(w.date);
                    return (
                      <th key={key} className={key === todayKey ? "today" : ""}>
                        {w.label}
                        <span className="day-date">{formatShort(w.date)}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((p) => (
                  <tr key={p.id}>
                    <td className="period-col">
                      <span className="p-num">{p.id} pamoka</span>
                    </td>
                    {weekDays.map((w) => {
                      const key = dateKey(w.date);
                      const entry = (bookings[key] || {})[p.id];
                      return (
                        <td key={key}>
                          {entry ? (
                            <button
                              className="cell-booked"
                              onClick={() => setCancelTarget({ date: key, periodId: p.id, entry })}
                            >
                              <span className="teacher">{entry.teacher}</span>
                              <span className="cls">{entry.className}</span>
                            </button>
                          ) : (
                            <button className="cell-empty" onClick={() => openCell(key, p.id)} aria-label="Rezervuoti">
                              <Plus size={18} />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="legend">
          <span><span className="swatch free"></span>Laisva</span>
          <span><span className="swatch busy"></span>Užimta</span>
        </div>
      </div>

      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Rezervuoti kubus</h2>
                <p className="modal-sub">
                  {modal.locked
                    ? `${new Date(modal.date + "T00:00:00").toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" })}, ${modal.periodId} pamoka`
                    : "Pasirinkite dieną ir pamoką"}
                </p>
              </div>
              <button className="close-x" onClick={() => setModal(null)} aria-label="Uždaryti">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submitBooking}>
              {!modal.locked && (
                <div className="two-col">
                  <div className="field">
                    <label htmlFor="c-date">Data</label>
                    <input
                      id="c-date"
                      type="date"
                      value={modal.date}
                      onChange={(e) => setModal((m) => ({ ...m, date: e.target.value, periodId: null }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="c-period">Pamoka</label>
                    <select
                      id="c-period"
                      value={modal.periodId || ""}
                      onChange={(e) => setModal((m) => ({ ...m, periodId: Number(e.target.value) }))}
                    >
                      <option value="" disabled>
                        Pasirinkti
                      </option>
                      {isWeekday(modal.date) &&
                        freePeriodsForDate(modal.date).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id} pamoka
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="field">
                <label htmlFor="c-teacher">Mokytojas</label>
                <input
                  id="c-teacher"
                  type="text"
                  placeholder="Pvz., Rūta Petraitienė"
                  value={form.teacher}
                  onChange={(e) => setForm((f) => ({ ...f, teacher: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="c-class">Klasė</label>
                <input
                  id="c-class"
                  type="text"
                  placeholder="Pvz., 3A"
                  value={form.className}
                  onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="c-note">Pastaba (neprivaloma)</label>
                <textarea
                  id="c-note"
                  placeholder="Pamokos tema, pageidavimai…"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
                  Atšaukti
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saugoma…" : "Rezervuoti"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="overlay" onClick={() => setCancelTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div className="modal-head">
              <div>
                <h2>Atšaukti rezervaciją?</h2>
                <p className="modal-sub">
                  <CalendarClock size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {new Date(cancelTarget.date + "T00:00:00").toLocaleDateString(LOCALE, { day: "numeric", month: "long" })},{" "}
                  {cancelTarget.periodId} pamoka
                </p>
              </div>
              <button className="close-x" onClick={() => setCancelTarget(null)} aria-label="Uždaryti">
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 14, marginBottom: 20 }}>
              Rezervacija: <span className="cancel-teacher">{cancelTarget.entry.teacher}</span>, {cancelTarget.entry.className}
              {cancelTarget.entry.note ? ` — ${cancelTarget.entry.note}` : ""}
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setCancelTarget(null)}>
                Palikti
              </button>
              <button className="btn-danger" onClick={confirmCancel} disabled={cancelling}>
                {cancelling ? "Atšaukiama…" : "Atšaukti rezervaciją"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
