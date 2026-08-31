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

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id }));
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт"];
const BOOKINGS_COLLECTION = "bookings";

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
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatRange(monday) {
  const friday = addDays(monday, 4);
  const sameMonth = monday.getMonth() === friday.getMonth();
  const startStr = monday.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: sameMonth ? undefined : "long",
  });
  const endStr = friday.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
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
      setFormError("Кабинет доступен только по будням.");
      return;
    }
    if (!periodId) {
      setFormError("Выберите урок.");
      return;
    }
    if (!form.teacher.trim() || !form.className.trim()) {
      setFormError("Укажите имя учителя и класс.");
      return;
    }
    if ((bookings[date] || {})[periodId]) {
      setFormError("Это время уже занято — выберите другое.");
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
      setFormError("Не удалось сохранить бронь. Проверьте подключение и попробуйте снова.");
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await deleteDoc(doc(db, BOOKINGS_COLLECTION, docId(cancelTarget.date, cancelTarget.periodId)));
    } catch (err) {
      // если удаление не удалось, слот просто останется занятым — пользователь увидит это в сетке
    }
    setCancelTarget(null);
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
              <h1>Кабинет интерактивных кубов</h1>
              <p className="subtitle">Один кабинет — общее расписание для всех учителей</p>
            </div>
          </div>
          <button className="quick-btn" onClick={openQuick}>
            <Plus size={18} /> Быстрая бронь
          </button>
        </div>

        <div className="nav-row">
          <div className="nav-btns">
            <button className="icon-btn" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Предыдущая неделя">
              <ChevronLeft size={18} />
            </button>
            <button className="today-btn" onClick={() => setWeekStart(getMonday(new Date()))}>
              Сегодня
            </button>
            <button className="icon-btn" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Следующая неделя">
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="range-label">{formatRange(weekStart)}</span>
        </div>

        {connectionError && (
          <div className="form-error" style={{ marginBottom: 16 }}>
            Не удалось подключиться к базе данных. Проверьте настройки Firebase в src/firebase.js и правила доступа Firestore.
          </div>
        )}

        {loading ? (
          <div className="empty-hint">Загружаем расписание…</div>
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
                      <span className="p-num">{p.id} урок</span>
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
                            <button className="cell-empty" onClick={() => openCell(key, p.id)} aria-label="Забронировать">
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
          <span><span className="swatch free"></span>Свободно</span>
          <span><span className="swatch busy"></span>Занято</span>
        </div>
      </div>

      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Забронировать кабинет</h2>
                <p className="modal-sub">
                  {modal.locked
                    ? `${new Date(modal.date + "T00:00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}, ${modal.periodId} урок`
                    : "Выберите день и урок"}
                </p>
              </div>
              <button className="close-x" onClick={() => setModal(null)} aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submitBooking}>
              {!modal.locked && (
                <div className="two-col">
                  <div className="field">
                    <label htmlFor="c-date">Дата</label>
                    <input
                      id="c-date"
                      type="date"
                      value={modal.date}
                      onChange={(e) => setModal((m) => ({ ...m, date: e.target.value, periodId: null }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="c-period">Урок</label>
                    <select
                      id="c-period"
                      value={modal.periodId || ""}
                      onChange={(e) => setModal((m) => ({ ...m, periodId: Number(e.target.value) }))}
                    >
                      <option value="" disabled>
                        Выбрать
                      </option>
                      {isWeekday(modal.date) &&
                        freePeriodsForDate(modal.date).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id} урок
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="field">
                <label htmlFor="c-teacher">Учитель</label>
                <input
                  id="c-teacher"
                  type="text"
                  placeholder="Например, Ирина Петрова"
                  value={form.teacher}
                  onChange={(e) => setForm((f) => ({ ...f, teacher: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="c-class">Класс</label>
                <input
                  id="c-class"
                  type="text"
                  placeholder="Например, 3А"
                  value={form.className}
                  onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="c-note">Заметка (необязательно)</label>
                <textarea
                  id="c-note"
                  placeholder="Тема занятия, пожелания…"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
                  Отмена
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Сохраняем…" : "Забронировать"}
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
                <h2>Отменить бронь?</h2>
                <p className="modal-sub">
                  <CalendarClock size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {new Date(cancelTarget.date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })},{" "}
                  {cancelTarget.periodId} урок
                </p>
              </div>
              <button className="close-x" onClick={() => setCancelTarget(null)} aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 14, marginBottom: 20 }}>
              Бронь: <span className="cancel-teacher">{cancelTarget.entry.teacher}</span>, {cancelTarget.entry.className}
              {cancelTarget.entry.note ? ` — ${cancelTarget.entry.note}` : ""}
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setCancelTarget(null)}>
                Оставить
              </button>
              <button className="btn-danger" onClick={confirmCancel}>
                Отменить бронь
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
