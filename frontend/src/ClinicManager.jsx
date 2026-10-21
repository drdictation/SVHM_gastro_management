import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, AlertTriangle, CheckCircle2, UserCheck, ShieldAlert, 
  Stethoscope, Clock, Filter, Search, ChevronLeft, ChevronRight,
  UserX, RefreshCw, Layers, Award, Sparkles, Building2, Check, ExternalLink
} from 'lucide-react';
import { api } from './api';
import { findLeaveClashes, createDefaultTheatreTemplates } from './theatreGrid';

const CLINIC_NAMES = [
  'ALL',
  'GASTRO',
  'OES',
  'RAE MONDAY',
  'RAE TUESDAY',
  'RAE FRIDAY',
  'WEIGHT MANAGEMENT',
  'LIVER',
  'IBD',
  'PO LIVER',
  'HEPATOMA'
];

function cleanDoctorName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/^(assoc\.?\s*prof\.?|prof\.?|dr\.?|mr\.?|ms\.?)\s*/i, '')
    .replace(/[.]/g, '')
    .trim();
}

function matchesDoctor(nameA, nameB) {
  const a = cleanDoctorName(nameA);
  const b = cleanDoctorName(nameB);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function getDoctorLeaveForDate(staffName, dateStr, leavesList) {
  if (!staffName || !dateStr || !leavesList?.length) return null;
  const target = cleanDoctorName(staffName);
  if (!target) return null;

  for (const lv of leavesList) {
    if (!matchesDoctor(lv.staff_name, staffName)) continue;
    const start = lv.start_date;
    let end = lv.end_date || start;
    if (end === 'TBC' || !end) end = '2099-12-31';

    if (start <= dateStr && dateStr <= end) {
      return lv;
    }
  }
  return null;
}

export default function ClinicManager({ 
  staffList = [], 
  currentUser = null,
  leaveApplications = [],
  theatreTemplates = null,
  rosterEntries = [],
  endoOverrides = {},
  weekMonday = ''
}) {
  const [activeSubTab, setActiveSubTab] = useState('coordinator'); // 'coordinator' | 'grid' | 'leaves'
  const [coordinatorData, setCoordinatorData] = useState(null);
  const [clinicEntries, setClinicEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters for Clinic Grid
  const [selectedClinic, setSelectedClinic] = useState('ALL');
  const [selectedDoctor, setSelectedDoctor] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // 'ALL' | 'uncovered' | 'covered' | 'attending' | 'off_routine'
  const [searchDate, setSearchDate] = useState('2026-12'); // YYYY-MM
  const [coordinatorSearch, setCoordinatorSearch] = useState('');

  // Cover assignment modal state
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [activeCoverItem, setActiveCoverItem] = useState(null); // { type: 'clinic' | 'theatre', item: ... }
  const [selectedCoverDoctor, setSelectedCoverDoctor] = useState('');
  const [coverNotes, setCoverNotes] = useState('');
  const [savingCover, setSavingCover] = useState(false);

  // Fetch base data
  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [coordRes, clinicRes] = await Promise.all([
        api.getLeaveCoverageCoordinator(),
        api.getClinicRoster({
          start_date: `${searchDate}-01`,
          end_date: `${searchDate}-31`,
          clinic_name: selectedClinic !== 'ALL' ? selectedClinic : undefined,
          staff_name: selectedDoctor !== 'ALL' ? selectedDoctor : undefined
        })
      ]);
      setCoordinatorData(coordRes);
      setClinicEntries(clinicRes || []);
    } catch (err) {
      console.error('Error fetching clinic and coordinator data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchDate, selectedClinic, selectedDoctor]);

  // UNIFY LEAVES: Combine leaveApplications from "Leave and endo clashes" with coordinatorData leaves
  const allUnifiedLeaves = useMemo(() => {
    const list = [...(leaveApplications || [])];
    const seen = new Set();
    list.forEach(l => seen.add(`${cleanDoctorName(l.staff_name)}_${l.start_date}_${l.end_date}`));

    if (coordinatorData?.leaves) {
      for (const l of coordinatorData.leaves) {
        const key = `${cleanDoctorName(l.staff_name)}_${l.start_date}_${l.end_date}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(l);
        }
      }
    }
    return list;
  }, [leaveApplications, coordinatorData]);

  // UNIFIED CLINIC SLOTS: Cross-reference every clinic slot with all active leaves
  const synthesizedClinicSlots = useMemo(() => {
    // Start with all slots known to be on leave from backend coordinator
    const baseSlots = coordinatorData?.clinic_slots ? [...coordinatorData.clinic_slots] : [];
    const baseMap = new Map();
    baseSlots.forEach(s => baseMap.set(s.id, s));

    // Also scan all clinic entries in current loaded window or seed to catch scheduled doctors on leave
    for (const entry of clinicEntries) {
      const activeLeave = getDoctorLeaveForDate(entry.staff_name, entry.date, allUnifiedLeaves);
      if (activeLeave && entry.status !== 'off_routine' && entry.status !== 'holiday' && entry.status !== 'closed') {
        if (!baseMap.has(entry.id)) {
          const synthesized = {
            ...entry,
            status: 'on_leave',
            leave_type: activeLeave.leave_type || 'Leave',
            coverage_status: entry.covering_staff_name ? 'covered' : 'uncovered'
          };
          baseSlots.push(synthesized);
          baseMap.set(entry.id, synthesized);
        } else {
          // Update leave type if missing
          const existing = baseMap.get(entry.id);
          if (!existing.leave_type) {
            existing.leave_type = activeLeave.leave_type || 'Leave';
          }
        }
      }
    }

    return baseSlots.sort((a, b) => a.date.localeCompare(b.date));
  }, [coordinatorData, clinicEntries, allUnifiedLeaves]);

  // UNIFIED THEATRE CONFLICTS: Live computation using exact same findLeaveClashes engine as Leave & Endo Clashes
  const synthesizedTheatreConflicts = useMemo(() => {
    const templates = theatreTemplates || createDefaultTheatreTemplates();
    const allClashes = [];
    const seen = new Set();

    for (const lv of allUnifiedLeaves) {
      const res = findLeaveClashes(
        lv.staff_name,
        lv.start_date,
        lv.end_date,
        templates,
        rosterEntries,
        endoOverrides
      );
      if (res?.endoClashes?.length) {
        for (const ec of res.endoClashes) {
          const key = `${ec.date}_${ec.room}_${ec.session}_${ec.doctor}`;
          if (!seen.has(key)) {
            seen.add(key);
            allClashes.push({
              id: `endo_${ec.date}_${ec.room}_${ec.session}_${ec.doctor}`.replace(/\s+/g, '_'),
              date: ec.date,
              day_of_week: ec.day,
              session: ec.session,
              room_name: ec.room,
              list_type: ec.listType || 'ENDO',
              staff_name: ec.doctor,
              leave_type: lv.leave_type || 'Approved Leave',
              coverage_status: ec.cover_staff_name ? 'covered' : 'uncovered',
              covering_staff_name: ec.cover_staff_name || null,
              notes: `${ec.startTime || ''} - ${ec.site || ''}`.trim()
            });
          }
        }
      }
    }

    // Fallback if theatreTemplates not ready
    if (!allClashes.length && coordinatorData?.theatre_conflicts?.length) {
      for (const t of coordinatorData.theatre_conflicts) {
        const lv = getDoctorLeaveForDate(t.staff_name, t.date, allUnifiedLeaves);
        allClashes.push({
          ...t,
          leave_type: t.leave_type || lv?.leave_type || 'Approved Leave'
        });
      }
    }

    return allClashes.sort((a, b) => a.date.localeCompare(b.date));
  }, [allUnifiedLeaves, theatreTemplates, rosterEntries, endoOverrides, coordinatorData]);

  // UNIFIED GICC CONFLICTS: Cross-reference GICC entries with all leaves
  const synthesizedGiccConflicts = useMemo(() => {
    const conflicts = [];
    const seen = new Set();

    // Check roster entries for GICC commitments
    for (const r of rosterEntries) {
      if (r.entry_type === 'gicc') {
        const lv = getDoctorLeaveForDate(r.staff_name, r.date, allUnifiedLeaves);
        if (lv) {
          const key = `gicc_${r.id}_${r.date}_${r.staff_name}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              ...r,
              leave_type: lv.leave_type || 'Leave'
            });
          }
        }
      }
    }

    if (coordinatorData?.gicc_conflicts) {
      for (const g of coordinatorData.gicc_conflicts) {
        const key = `gicc_${g.id}_${g.date}_${g.staff_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push(g);
        }
      }
    }
    return conflicts.sort((a, b) => a.date.localeCompare(b.date));
  }, [rosterEntries, coordinatorData, allUnifiedLeaves]);

  // UNIFIED FRIDAY JOURNAL CLUB CONFLICTS: Cross-reference JC entries with all leaves
  const synthesizedJcConflicts = useMemo(() => {
    const conflicts = [];
    const seen = new Set();

    for (const r of rosterEntries) {
      if (r.entry_type === 'friday_jc') {
        const lv = getDoctorLeaveForDate(r.staff_name, r.date, allUnifiedLeaves);
        if (lv) {
          const key = `jc_${r.id}_${r.date}_${r.staff_name}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({
              ...r,
              leave_type: lv.leave_type || 'Leave'
            });
          }
        }
      }
    }

    if (coordinatorData?.jc_conflicts) {
      for (const j of coordinatorData.jc_conflicts) {
        const key = `jc_${j.id}_${j.date}_${j.staff_name}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push(j);
        }
      }
    }
    return conflicts.sort((a, b) => a.date.localeCompare(b.date));
  }, [rosterEntries, coordinatorData, allUnifiedLeaves]);

  // SUMMARY COUNTS
  const summary = useMemo(() => {
    const uncoveredClinics = synthesizedClinicSlots.filter(s => s.coverage_status === 'uncovered').length;
    const coveredClinics = synthesizedClinicSlots.filter(s => s.coverage_status === 'covered').length;
    const uncoveredTheatre = synthesizedTheatreConflicts.filter(t => t.coverage_status !== 'covered').length;

    return {
      uncovered_clinics: uncoveredClinics,
      covered_clinics: coveredClinics,
      theatre_conflicts: synthesizedTheatreConflicts.length,
      uncovered_theatre: uncoveredTheatre,
      gicc_conflicts: synthesizedGiccConflicts.length,
      jc_conflicts: synthesizedJcConflicts.length,
      ward_oncall_conflicts: coordinatorData?.summary?.ward_oncall_conflicts || 0,
      approved_leaves_count: allUnifiedLeaves.length
    };
  }, [synthesizedClinicSlots, synthesizedTheatreConflicts, synthesizedGiccConflicts, synthesizedJcConflicts, coordinatorData, allUnifiedLeaves]);

  // Filtered lists for coordinator view search
  const filteredClinicSlots = useMemo(() => {
    return synthesizedClinicSlots.filter(s => {
      const q = coordinatorSearch.toLowerCase();
      if (!q) return true;
      return (
        s.staff_name?.toLowerCase().includes(q) ||
        s.clinic_name?.toLowerCase().includes(q) ||
        s.date?.includes(q) ||
        s.leave_type?.toLowerCase().includes(q) ||
        s.covering_staff_name?.toLowerCase().includes(q)
      );
    });
  }, [synthesizedClinicSlots, coordinatorSearch]);

  const filteredTheatreConflicts = useMemo(() => {
    return synthesizedTheatreConflicts.filter(t => {
      const q = coordinatorSearch.toLowerCase();
      if (!q) return true;
      return (
        t.staff_name?.toLowerCase().includes(q) ||
        t.room_name?.toLowerCase().includes(q) ||
        t.date?.includes(q) ||
        t.leave_type?.toLowerCase().includes(q) ||
        t.covering_staff_name?.toLowerCase().includes(q)
      );
    });
  }, [synthesizedTheatreConflicts, coordinatorSearch]);

  // Filtered clinic entries for grid view
  const filteredGridEntries = useMemo(() => {
    return clinicEntries.map(entry => {
      const activeLeave = getDoctorLeaveForDate(entry.staff_name, entry.date, allUnifiedLeaves);
      if (activeLeave && entry.status !== 'off_routine' && entry.status !== 'holiday' && entry.status !== 'closed') {
        return {
          ...entry,
          status: 'on_leave',
          leave_type: entry.leave_type || activeLeave.leave_type || 'Leave',
          coverage_status: entry.covering_staff_name ? 'covered' : 'uncovered'
        };
      }
      return entry;
    }).filter(e => {
      if (selectedStatus === 'uncovered' && e.coverage_status !== 'uncovered') return false;
      if (selectedStatus === 'covered' && e.coverage_status !== 'covered') return false;
      if (selectedStatus === 'attending' && e.status !== 'attending') return false;
      if (selectedStatus === 'off_routine' && e.status !== 'off_routine') return false;
      return true;
    });
  }, [clinicEntries, selectedStatus, allUnifiedLeaves]);

  const handleOpenCoverModal = (type, item) => {
    setActiveCoverItem({ type, item });
    setSelectedCoverDoctor(item.covering_staff_name || '');
    setCoverNotes(item.notes || '');
    setCoverModalOpen(true);
  };

  const handleSaveCover = async () => {
    if (!activeCoverItem) return;
    setSavingCover(true);
    try {
      const { type, item } = activeCoverItem;
      if (type === 'clinic') {
        await api.updateClinicCoverage(item.id, selectedCoverDoctor, coverNotes);
      } else if (type === 'theatre') {
        const overrideKey = `${item.date}_${item.room_name}_${item.session}_${item.staff_name}`;
        await api.saveEndoOverride(overrideKey, {
          cover_staff_name: selectedCoverDoctor || null,
          status: selectedCoverDoctor ? 'covered' : 'scheduled'
        });
        await api.updateTheatreCoverage(item.id, selectedCoverDoctor, coverNotes);
      }
      setCoverModalOpen(false);
      setActiveCoverItem(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to save cover:', err);
      alert('Failed to save coverage assignment.');
    } finally {
      setSavingCover(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                <Building2 className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">Clinic Roster & Leave Coordinator</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Synchronized with <span className="font-semibold text-slate-700">Leave and endo clashes</span> register to flag all missed clinics, endoscopy sessions, GICC commitments, and Journal Club presentations
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Synced with Leave Register ({allUnifiedLeaves.length} active leaves)
            </span>
            <button
              onClick={fetchData}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Coordinator Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-amber-700">
              <span className="text-xs font-semibold uppercase tracking-wider">Uncovered Clinics</span>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-900">{summary.uncovered_clinics}</span>
              <span className="text-xs text-amber-700">slots</span>
            </div>
            <span className="text-[11px] text-amber-600 mt-0.5 block">{summary.covered_clinics} covered</span>
          </div>

          <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-rose-700">
              <span className="text-xs font-semibold uppercase tracking-wider">Endoscopy Lists</span>
              <Stethoscope className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-900">{summary.uncovered_theatre}</span>
              <span className="text-xs text-rose-700">sessions</span>
            </div>
            <span className="text-[11px] text-rose-600 mt-0.5 block">{summary.theatre_conflicts} during leave</span>
          </div>

          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-blue-700">
              <span className="text-xs font-semibold uppercase tracking-wider">GICC Grand Rounds</span>
              <Award className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-900">{summary.gicc_conflicts}</span>
              <span className="text-xs text-blue-700">commitments</span>
            </div>
            <span className="text-[11px] text-blue-600 mt-0.5 block">Chair / Speaker conflicts</span>
          </div>

          <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between text-purple-700">
              <span className="text-xs font-semibold uppercase tracking-wider">Friday Journal Club</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-purple-900">{summary.jc_conflicts}</span>
              <span className="text-xs text-purple-700">presenters</span>
            </div>
            <span className="text-[11px] text-purple-600 mt-0.5 block">Leave conflict flag</span>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-emerald-700">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved Leaves</span>
              <UserX className="w-4 h-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-900">{summary.approved_leaves_count}</span>
              <span className="text-xs text-emerald-700">records</span>
            </div>
            <span className="text-[11px] text-emerald-600 mt-0.5 block">Cross-department sync</span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 mt-6 -mb-6">
          <button
            onClick={() => setActiveSubTab('coordinator')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition ${
              activeSubTab === 'coordinator'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Master Leave & Coverage Coordinator
            {(summary.uncovered_clinics + summary.uncovered_theatre) > 0 && (
              <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full font-bold">
                {summary.uncovered_clinics + summary.uncovered_theatre}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('grid')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition ${
              activeSubTab === 'grid'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            Full Clinic Schedule Grid
          </button>

          <button
            onClick={() => setActiveSubTab('leaves')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition ${
              activeSubTab === 'leaves'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Staff Leave Register ({allUnifiedLeaves.length})
          </button>
        </div>
      </div>

      {/* Subtab 1: Coordinator Conflicts Dashboard */}
      {activeSubTab === 'coordinator' && (
        <div className="space-y-6">
          {/* Search bar inside coordinator */}
          <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by doctor, clinic, leave type, date..."
                value={coordinatorSearch}
                onChange={e => setCoordinatorSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="text-xs text-slate-500">
              Showing active coverage requirements across all department commitments
            </div>
          </div>

          {/* Conflict Section 1: Clinics Needing Cover */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-amber-50/60 border-b border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900">Clinics Needing Coverage</h3>
                <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-900 font-semibold rounded-full">
                  {filteredClinicSlots.length} slots
                </span>
              </div>
              <span className="text-xs text-amber-800 font-medium">
                Scheduled doctor on approved leave during clinic session
              </span>
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10 text-xs">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Date / Day</th>
                    <th className="py-2.5 px-4 font-semibold">Clinic</th>
                    <th className="py-2.5 px-4 font-semibold">Scheduled Doctor</th>
                    <th className="py-2.5 px-4 font-semibold">Leave Type (from Leave Register)</th>
                    <th className="py-2.5 px-4 font-semibold">Coverage Status</th>
                    <th className="py-2.5 px-4 font-semibold">Covering Doctor</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClinicSlots.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-400">
                        No clinic coverage conflicts found for the current query.
                      </td>
                    </tr>
                  ) : (
                    filteredClinicSlots.map(slot => (
                      <tr key={slot.id} className="hover:bg-amber-50/20 transition">
                        <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {slot.date} <span className="text-xs text-slate-500">({slot.day_of_week})</span>
                        </td>
                        <td className="py-2.5 px-4 font-bold text-indigo-700 whitespace-nowrap">
                          {slot.clinic_name}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {slot.staff_name}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
                            {slot.leave_type || 'Approved Leave'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          {slot.coverage_status === 'covered' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Covered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5" /> Uncovered
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800 font-medium">
                          {slot.covering_staff_name ? (
                            <span className="text-emerald-700 font-semibold">{slot.covering_staff_name}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => handleOpenCoverModal('clinic', slot)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                          >
                            {slot.covering_staff_name ? 'Change Cover' : 'Assign Cover'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Conflict Section 2: Endoscopy Lists Needing Cover */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-rose-50/60 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-rose-600" />
                <h3 className="font-bold text-slate-900">Endoscopy Lists (Theatre Grid) Needing Cover</h3>
                <span className="text-xs px-2 py-0.5 bg-rose-200 text-rose-900 font-semibold rounded-full">
                  {filteredTheatreConflicts.length} sessions
                </span>
              </div>
              <span className="text-xs text-rose-800 font-medium">
                Endoscopist on approved leave on theatre date
              </span>
            </div>

            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10 text-xs">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                    <th className="py-2.5 px-4 font-semibold">Session</th>
                    <th className="py-2.5 px-4 font-semibold">Room / List</th>
                    <th className="py-2.5 px-4 font-semibold">Scheduled Endoscopist</th>
                    <th className="py-2.5 px-4 font-semibold">Leave Type</th>
                    <th className="py-2.5 px-4 font-semibold">Coverage</th>
                    <th className="py-2.5 px-4 font-semibold">Covering Doctor</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTheatreConflicts.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-slate-400">
                        No endoscopy conflicts found.
                      </td>
                    </tr>
                  ) : (
                    filteredTheatreConflicts.map(theatre => (
                      <tr key={theatre.id} className="hover:bg-rose-50/20 transition">
                        <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {theatre.date} <span className="text-xs text-slate-500">({theatre.day_of_week})</span>
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-700">
                          <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800">
                            {theatre.session}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-indigo-700">
                          {theatre.room_name} <span className="text-xs text-slate-400">({theatre.list_type})</span>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {theatre.staff_name}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
                            {theatre.leave_type || 'Leave'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          {theatre.coverage_status === 'covered' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Covered
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                              <AlertTriangle className="w-3.5 h-3.5" /> Needs Cover
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800 font-medium">
                          {theatre.covering_staff_name ? (
                            <span className="text-emerald-700 font-semibold">{theatre.covering_staff_name}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => handleOpenCoverModal('theatre', theatre)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-100 text-rose-800 hover:bg-rose-200 transition"
                          >
                            {theatre.covering_staff_name ? 'Change Cover' : 'Assign Cover'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Conflict Section 3 & 4: GICC Grand Rounds & Friday Journal Club */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* GICC Grand Rounds */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-blue-50/60 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900">GICC Grand Rounds Affected</h3>
                  <span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-900 font-semibold rounded-full">
                    {synthesizedGiccConflicts.length}
                  </span>
                </div>
                <span className="text-xs text-blue-700">Mondays 12:30pm</span>
              </div>
              <div className="p-4 divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                {synthesizedGiccConflicts.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-sm">
                    No GICC chair/speaker commitments coincide with approved leave.
                  </div>
                ) : (
                  synthesizedGiccConflicts.map(gc => (
                    <div key={gc.id} className="py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-bold text-slate-900">{gc.date} — {gc.role_label || 'Role'}</div>
                        <div className="text-xs text-slate-600">Assigned: <span className="font-semibold">{gc.staff_name}</span></div>
                      </div>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                        {gc.leave_type || 'On Leave'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Friday Journal Club */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 bg-purple-50/60 border-b border-purple-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-600" />
                  <h3 className="font-bold text-slate-900">Friday Journal Club Affected</h3>
                  <span className="text-xs px-2 py-0.5 bg-purple-200 text-purple-900 font-semibold rounded-full">
                    {synthesizedJcConflicts.length}
                  </span>
                </div>
                <span className="text-xs text-purple-700">Fridays 8:00am</span>
              </div>
              <div className="p-4 divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                {synthesizedJcConflicts.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-sm">
                    No Friday JC presenter commitments coincide with approved leave.
                  </div>
                ) : (
                  synthesizedJcConflicts.map(jc => (
                    <div key={jc.id} className="py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <div className="font-bold text-slate-900">{jc.date} — Presenter</div>
                        <div className="text-xs text-slate-600">Assigned: <span className="font-semibold">{jc.staff_name}</span></div>
                      </div>
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800">
                        {jc.leave_type || 'On Leave'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 2: Full Clinic Schedule Grid */}
      {activeSubTab === 'grid' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Month:</span>
              <input
                type="month"
                value={searchDate}
                onChange={e => setSearchDate(e.target.value)}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Clinic:</span>
              <select
                value={selectedClinic}
                onChange={e => setSelectedClinic(e.target.value)}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CLINIC_NAMES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Doctor:</span>
              <select
                value={selectedDoctor}
                onChange={e => setSelectedDoctor(e.target.value)}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Doctors</option>
                {staffList?.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Status:</span>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="uncovered">Uncovered (Needs Cover)</option>
                <option value="covered">Covered</option>
                <option value="attending">Attending</option>
                <option value="off_routine">Off Routine (X)</option>
              </select>
            </div>

            <div className="ml-auto text-xs text-slate-500">
              Showing {filteredGridEntries.length} clinic records for {searchDate}
            </div>
          </div>

          {/* Grid Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10 text-xs">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Date</th>
                    <th className="py-2.5 px-4 font-semibold">Day</th>
                    <th className="py-2.5 px-4 font-semibold">Clinic Name</th>
                    <th className="py-2.5 px-4 font-semibold">Staff Doctor</th>
                    <th className="py-2.5 px-4 font-semibold">Attendance / Leave Status</th>
                    <th className="py-2.5 px-4 font-semibold">Coverage Status</th>
                    <th className="py-2.5 px-4 font-semibold">Covering Doctor</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGridEntries.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-8 text-center text-slate-400">
                        No clinic records matching filters for {searchDate}.
                      </td>
                    </tr>
                  ) : (
                    filteredGridEntries.map(entry => {
                      const isLeave = entry.status === 'on_leave';
                      const isHoliday = entry.status === 'holiday';
                      const isOff = entry.status === 'off_routine';
                      const isAttending = entry.status === 'attending';

                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/60 transition">
                          <td className="py-2 px-4 font-medium text-slate-900 whitespace-nowrap">
                            {entry.date}
                          </td>
                          <td className="py-2 px-4 text-slate-500 whitespace-nowrap">
                            {entry.day_of_week}
                          </td>
                          <td className="py-2 px-4 font-bold text-indigo-700 whitespace-nowrap">
                            {entry.clinic_name}
                          </td>
                          <td className="py-2 px-4 font-medium text-slate-900 whitespace-nowrap">
                            {entry.staff_name}
                          </td>
                          <td className="py-2 px-4">
                            {isLeave && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
                                {entry.leave_type || 'Approved Leave'}
                              </span>
                            )}
                            {isHoliday && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                                Public Holiday
                              </span>
                            )}
                            {isOff && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-500">
                                Routine Off (X)
                              </span>
                            )}
                            {isAttending && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                                Scheduled ({entry.notes || 'Attending'})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-4">
                            {entry.coverage_status === 'covered' && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Covered
                              </span>
                            )}
                            {entry.coverage_status === 'uncovered' && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                <AlertTriangle className="w-3.5 h-3.5" /> Needs Cover
                              </span>
                            )}
                            {entry.coverage_status === 'not_required' && (
                              <span className="text-xs text-slate-400">Not required</span>
                            )}
                          </td>
                          <td className="py-2 px-4 font-semibold text-emerald-700">
                            {entry.covering_staff_name || '—'}
                          </td>
                          <td className="py-2 px-4 text-right">
                            {isLeave && (
                              <button
                                onClick={() => handleOpenCoverModal('clinic', entry)}
                                className="px-2 py-1 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                              >
                                {entry.covering_staff_name ? 'Edit Cover' : 'Assign'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 3: Staff Leave Register */}
      {activeSubTab === 'leaves' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Department Leave Register</h3>
              <p className="text-xs text-slate-500">
                Synchronized across "Leave and endo clashes", monthly updates, and submitted leave forms
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 bg-indigo-100 text-indigo-800 font-bold rounded-full">
              {allUnifiedLeaves.length} active leave records
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 text-xs font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Staff Member</th>
                  <th className="py-2.5 px-4">Leave Type</th>
                  <th className="py-2.5 px-4">Start Date</th>
                  <th className="py-2.5 px-4">End Date</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Department / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allUnifiedLeaves.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400">
                      No active leave records found.
                    </td>
                  </tr>
                ) : (
                  allUnifiedLeaves.map((l, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {l.staff_name}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          {l.leave_type || 'Annual'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-700">
                        {l.start_date}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-700">
                        {l.end_date || l.start_date}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                          Approved
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-500">
                        {l.manager_name || l.notes || 'Department Coordinator'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Coverage Assignment Modal */}
      {coverModalOpen && activeCoverItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Assign Coverage
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeCoverItem.type === 'clinic' ? 'Clinic Slot' : 'Endoscopy List'} for {activeCoverItem.item.staff_name}
                </p>
              </div>
              <button
                onClick={() => setCoverModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-700">
              <div><span className="font-semibold text-slate-500">Date:</span> {activeCoverItem.item.date} ({activeCoverItem.item.day_of_week})</div>
              {activeCoverItem.type === 'clinic' ? (
                <div><span className="font-semibold text-slate-500">Clinic:</span> {activeCoverItem.item.clinic_name}</div>
              ) : (
                <div><span className="font-semibold text-slate-500">Room / Session:</span> {activeCoverItem.item.room_name} ({activeCoverItem.item.session})</div>
              )}
              <div><span className="font-semibold text-slate-500">Scheduled:</span> {activeCoverItem.item.staff_name}</div>
              <div><span className="font-semibold text-slate-500">Leave Reason:</span> {activeCoverItem.item.leave_type || 'Leave'}</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Select Covering Doctor:
                </label>
                <select
                  value={selectedCoverDoctor}
                  onChange={e => setSelectedCoverDoctor(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Leave Uncovered / Reset --</option>
                  {staffList?.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes (optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Swapped list, agreed via email"
                  value={coverNotes}
                  onChange={e => setCoverNotes(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCoverModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCover}
                disabled={savingCover}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                {savingCover ? 'Saving...' : 'Save Coverage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
