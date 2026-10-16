import React, { useState, useMemo } from 'react';
import {
  Calendar, Search, Upload, Plus, Trash2, Edit3, Check, X,
  AlertTriangle, UserX, Clock, Download
} from 'lucide-react';
import { formatDDMMYYYY } from './App';
import { parseLeaveFile } from './rosterParser';
import { generateLeavePdf } from './pdfGenerator';

export function toISODateString(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (s.toUpperCase() === 'TBC') return 'TBC';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return s;
}

export function getEffectiveEndDate(leave) {
  const start = toISODateString(leave.start_date);
  const end = toISODateString(leave.end_date);
  if (!start) return '';
  if (!end || end === 'TBC') {
    const d = new Date(`${start}T00:00:00`);
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
  return end;
}

export function doesLeaveOverlapRange(leave, rangeStart, rangeEnd) {
  const start = toISODateString(leave.start_date);
  const end = getEffectiveEndDate(leave);
  if (!start || !end) return false;
  return start <= rangeEnd && end >= rangeStart;
}

export function cleanDocName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/^(assoc\.?\s+prof\.?|prof\.?|dr\.?|mr\.?|ms\.?)\s+/i, '')
    .trim();
}

export function getDoctorLeavesForRange(staffName, leaveList, rangeStart, rangeEnd) {
  if (!staffName || !leaveList?.length) return [];
  const target = cleanDocName(staffName);
  if (!target) return [];
  return leaveList.filter(lv => {
    const lvName = cleanDocName(lv.staff_name);
    const nameMatch = lvName && (lvName === target || lvName.includes(target) || target.includes(lvName));
    if (!nameMatch) return false;
    return doesLeaveOverlapRange(lv, rangeStart, rangeEnd);
  });
}

