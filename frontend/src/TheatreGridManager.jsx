import React, { useState } from 'react';
import { Upload, Save, RotateCcw, Calendar, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Stethoscope } from 'lucide-react';
import { DAYS_OF_WEEK, GASTRO_ROOMS, parseTheatreGridFile, getCycleWeek, formatDDMMYYYY, addDaysYMD, matchDoctorName } from './theatreGrid';

export default function TheatreGridManager({
  theatreTemplates,
  onSaveTemplates,
  onResetTemplates,
  staffList,
  weekMonday,
  shiftWeek,
  setWeekMonday,
  weekEndoSchedule,
  openCoverModal,
  currentUser
}) {
  const currentWeekCycle = getCycleWeek(weekMonday);
  const [viewMode, setViewMode] = useState('live_week'); // 'live_week' | 'master_templates'
  const [selectedTemplateWeek, setSelectedTemplateWeek] = useState(currentWeekCycle || 3);
  const [targetUploadWeek, setTargetUploadWeek] = useState('auto');
  const [statusBanner, setStatusBanner] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const activeTemplate = theatreTemplates?.[selectedTemplateWeek] || {
    weekNumber: selectedTemplateWeek,
    label: `Week ${selectedTemplateWeek}`,
    sessions: []
  };

  const getCellSession = (day, sessionAmPm, roomKey) => {
    return (activeTemplate.sessions || []).find(
      s => s.day === day && s.session === sessionAmPm && s.room === roomKey
    );
  };

  const handleCellDoctorChange = (day, dayIndex, sessionAmPm, roomObj, newDoctorName) => {
    const existingSessions = [...(activeTemplate.sessions || [])];
    const idx = existingSessions.findIndex(
      s => s.day === day && s.session === sessionAmPm && s.room === roomObj.key
    );

    if (!newDoctorName.trim()) {
      if (idx !== -1) existingSessions.splice(idx, 1);
    } else if (idx !== -1) {
      existingSessions[idx] = {
        ...existingSessions[idx],
        staff_name: newDoctorName
      };
    } else {
      existingSessions.push({
        id: `w${selectedTemplateWeek}_${day.toLowerCase()}_${sessionAmPm.toLowerCase()}_${roomObj.key.replace(/\s+/g, '').toLowerCase()}`,
        day,
        dayIndex,
        session: sessionAmPm,
        startTime: sessionAmPm === 'PM' ? '13:30' : roomObj.defaultType === 'Gas/Colon' ? '08:00' : '09:00',
        room: roomObj.key,
        listType: roomObj.defaultType,
        site: roomObj.site,
        staff_name: newDoctorName,
        raw_doctor: newDoctorName
      });
    }

    const nextTemplates = {
      ...theatreTemplates,
      [selectedTemplateWeek]: {
        ...activeTemplate,
        isDefaultFromWeek3: false,
        sessions: existingSessions
      }
    };
    onSaveTemplates(nextTemplates);
  };

  const handleUploadGridFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setStatusBanner('');
    try {
      const overrideWeek = targetUploadWeek === 'auto' ? null : Number(targetUploadWeek);
      const extractedByWeek = await parseTheatreGridFile(file, staffList, overrideWeek);
      const weeksLoaded = Object.keys(extractedByWeek);
      if (weeksLoaded.length === 0) {
        alert('No ENDO or Gas/Colon sessions found in uploaded file.');
      } else {
        const nextTemplates = { ...theatreTemplates, ...extractedByWeek };
        await onSaveTemplates(nextTemplates);
        const firstWeek = Number(weeksLoaded[0]);
        setSelectedTemplateWeek(firstWeek);
        const totalSessions = weeksLoaded.reduce((acc, w) => acc + extractedByWeek[w].sessions.length, 0);
        setStatusBanner(
          `Imported ${totalSessions} Gastro Endoscopy lists into Week(s) ${weeksLoaded.join(', ')} from "${file.name}". Non-gastro hospital theatres excluded.`
        );
      }
    } catch (err) {
      console.error(err);
      alert('Failed to parse Theatre Grid file: ' + err.message);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const weekEndoClashCount = (weekEndoSchedule?.sessions || []).filter(s => Boolean(s.leaveClash)).length;

  return (
    <section className="space-y-6">
      {/* Sub-view Switcher & Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
              Endoscopy & Theatre Lists
            </span>
            <span className="text-xs text-slate-500">
              Filtered to ENDO (1–3) & Gas/Colon (1 & 4)
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Gastroenterology Endoscopy Schedule
          </h2>
          <p className="text-xs text-slate-500">
            View live weekly lists with leave clash detection, or manage the 4-week repeating master templates.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setViewMode('live_week')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'live_week'
                ? 'bg-white text-blue-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Live Weekly View
          </button>
          <button
            onClick={() => setViewMode('master_templates')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'master_templates'
                ? 'bg-white text-blue-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            4-Week Master Templates
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-lg text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {statusBanner}
          </span>
          <button onClick={() => setStatusBanner('')} className="text-emerald-700 hover:underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW 1: LIVE WEEK VIEW (Cycle Week X for weekMonday) */}
      {viewMode === 'live_week' && (
        <div className="space-y-4">
          {/* Week Navigator */}
          <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftWeek(-7)} className="p-1.5 border rounded hover:bg-slate-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="font-bold text-slate-800 text-sm">
                Week Commencing: {formatDDMMYYYY(weekMonday)}
              </div>
              <button onClick={() => shiftWeek(7)} className="p-1.5 border rounded hover:bg-slate-50">
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5 rounded-full ml-1">
                Cycle Week {weekEndoSchedule?.cycleWeek}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {weekEndoClashCount > 0 ? (
                <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {weekEndoClashCount} Leave {weekEndoClashCount === 1 ? 'Clash' : 'Clashes'} This Week
                </span>
              ) : (
                <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  All Lists Scheduled / Covered
                </span>
              )}
            </div>
          </div>

          {/* Live Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-800 text-white flex items-center justify-between text-xs">
              <span className="font-bold">
                Cycle Week {weekEndoSchedule?.cycleWeek} Endoscopy Grid ({formatDDMMYYYY(weekMonday)} – {formatDDMMYYYY(addDaysYMD(weekMonday, 4))})
              </span>
              <div className="flex items-center gap-3">
                <span className="text-teal-200">● ENDO 1–3 (Fitzroy)</span>
                <span className="text-purple-200">● Gas/Colon 1 & 4 (St George's)</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="p-2.5 w-32 border-r border-slate-200">Day / Date</th>
                    <th className="p-2.5 w-14 border-r border-slate-200 text-center">Session</th>
                    {GASTRO_ROOMS.map(room => (
                      <th key={room.key} className="p-2.5 border-r border-slate-200 last:border-r-0 min-w-[165px]">
                        <div className="font-bold text-slate-800">{room.key}</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          {room.defaultType} • {room.site}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {DAYS_OF_WEEK.map((day, dIdx) => {
                    const dateStr = addDaysYMD(weekMonday, dIdx);
                    return (
                      <React.Fragment key={day}>
                        {['AM', 'PM'].map((amPm, sIdx) => (
                          <tr
                            key={`${day}_${amPm}`}
                            className={amPm === 'AM' ? 'bg-white' : 'bg-slate-50/60 border-b-2 border-slate-200'}
                          >
                            {sIdx === 0 && (
                              <td
                                rowSpan={2}
                                className="p-2.5 font-bold text-slate-800 border-r border-slate-200 bg-slate-50/90 align-middle"
                              >
                                <div>{day}</div>
                                <div className="text-[11px] font-normal text-slate-500">{formatDDMMYYYY(dateStr)}</div>
                              </td>
                            )}
                            <td className="p-2 text-center font-bold border-r border-slate-200">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                amPm === 'AM' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {amPm}
                              </span>
                            </td>
                            {GASTRO_ROOMS.map(roomObj => {
                              const sess = (weekEndoSchedule?.sessions || []).find(
                                s => s.day === day && s.session === amPm && s.room === roomObj.key
                              );
                              if (!sess) {
                                return (
                                  <td key={roomObj.key} className="p-2 border-r border-slate-100 last:border-r-0 text-slate-300 italic text-center">
                                    —
                                  </td>
                                );
                              }
                              const isMe = currentUser && matchDoctorName(sess.staff_name, currentUser.name);
                              const hasLeave = Boolean(sess.leaveClash);
                              return (
                                <td
                                  key={roomObj.key}
                                  className={`p-2 border-r border-slate-100 last:border-r-0 align-top ${
                                    hasLeave
                                      ? 'bg-rose-50/90'
                                      : isMe
                                        ? 'bg-amber-50/80'
                                        : ''
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div>
                                      <div className={`font-bold ${hasLeave ? 'line-through text-rose-700' : 'text-slate-900'}`}>
                                        {sess.staff_name}
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        {sess.listType} • {sess.startTime}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => openCoverModal(sess)}
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                        hasLeave
                                          ? 'bg-rose-600 text-white hover:bg-rose-700'
                                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                      }`}
                                    >
                                      {hasLeave ? 'Cover' : 'Edit'}
                                    </button>
                                  </div>

                                  {hasLeave && (
                                    <div className="mt-1.5 p-1.5 rounded bg-rose-100/90 border border-rose-200 text-[10px] text-rose-900 space-y-0.5">
                                      <div className="font-bold flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                        ON LEAVE ({sess.leaveClash.leave_type})
                                      </div>
                                      {sess.coverDoctor ? (
                                        <div className="text-emerald-800 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded">
                                          ✓ Cover: {sess.coverDoctor}
                                        </div>
                                      ) : sess.coverStatus === 'cancelled' ? (
                                        <div className="text-slate-700 font-semibold">List Cancelled</div>
                                      ) : (
                                        <div className="text-rose-700 font-semibold">⚠️ Needs Cover / Backfill</div>
                                      )}
                                    </div>
                                  )}

                                  {!hasLeave && sess.coverDoctor && (
                                    <div className="mt-1 text-[10px] bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded font-semibold">
                                      Cover: {sess.coverDoctor}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: 4-WEEK MASTER TEMPLATES (Weeks 1, 2, 3, 4) */}
      {viewMode === 'master_templates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map(w => {
                const tmpl = theatreTemplates?.[w] || theatreTemplates?.[String(w)];
                const isSelected = selectedTemplateWeek === w;
                return (
                  <button
                    key={w}
                    onClick={() => setSelectedTemplateWeek(w)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Cycle Week {w}</span>
                    <span className={`text-[10px] font-normal px-1 rounded ${
                      isSelected ? 'bg-blue-800 text-blue-200' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {(tmpl?.sessions || []).length} lists
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Uploader Box */}
            <div className="flex items-center gap-2">
              <select
                value={targetUploadWeek}
                onChange={(e) => setTargetUploadWeek(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1.5 text-xs bg-white font-medium"
              >
                <option value="auto">Auto-detect Week from File</option>
                <option value="1">Import to Week 1</option>
                <option value="2">Import to Week 2</option>
                <option value="3">Import to Week 3</option>
                <option value="4">Import to Week 4</option>
              </select>

              <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                {isUploading ? 'Parsing...' : 'Upload Hospital Grid'}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleUploadGridFile}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>

              <button
                onClick={async () => {
                  await onResetTemplates();
                  setStatusBanner('Reset Weeks 1–4 to default hospital CSV files.');
                }}
                className="px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-600 hover:bg-white"
                title="Reset to default 4-week CSV data"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 px-1">
            Editing Template: <strong className="text-slate-800">Week {selectedTemplateWeek}</strong> (Source: {activeTemplate.sourceFile || 'Hospital CSV'})
          </div>

          {/* Master Grid Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <datalist id="gastro-staff-datalist">
              <option value="Vacant" />
              <option value="Fellow List" />
              {staffList.map(s => (
                <option key={s.id || s.name} value={s.name} />
              ))}
            </datalist>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="p-3 w-28 border-r border-slate-700">Day</th>
                  <th className="p-3 w-16 border-r border-slate-700 text-center">Session</th>
                  {GASTRO_ROOMS.map(room => (
                    <th key={room.key} className="p-3 border-r border-slate-700 last:border-r-0 min-w-[165px]">
                      <div className="font-bold text-white">{room.key}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          room.defaultType === 'ENDO'
                            ? 'bg-teal-500/20 text-teal-200 border border-teal-400/30'
                            : 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                        }`}>
                          {room.defaultType}
                        </span>
                        <span className="text-[10px] text-slate-300 font-normal">{room.site}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {DAYS_OF_WEEK.map((day, dayIdx) => (
                  <React.Fragment key={day}>
                    {['AM', 'PM'].map((sessionAmPm, sIdx) => (
                      <tr
                        key={`${day}_${sessionAmPm}`}
                        className={sessionAmPm === 'AM' ? 'bg-white' : 'bg-slate-50/70 border-b-2 border-slate-200'}
                      >
                        {sIdx === 0 && (
                          <td
                            rowSpan={2}
                            className="p-3 font-bold text-slate-900 border-r border-slate-200 bg-slate-50 align-middle"
                          >
                            <div>{day}</div>
                            <div className="text-[10px] font-normal text-slate-500 mt-0.5">Week {selectedTemplateWeek}</div>
                          </td>
                        )}
                        <td className="p-2.5 text-center font-bold border-r border-slate-200">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            sessionAmPm === 'AM'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {sessionAmPm}
                          </span>
                        </td>
                        {GASTRO_ROOMS.map(roomObj => {
                          const cell = getCellSession(day, sessionAmPm, roomObj.key);
                          const val = cell ? cell.staff_name : '';
                          const isGasColon = roomObj.defaultType === 'Gas/Colon';
                          return (
                            <td key={roomObj.key} className="p-2 border-r border-slate-100 last:border-r-0 align-top">
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  list="gastro-staff-datalist"
                                  value={val}
                                  placeholder="— No Gastro List —"
                                  onChange={(e) =>
                                    handleCellDoctorChange(day, dayIdx, sessionAmPm, roomObj, e.target.value)
                                  }
                                  className={`w-full text-xs px-2 py-1.5 rounded border transition-colors ${
                                    val
                                      ? isGasColon
                                        ? 'bg-purple-50/50 border-purple-200 font-semibold text-slate-900 focus:border-purple-500'
                                        : 'bg-teal-50/50 border-teal-200 font-semibold text-slate-900 focus:border-teal-500'
                                      : 'bg-transparent border-dashed border-slate-200 text-slate-400 focus:bg-white focus:border-slate-400'
                                  }`}
                                />
                                {cell && (
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                                    <span>{cell.listType} • {cell.startTime}</span>
                                    {cell.raw_doctor && cell.raw_doctor !== cell.staff_name && (
                                      <span title={`Grid raw text: ${cell.raw_doctor}`}>({cell.raw_doctor})</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
