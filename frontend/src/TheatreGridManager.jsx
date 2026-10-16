import React, { useState } from 'react';
import { Upload, Save, RotateCcw, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react';
import { DAYS_OF_WEEK, GASTRO_ROOMS, parseTheatreGridFile, getCycleWeek } from './theatreGrid';

export default function TheatreGridManager({
  theatreTemplates,
  onSaveTemplates,
  onResetTemplates,
  staffList,
  weekMonday
}) {
  const currentWeekCycle = getCycleWeek(weekMonday);
  const [selectedWeek, setSelectedWeek] = useState(currentWeekCycle || 3);
  const [targetUploadWeek, setTargetUploadWeek] = useState('auto');
  const [statusBanner, setStatusBanner] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const activeTemplate = theatreTemplates?.[selectedWeek] || {
    weekNumber: selectedWeek,
    label: `Week ${selectedWeek}`,
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
      // Remove slot if cleared
      if (idx !== -1) existingSessions.splice(idx, 1);
    } else if (idx !== -1) {
      existingSessions[idx] = {
        ...existingSessions[idx],
        staff_name: newDoctorName
      };
    } else {
      existingSessions.push({
        id: `w${selectedWeek}_${day.toLowerCase()}_${sessionAmPm.toLowerCase()}_${roomObj.key.replace(/\s+/g, '').toLowerCase()}`,
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
      [selectedWeek]: {
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
        setSelectedWeek(firstWeek);
        const totalSessions = weeksLoaded.reduce((acc, w) => acc + extractedByWeek[w].sessions.length, 0);
        setStatusBanner(
          `Imported ${totalSessions} Gastro Endoscopy (ENDO & Gas/Colon) lists into Week(s) ${weeksLoaded.join(', ')} from "${file.name}". All non-gastro hospital theatres filtered out.`
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

  return (
    <section className="space-y-6">
      {/* Header & Cycle Info */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
              4-Week Repeating Cycle
            </span>
            <span className="text-xs text-slate-500">
              Anchor: Mon 02/11/2026 = Week 3
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Gastroenterology Theatre & Endoscopy Master Grid
          </h2>
          <p className="text-xs text-slate-500">
            Filters hospital-wide Theatre Grid down to <span className="font-semibold text-slate-700">ENDO (Rooms 1–3)</span> and <span className="font-semibold text-slate-700">Gas/Colon (Theatre 1 & 4)</span>. Used to detect leave clashes automatically.
          </p>
        </div>

        {/* Uploader Box */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <select
            value={targetUploadWeek}
            onChange={(e) => setTargetUploadWeek(e.target.value)}
            className="border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white font-medium"
          >
            <option value="auto">Auto-detect Week from CSV/XLSX</option>
            <option value="1">Import into Week 1</option>
            <option value="2">Import into Week 2</option>
            <option value="3">Import into Week 3</option>
            <option value="4">Import into Week 4</option>
          </select>

          <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? 'Parsing Grid...' : 'Upload Hospital Theatre Grid'}
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
              setStatusBanner('Reset Weeks 1–4 to default Week 3 (2 Nov 2026) baseline.');
            }}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-100 flex items-center gap-1"
            title="Reset all 4 weeks to default Week 3 template"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
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

      {/* Week 1 - 4 Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(w => {
            const tmpl = theatreTemplates?.[w];
            const isSelected = selectedWeek === w;
            const isCurrentCycle = currentWeekCycle === w;
            return (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>Cycle Week {w}</span>
                {isCurrentCycle && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-amber-400 text-slate-900' : 'bg-blue-100 text-blue-800'
                  }`}>
                    Selected Week
                  </span>
                )}
                {tmpl?.isDefaultFromWeek3 && (
                  <span className={`text-[10px] font-normal px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-blue-800 text-blue-200' : 'bg-slate-100 text-slate-500'
                  }`}>
                    W3 Baseline
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-500">
          Source: <span className="font-semibold text-slate-700">{activeTemplate.sourceFile || 'Theatre Grid 2026'}</span>
          {' • '}
          <span className="font-semibold text-indigo-700">{(activeTemplate.sessions || []).length} Gastro lists</span> in Week {selectedWeek}
        </div>
      </div>

      {/* Master Grid Table (Monday - Friday, AM / PM) */}
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
                        <div className="text-[10px] font-normal text-slate-500 mt-0.5">Week {selectedWeek}</div>
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
    </section>
  );
}