function getBadgeStyle(type = '') {
  const t = type.toLowerCase();
  if (t.includes('sabbatical')) return 'bg-purple-100 text-purple-800 border-purple-200';
  if (t.includes('parental')) return 'bg-pink-100 text-pink-800 border-pink-200';
  if (t.includes('long service') || t.includes('lsl')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (t.includes('pm') || t.includes('fgc')) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-sky-100 text-sky-800 border-sky-200';
}

function getBarColor(type = '') {
  const t = type.toLowerCase();
  if (t.includes('sabbatical')) return 'bg-purple-600';
  if (t.includes('parental')) return 'bg-pink-600';
  if (t.includes('long service') || t.includes('lsl')) return 'bg-indigo-600';
  if (t.includes('pm') || t.includes('fgc')) return 'bg-amber-500';
  return 'bg-blue-600';
}

export default function LeaveCalendar({
  leaveApplications,
  staffList,
  weekMonday,
  onShiftWeek,
  onSetWeekMonday,
  onAddLeave,
  onUpdateLeave,
  onDeleteLeave,
  onBulkImportLeave
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all'); // all | active_week | dec_jan | long_term
  const [timelineRange, setTimelineRange] = useState('dec_jan'); // dec_jan | full_year

  // Editing row state
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  // Quick Add modal / drawer
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({
    staff_name: staffList[0]?.name || '',
    leave_type: 'Annual Leave',
    start_date: '2026-12-24',
    end_date: '2027-01-08',
    costing: '',
    allowances: ''
  });

  // CSV Upload state
  const [importMode, setImportMode] = useState('replace'); // replace | merge
  const [uploadStatus, setUploadStatus] = useState('');

  // Compute week Sunday
  const weekSunday = useMemo(() => {
    const d = new Date(`${weekMonday}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }, [weekMonday]);

  // Compute Melbourne today YYYY-MM-DD
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }, []);

  // Consultants on leave Today vs Selected Week
  const awayToday = useMemo(
    () => leaveApplications.filter(l => doesLeaveOverlapRange(l, todayStr, todayStr)),
    [leaveApplications, todayStr]
  );

  const awaySelectedWeek = useMemo(
    () => leaveApplications.filter(l => doesLeaveOverlapRange(l, weekMonday, weekSunday)),
    [leaveApplications, weekMonday, weekSunday]
  );

  // Filtered table rows
  const filteredLeaves = useMemo(() => {
    return [...leaveApplications]
      .filter(l => {
        if (searchQuery && !l.staff_name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        if (typeFilter !== 'all') {
          const t = (l.leave_type || '').toLowerCase();
          if (!t.includes(typeFilter.toLowerCase())) return false;
        }
        if (periodFilter === 'active_week') {
          return doesLeaveOverlapRange(l, weekMonday, weekSunday);
        }
        if (periodFilter === 'dec_jan') {
          return doesLeaveOverlapRange(l, '2026-12-01', '2027-01-31');
        }
        if (periodFilter === 'long_term') {
          const t = (l.leave_type || '').toLowerCase();
          return t.includes('sabbatical') || t.includes('parental') || l.end_date === 'TBC';
        }
        return true;
      })
      .sort((a, b) => {
        const sa = toISODateString(a.start_date);
        const sb = toISODateString(b.start_date);
        return sa.localeCompare(sb) || a.staff_name.localeCompare(b.staff_name);
      });
  }, [leaveApplications, searchQuery, typeFilter, periodFilter, weekMonday, weekSunday]);

  // Timeline window bounds
  const timelineBounds = useMemo(() => {
    if (timelineRange === 'dec_jan') {
      return {
        start: '2026-12-01',
        end: '2027-02-05',
        label: 'Dec 2026 – Early Feb 2027 (Summer / Holiday Leave)',
        ticks: [
          { date: '2026-12-01', label: '1 Dec' },
          { date: '2026-12-07', label: '7 Dec' },
          { date: '2026-12-14', label: '14 Dec' },
          { date: '2026-12-21', label: '21 Dec' },
          { date: '2026-12-25', label: '25 Dec' },
          { date: '2027-01-01', label: '1 Jan' },
          { date: '2027-01-08', label: '8 Jan' },
          { date: '2027-01-15', label: '15 Jan' },
          { date: '2027-01-22', label: '22 Jan' },
          { date: '2027-02-01', label: '1 Feb' }
        ]
      };
    }
    return {
      start: '2026-07-01',
      end: '2027-08-31',
      label: 'Jul 2026 – Aug 2027 (Full 14-Month Overview)',
      ticks: [
        { date: '2026-07-01', label: 'Jul 26' },
        { date: '2026-08-01', label: 'Aug 26' },
        { date: '2026-09-01', label: 'Sep 26' },
        { date: '2026-10-01', label: 'Oct 26' },
        { date: '2026-11-01', label: 'Nov 26' },
        { date: '2026-12-01', label: 'Dec 26' },
        { date: '2027-01-01', label: 'Jan 27' },
        { date: '2027-02-01', label: 'Feb 27' },
        { date: '2027-03-01', label: 'Mar 27' },
        { date: '2027-04-01', label: 'Apr 27' },
        { date: '2027-05-01', label: 'May 27' },
        { date: '2027-06-01', label: 'Jun 27' },
        { date: '2027-07-01', label: 'Jul 27' },
        { date: '2027-08-01', label: 'Aug 27' }
      ]
    };
  }, [timelineRange]);

  // Group leaves by staff member for timeline rows
  const timelineRows = useMemo(() => {
    const overlapping = leaveApplications.filter(l =>
      doesLeaveOverlapRange(l, timelineBounds.start, timelineBounds.end)
    );
    const byStaff = new Map();
    for (const l of overlapping) {
      if (searchQuery && !l.staff_name.toLowerCase().includes(searchQuery.toLowerCase())) continue;
      if (!byStaff.has(l.staff_name)) byStaff.set(l.staff_name, []);
      byStaff.get(l.staff_name).push(l);
    }
    return Array.from(byStaff.entries()).map(([staff_name, items]) => ({
      staff_name,
      items
    }));
  }, [leaveApplications, timelineBounds, searchQuery]);

  const getPositionPct = (dateStr) => {
    const minMs = new Date(`${timelineBounds.start}T00:00:00`).getTime();
    const maxMs = new Date(`${timelineBounds.end}T23:59:59`).getTime();
    const curMs = new Date(`${dateStr}T00:00:00`).getTime();
    const pct = ((curMs - minMs) / (maxMs - minMs)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const handleStartEdit = (lv) => {
    setEditingId(lv.id);
    setEditDraft({
      staff_name: lv.staff_name,
      leave_type: lv.leave_type,
      start_date: lv.start_date,
      end_date: lv.end_date,
      costing: lv.costing || '',
      allowances: lv.allowances || ''
    });
  };

  const handleSaveEdit = async (id) => {
    await onUpdateLeave(id, editDraft);
    setEditingId(null);
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseLeaveFile(file, staffList);
      if (!parsed.length) {
        alert('No valid leave entries found in the uploaded file.');
        return;
      }
      await onBulkImportLeave(parsed, importMode);
      setUploadStatus(
        `${importMode === 'replace' ? 'Replaced all leave with' : 'Merged'} ${parsed.length} entries from ${file.name}`
      );
      setTimeout(() => setUploadStatus(''), 5000);
    } catch (err) {
      console.error(err);
      alert('Failed to parse leave file: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleCreateSingle = async (e) => {
    e.preventDefault();
    if (!newEntry.staff_name || !newEntry.start_date) return;
    await onAddLeave({
      ...newEntry,
      end_date: newEntry.end_date || newEntry.start_date,
      status: 'approved'
    });
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Who is Away Today & Selected Week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Away Selected Week */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Weekly Leave Check
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Who's Away: Week of {formatDDMMYYYY(weekMonday)} – {formatDDMMYYYY(weekSunday)}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onShiftWeek(-7)}
                className="px-2.5 py-1 border rounded text-xs font-medium hover:bg-slate-50"
              >
                ← Prev
              </button>
              <button
                onClick={() => onSetWeekMonday('2026-12-21')}
                className="px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-800 rounded text-xs font-semibold hover:bg-amber-100"
                title="Jump to Christmas / Dec 2026 Week"
              >
                Dec 21 (Xmas)
              </button>
              <button
                onClick={() => onShiftWeek(7)}
                className="px-2.5 py-1 border rounded text-xs font-medium hover:bg-slate-50"
              >
                Next →
              </button>
            </div>
          </div>

          {awaySelectedWeek.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No consultants recorded on leave for this week.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {awaySelectedWeek.map(lv => (
                <div
                  key={lv.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-slate-50 text-xs"
                >
                  <UserX className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900">{lv.staff_name}</span>
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded border font-semibold ${getBadgeStyle(lv.leave_type)}`}>
                      {lv.leave_type}
                    </span>
                    <div className="text-[11px] text-slate-500">
                      {formatDDMMYYYY(lv.start_date)} → {lv.end_date === 'TBC' ? 'TBC' : formatDDMMYYYY(lv.end_date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 2: Away Today + Quick Actions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Live Status ({formatDDMMYYYY(todayStr)})
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Currently On Leave Today ({awayToday.length})
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Leave
              </button>
              <label className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Upload CSV
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleCsvUpload}
                  className="hidden"
                />
              </label>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
                className="text-[11px] border rounded px-2 py-1.5 bg-slate-50 text-slate-700"
                title="CSV Upload Mode"
              >
                <option value="replace">CSV: Replace All</option>
                <option value="merge">CSV: Merge / Add</option>
              </select>
            </div>
          </div>

          {uploadStatus && (
            <div className="p-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded text-xs font-medium">
              ✓ {uploadStatus}
            </div>
          )}

          {awayToday.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No consultants on leave today.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {awayToday.map(lv => (
                <div
                  key={lv.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50/50 text-xs"
                >
                  <Clock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900">{lv.staff_name}</span>
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded border font-semibold ${getBadgeStyle(lv.leave_type)}`}>
                      {lv.leave_type}
                    </span>
                    <div className="text-[11px] text-slate-500">
                      Until {lv.end_date === 'TBC' ? 'TBC' : formatDDMMYYYY(lv.end_date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visual Gantt Timeline */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Visual Leave Timeline</h3>
            <p className="text-xs text-slate-500">{timelineBounds.label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTimelineRange('dec_jan')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                timelineRange === 'dec_jan'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Dec 2026 – Jan 2027 Holiday Focus
            </button>
            <button
              onClick={() => setTimelineRange('full_year')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                timelineRange === 'full_year'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Full 2026 – 2027 Overview
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600 inline-block"></span> Annual Leave</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-600 inline-block"></span> Sabbatical</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-pink-600 inline-block"></span> Parental Leave</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-600 inline-block"></span> Long Service Leave</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500 inline-block"></span> PM (FGC) Only</span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Timeline Date Header */}
            <div className="flex border-b border-slate-200 pb-2 text-[11px] font-semibold text-slate-500">
              <div className="w-52 shrink-0 pr-2">Consultant</div>
              <div className="flex-1 relative h-5">
                {timelineBounds.ticks.map(t => (
                  <div
                    key={t.date}
                    style={{ left: `${getPositionPct(t.date)}%` }}
                    className="absolute -translate-x-1/2 whitespace-nowrap"
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-100">
              {timelineRows.map(row => (
                <div key={row.staff_name} className="flex items-center py-2 hover:bg-slate-50/80">
                  <div className="w-52 shrink-0 pr-3 text-xs font-semibold text-slate-800 truncate" title={row.staff_name}>
                    {row.staff_name}
                  </div>
                  <div className="flex-1 relative h-7 bg-slate-50 rounded border border-slate-100 overflow-hidden">
                    {/* Vertical grid ticks */}
                    {timelineBounds.ticks.map(t => (
                      <div
                        key={t.date}
                        style={{ left: `${getPositionPct(t.date)}%` }}
                        className="absolute top-0 bottom-0 border-l border-dashed border-slate-200"
                      />
                    ))}

                    {/* Leave bars */}
                    {row.items.map(item => {
                      const effStart = toISODateString(item.start_date) < timelineBounds.start
                        ? timelineBounds.start
                        : toISODateString(item.start_date);
                      const rawEffEnd = getEffectiveEndDate(item);
                      const effEnd = rawEffEnd > timelineBounds.end ? timelineBounds.end : rawEffEnd;
                      const leftPct = getPositionPct(effStart);
                      const rightPct = getPositionPct(effEnd);
                      const widthPct = Math.max(1.8, rightPct - leftPct);

                      return (
                        <div
                          key={item.id}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          className={`absolute top-1 bottom-1 rounded px-1.5 flex items-center text-[10px] font-medium text-white shadow-xs truncate ${getBarColor(item.leave_type)}`}
                          title={`${item.staff_name}: ${item.leave_type} (${formatDDMMYYYY(item.start_date)} to ${item.end_date === 'TBC' ? 'TBC' : formatDDMMYYYY(item.end_date)})`}
                        >
                          {formatDDMMYYYY(item.start_date).slice(0, 5)}
                          {item.end_date !== item.start_date
                            ? `–${item.end_date === 'TBC' ? 'TBC' : formatDDMMYYYY(item.end_date).slice(0, 5)}`
                            : ''}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filterable & Editable Table */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search consultant..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border rounded-lg text-xs w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="border px-3 py-1.5 rounded-lg text-xs bg-white"
            >
              <option value="all">All Leave Periods ({leaveApplications.length})</option>
              <option value="active_week">Away Selected Week ({awaySelectedWeek.length})</option>
              <option value="dec_jan">Dec 2026 – Jan 2027 Summer</option>
              <option value="long_term">Long-Term / Sabbatical / Parental</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border px-3 py-1.5 rounded-lg text-xs bg-white"
            >
              <option value="all">All Leave Types</option>
              <option value="annual">Annual Leave</option>
              <option value="sabbatical">Sabbatical</option>
              <option value="parental">Parental Leave</option>
              <option value="long service">Long Service Leave</option>
              <option value="pm">PM (FGC) Only</option>
            </select>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredLeaves.length} of {leaveApplications.length} leave records
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b">
              <tr>
                <th className="p-2.5">Consultant</th>
                <th className="p-2.5">Start Date</th>
                <th className="p-2.5">End Date</th>
                <th className="p-2.5">Leave Type</th>
                <th className="p-2.5">Site (Endoscopy)</th>
                <th className="p-2.5">Cover (Endoscopy)</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeaves.map(lv => {
                const isEditing = editingId === lv.id;
                const isAwayNow = doesLeaveOverlapRange(lv, todayStr, todayStr);

                if (isEditing) {
                  return (
                    <tr key={lv.id} className="bg-blue-50/50">
                      <td className="p-2">
                        <input
                          type="text"
                          value={editDraft.staff_name}
                          onChange={(e) => setEditDraft({ ...editDraft, staff_name: e.target.value })}
                          className="border rounded px-2 py-1 w-full bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          value={editDraft.start_date}
                          onChange={(e) => setEditDraft({ ...editDraft, start_date: e.target.value })}
                          className="border rounded px-2 py-1 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={editDraft.end_date}
                          onChange={(e) => setEditDraft({ ...editDraft, end_date: e.target.value })}
                          placeholder="YYYY-MM-DD or TBC"
                          className="border rounded px-2 py-1 w-28 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={editDraft.leave_type}
                          onChange={(e) => setEditDraft({ ...editDraft, leave_type: e.target.value })}
                          className="border rounded px-2 py-1 w-36 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={editDraft.costing}
                          onChange={(e) => setEditDraft({ ...editDraft, costing: e.target.value })}
                          className="border rounded px-2 py-1 w-24 bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={editDraft.allowances}
                          onChange={(e) => setEditDraft({ ...editDraft, allowances: e.target.value })}
                          className="border rounded px-2 py-1 w-24 bg-white"
                        />
                      </td>
                      <td className="p-2 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => handleSaveEdit(lv.id)}
                          className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={lv.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-900">
                      {lv.staff_name}
                      {isAwayNow && (
                        <span className="ml-2 text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold">
                          AWAY NOW
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 font-medium text-slate-700">{formatDDMMYYYY(lv.start_date)}</td>
                    <td className="p-2.5 font-medium text-slate-700">
                      {lv.end_date === 'TBC' ? (
                        <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold text-[10px]">
                          TBC
                        </span>
                      ) : (
                        formatDDMMYYYY(lv.end_date)
                      )}
                    </td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${getBadgeStyle(lv.leave_type)}`}>
                        {lv.leave_type}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-500">{lv.costing || '—'}</td>
                    <td className="p-2.5 text-slate-500">{lv.allowances || '—'}</td>
                    <td className="p-2.5 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => generateLeavePdf(lv)}
                        className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5"
                        title="Download Leave PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleStartEdit(lv)}
                        className="text-slate-600 hover:text-slate-900 inline-flex items-center"
                        title="Edit row"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteLeave(lv.id)}
                        className="text-rose-600 hover:text-rose-800 inline-flex items-center"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Single Leave Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-base">Add Consultant Leave</h3>
            <form onSubmit={handleCreateSingle} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Staff Member</label>
                <input
                  type="text"
                  list="consultant-names"
                  value={newEntry.staff_name}
                  onChange={(e) => setNewEntry({ ...newEntry, staff_name: e.target.value })}
                  className="w-full border p-2 rounded"
                  required
                />
                <datalist id="consultant-names">
                  {staffList.map(s => (
                    <option key={s.id || s.name} value={s.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="font-semibold block mb-1">Leave Type</label>
                <select
                  value={newEntry.leave_type}
                  onChange={(e) => setNewEntry({ ...newEntry, leave_type: e.target.value })}
                  className="w-full border p-2 rounded bg-white"
                >
                  <option>Annual Leave</option>
                  <option>Sabbatical</option>
                  <option>Parental Leave</option>
                  <option>Long Service Leave</option>
                  <option>Conference / Study Leave</option>
                  <option>PM (FGC) Only</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newEntry.start_date}
                    onChange={(e) => setNewEntry({ ...newEntry, start_date: e.target.value })}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">End Date (or TBC)</label>
                  <input
                    type="text"
                    value={newEntry.end_date}
                    onChange={(e) => setNewEntry({ ...newEntry, end_date: e.target.value })}
                    placeholder="YYYY-MM-DD or TBC"
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Site (Endoscopy)</label>
                  <input
                    type="text"
                    value={newEntry.costing}
                    onChange={(e) => setNewEntry({ ...newEntry, costing: e.target.value })}
                    className="w-full border p-2 rounded"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Cover (Endoscopy)</label>
                  <input
                    type="text"
                    value={newEntry.allowances}
                    onChange={(e) => setNewEntry({ ...newEntry, allowances: e.target.value })}
                    className="w-full border p-2 rounded"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 border rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
                >
                  Save Leave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
