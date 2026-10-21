import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, RefreshCw, Mail, CheckCircle2, XCircle, ArrowRightLeft, 
  User, Clock, ShieldCheck, Download, ChevronLeft, ChevronRight, AlertTriangle, FileText, Send, Upload, KeyRound, Stethoscope, Trash2, Building2
} from 'lucide-react';
import { api, isSupabaseConfigured } from './api';
import { generateLeavePdf } from './pdfGenerator';
import { parseRosterFile, parseLeaveFile } from './rosterParser';
import BulletinManager from './BulletinManager';
import TheatreGridManager from './TheatreGridManager';
import ClinicManager from './ClinicManager';
import {
  DAYS_OF_WEEK,
  GASTRO_ROOMS,
  matchDoctorName,
  getCycleWeek,
  addDaysYMD,
  findDoctorLeaveOnDate,
  getWeekEndoSchedule,
  findLeaveClashes
} from './theatreGrid';

// Helper: Get Melbourne Date
function getMelbourneDate() {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  return new Date(`${s}T00:00:00`);
}

// Helper: Get Monday of given or current Melbourne week
function getMondayOfCurrentWeek() {
  const d = getMelbourneDate();
  const day = d.getDay(); // 0 is Sun, 1 is Mon
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

// Helper: Format YYYY-MM-DD or date object to DD/MM/YYYY
export function formatDDMMYYYY(dateInput) {
  if (!dateInput) return '';
  if (String(dateInput).toUpperCase() === 'TBC') return 'TBC';
  const str = String(dateInput).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('weekly'); // weekly | theatre | bulletin | roster | swaps | leave | upload
  const [staffList, setStaffList] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // Weekly digest initialized to current Melbourne week Monday
  const [weekMonday, setWeekMonday] = useState(getMondayOfCurrentWeek());
  const [rosterEntries, setRosterEntries] = useState([]);

  // Theatre Grid Templates (Weeks 1-4) & Per-Date Endo Overrides
  const [theatreTemplates, setTheatreTemplates] = useState(null);
  const [endoOverrides, setEndoOverrides] = useState({});
  const [coverModalSession, setCoverModalSession] = useState(null);
  const [coverStaffInput, setCoverStaffInput] = useState('');
  const [coverStatusInput, setCoverStatusInput] = useState('covered');

  // Roster view filters
  const [filterType, setFilterType] = useState('all');
  const [filterDoctor, setFilterDoctor] = useState('');

  // Swaps state
  const [swaps, setSwaps] = useState([]);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [selectedEntryToSwap, setSelectedEntryToSwap] = useState(null);
  const [swapTargetDoctor, setSwapTargetDoctor] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Leave Form state
  const [leaveApplications, setLeaveApplications] = useState([]);
  const [leaveFilterMode, setLeaveFilterMode] = useState('all'); // 'all' | 'endo_clashes' | 'needs_cover'
  const [leaveSearch, setLeaveSearch] = useState('');
  const [leaveForm, setLeaveForm] = useState({
    staff_name: '',
    employee_number: '',
    department: 'Gastroenterology',
    pay_in_advance: 'No',
    leave_type: 'Annual Leave',
    start_date: '',
    end_date: '',
    leave_hours: '38',
    leave_balance: '',
    costing: '',      // SITE (ENDOSCOPY USE ONLY)
    allowances: '',   // COVER (ENDOSCOPY USE ONLY)
    submission_date: new Date().toISOString().slice(0, 10),
    manager_name: 'Prof. Alex Thompson'
  });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveSuccess, setLeaveSuccess] = useState(null);

  // Uploader state
  const [uploadedCount, setUploadedCount] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load initial data
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [staff, roster, sw, lv, tmpl, overrides] = await Promise.all([
      api.getStaff(),
      api.getRoster(),
      api.getSwaps(),
      api.getLeave(),
      api.getTheatreTemplates(),
      api.getEndoOverrides()
    ]);
    setStaffList(staff);
    if (staff.length > 0 && !currentUser) {
      const def = staff.find(s => s.name.includes('Chamara')) || staff[0];
      setCurrentUser(def);
      setLeaveForm(prev => ({ ...prev, staff_name: def.name }));
    }
    setRosterEntries(roster);
    setSwaps(sw);
    setLeaveApplications(lv);
    setTheatreTemplates(tmpl);
    setEndoOverrides(overrides);
  }

  // Week navigation
  const shiftWeek = (days) => {
    setWeekMonday(addDaysYMD(weekMonday, days));
  };

  const currentWeekEntries = useMemo(() => {
    const sundayStr = addDaysYMD(weekMonday, 6);
    return rosterEntries.filter(e => e.date >= weekMonday && e.date <= sundayStr);
  }, [rosterEntries, weekMonday]);

  // Weekly Endoscopy Schedule & Leave Clashes for weekMonday
  const weekEndoSchedule = useMemo(() => {
    return getWeekEndoSchedule(weekMonday, theatreTemplates, leaveApplications, endoOverrides);
  }, [weekMonday, theatreTemplates, leaveApplications, endoOverrides]);

  const weekEndoClashCount = useMemo(() => {
    return weekEndoSchedule.sessions.filter(s => Boolean(s.leaveClash)).length;
  }, [weekEndoSchedule]);

  // Live Clash Detection on Leave Form
  const liveFormClashes = useMemo(() => {
    if (!leaveForm.staff_name || !leaveForm.start_date) {
      return { endoClashes: [], rosterClashes: [], cycleWeeks: [], affectedSites: [] };
    }
    return findLeaveClashes(
      leaveForm.staff_name,
      leaveForm.start_date,
      leaveForm.end_date || leaveForm.start_date,
      theatreTemplates,
      rosterEntries,
      endoOverrides
    );
  }, [leaveForm.staff_name, leaveForm.start_date, leaveForm.end_date, theatreTemplates, rosterEntries, endoOverrides]);

  // Auto-populate SITE (ENDOSCOPY USE ONLY) when start/end dates detect endoscopy clashes
  useEffect(() => {
    if (liveFormClashes.affectedSites.length > 0) {
      const autoSite = liveFormClashes.affectedSites.join(', ');
      setLeaveForm(prev => ({
        ...prev,
        costing: prev.costing || autoSite
      }));
    }
  }, [liveFormClashes.affectedSites.join(',')]);

  // Pre-compute clashes for all stored leave applications
  const enrichedLeaveList = useMemo(() => {
    return leaveApplications.map(app => {
      const clashes = findLeaveClashes(
        app.staff_name,
        app.start_date,
        app.end_date,
        theatreTemplates,
        rosterEntries,
        endoOverrides
      );
      return {
        ...app,
        clashes
      };
    });
  }, [leaveApplications, theatreTemplates, rosterEntries, endoOverrides]);

  const filteredLeaveList = useMemo(() => {
    return enrichedLeaveList.filter(item => {
      if (leaveSearch && !item.staff_name.toLowerCase().includes(leaveSearch.toLowerCase())) {
        return false;
      }
      if (leaveFilterMode === 'endo_clashes') {
        return item.clashes.endoClashes.length > 0 || Boolean(item.costing);
      }
      if (leaveFilterMode === 'needs_cover') {
        return (item.clashes.endoClashes.length > 0 || Boolean(item.costing)) && !item.allowances;
      }
      return true;
    });
  }, [enrichedLeaveList, leaveSearch, leaveFilterMode]);

  // Filtered Roster entries
  const filteredRoster = rosterEntries.filter(e => {
    if (filterType !== 'all' && e.entry_type !== filterType) return false;
    if (filterDoctor && !e.staff_name.toLowerCase().includes(filterDoctor.toLowerCase())) return false;
    return true;
  });

  // Swaps handler
  const handleOpenSwapModal = (entry) => {
    setSelectedEntryToSwap(entry);
    setSwapTargetDoctor('');
    setSwapReason('');
    setSwapModalOpen(true);
  };

  const handleRequestSwap = async (e) => {
    e.preventDefault();
    if (!currentUser || !selectedEntryToSwap || !swapTargetDoctor) return;
    const newSwap = await api.createSwap({
      requester_staff_name: currentUser.name,
      requester_entry_id: selectedEntryToSwap.id,
      peer_staff_name: swapTargetDoctor,
      reason: swapReason || 'Shift swap request'
    });
    setSwaps(prev => [newSwap, ...prev]);
    setSwapModalOpen(false);
    setStatusMsg(`Swap request created for ${swapTargetDoctor}`);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const handlePeerAction = async (swapId, approved) => {
    const status = approved ? 'pending_coordinator' : 'rejected';
    await api.updateSwap(swapId, status, { peer_responded_at: new Date().toISOString() });
    setSwaps(prev => prev.map(s => s.id === swapId ? { ...s, status } : s));
  };

  const handleCoordinatorApprove = async (swap) => {
    if (!pinVerified) {
      setShowPinModal(true);
      return;
    }
    await api.updateSwap(swap.id, 'approved', { coordinator_responded_at: new Date().toISOString() });
    await api.updateRosterEntry(swap.requester_entry_id, { staff_name: swap.peer_staff_name });
    setSwaps(prev => prev.map(s => s.id === swap.id ? { ...s, status: 'approved' } : s));
    setRosterEntries(prev => prev.map(e => e.id === swap.requester_entry_id ? { ...e, staff_name: swap.peer_staff_name } : e));
    setStatusMsg('Swap approved and roster updated!');
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Endoscopy Session Cover Assignment
  const openCoverModal = (sessionObj) => {
    setCoverModalSession(sessionObj);
    setCoverStaffInput(sessionObj.coverDoctor || '');
    setCoverStatusInput(sessionObj.coverStatus === 'cancelled' ? 'cancelled' : sessionObj.coverStatus === 'vacant' ? 'vacant' : 'covered');
  };

  const handleSaveSessionCover = async (e) => {
    e.preventDefault();
    if (!coverModalSession) return;
    const nextOverrides = await api.saveEndoOverride(coverModalSession.overrideKey, {
      cover_staff_name: coverStaffInput.trim(),
      status: coverStatusInput
    });
    setEndoOverrides({ ...nextOverrides });

    // If this session has a matching leave application, also update its COVER (allowances) & SITE (costing)
    if (coverModalSession.leaveClash?.id) {
      const lv = coverModalSession.leaveClash;
      const label = coverStatusInput === 'cancelled'
        ? 'List Cancelled'
        : coverStatusInput === 'vacant'
          ? 'Vacant (Staffing Required)'
          : coverStaffInput.trim();
      const updated = await api.updateLeave(lv.id, {
        costing: lv.costing || `${coverModalSession.room} (${coverModalSession.listType})`,
        allowances: label
      });
      if (updated) {
        setLeaveApplications(prev => prev.map(item => item.id === lv.id ? updated : item));
      }
    }

    setCoverModalSession(null);
    setStatusMsg(`Updated Endoscopy cover for ${coverModalSession.room} (${coverModalSession.day} ${coverModalSession.session})`);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Leave submission & auto-PDF
  const submitLeaveApplication = async (e) => {
    e.preventDefault();
    setLeaveSubmitting(true);
    setLeaveSuccess(null);
    try {
      const autoSites = liveFormClashes.affectedSites.join(', ');
      const payload = {
        ...leaveForm,
        costing: leaveForm.costing || autoSites
      };
      const record = await api.submitLeave(payload);
      setLeaveApplications(prev => [record, ...prev]);
      generateLeavePdf(record);
      setLeaveSuccess('Leave application logged, Theatre Grid clashes recorded, and official PDF downloaded!');
    } catch (err) {
      console.error(err);
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleUpdateLeaveField = async (leaveId, field, value) => {
    setLeaveApplications(prev =>
      prev.map(l => (l.id === leaveId ? { ...l, [field]: value } : l))
    );
    await api.updateLeave(leaveId, { [field]: value });
  };

  const handleDeleteLeave = async (leaveId) => {
    const next = await api.deleteLeave(leaveId);
    setLeaveApplications(next);
  };

  const handleLeaveCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseLeaveFile(file, staffList);
      if (parsed.length === 0) {
        alert('No valid leave rows found in file.');
        return;
      }
      // Enrich blank costing (SITE) if doctor has Endo clashes
      const enriched = parsed.map(rec => {
        const cl = findLeaveClashes(rec.staff_name, rec.start_date, rec.end_date, theatreTemplates, rosterEntries, endoOverrides);
        return {
          ...rec,
          costing: rec.costing || cl.affectedSites.join(', ')
        };
      });
      const next = await api.bulkImportLeave(enriched, 'replace');
      setLeaveApplications(next);
      setStatusMsg(`Imported ${next.length} leave records and aligned with Theatre Grid!`);
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) {
      console.error(err);
      alert('Failed to import leave file: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const exportLeaveCsv = () => {
    const headers = [
      'Name',
      'Leave start date',
      'Leave end date',
      'Type',
      'Cycle Weeks',
      'SITE  (ENDOSCOPY USE ONLY)',
      'COVER  (ENDOSCOPY USE ONLY)'
    ];
    const rows = enrichedLeaveList.map(l => [
      `"${(l.staff_name || '').replace(/"/g, '""')}"`,
      `"${l.start_date || ''}"`,
      `"${l.end_date || ''}"`,
      `"${(l.leave_type || '').replace(/"/g, '""')}"`,
      `"${l.clashes.cycleWeeks.map(w => `W${w}`).join(', ')}"`,
      `"${(l.costing || l.clashes.affectedSites.join(', ')).replace(/"/g, '""')}"`,
      `"${(l.allowances || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SMS_Leave_Endoscopy_Aligned_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Coordinator file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadedCount(null);
    try {
      const parsed = await parseRosterFile(file);
      if (parsed.length > 0) {
        await api.bulkAddRoster(parsed);
        setRosterEntries(prev => [...prev, ...parsed]);
        setUploadedCount(parsed.length);
      } else {
        alert('No valid shifts found in Excel file.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to parse file: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header */}
      <header className="bg-blue-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-700 text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded">St Vincent's Melbourne</span>
              {isSupabaseConfigured ? (
                <span className="bg-emerald-600 text-xs px-2 py-0.5 rounded flex items-center gap-1">● Supabase Active</span>
              ) : (
                <span className="bg-amber-600 text-xs px-2 py-0.5 rounded flex items-center gap-1">● Local/Client Store</span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-bold mt-1">Gastroenterology Department Portal</h1>
          </div>

          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-blue-200" />
            <select
              value={currentUser?.name || ''}
              onChange={(e) => {
                const s = staffList.find(st => st.name === e.target.value);
                setCurrentUser(s);
                setLeaveForm(prev => ({ ...prev, staff_name: s?.name || '' }));
              }}
              className="bg-blue-800 text-white text-sm border border-blue-600 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {staffList.map(st => (
                <option key={st.id || st.name} value={st.name}>
                  {st.name} {st.is_coordinator ? '(Coordinator)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex border-t border-blue-800 overflow-x-auto">
          {[
            { id: 'weekly', label: 'Weekly Rosters & Wards', icon: Calendar },
            { id: 'theatre', label: 'Endo & Theatre Grid', icon: Stethoscope },
            { id: 'clinics', label: 'Clinics & Leave Coordinator', icon: Building2 },
            { id: 'leave', label: 'Leave & Endo Clashes', icon: FileText },
            { id: 'bulletin', label: 'Weekly Bulletin', icon: FileText },
            { id: 'roster', label: 'Full Roster', icon: Clock },
            { id: 'swaps', label: `Shift Swaps (${swaps.filter(s => s.status.startsWith('pending')).length})`, icon: ArrowRightLeft },
            { id: 'upload', label: 'Roster Ingestion', icon: Upload },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active ? 'border-amber-400 text-amber-300 bg-blue-800/50' : 'border-transparent text-blue-100 hover:text-white hover:bg-blue-800/30'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 mt-6">
        {statusMsg && (
          <div className="mb-4 bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded flex items-center justify-between">
            <span className="text-sm font-medium">{statusMsg}</span>
          </div>
        )}

        {/* TAB 1: WEEKLY ROSTERS, WARDS & DUTIES */}
        {activeTab === 'weekly' && (
          <section className="space-y-6">
            {/* Week Navigation Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => shiftWeek(-7)} className="p-2 border rounded hover:bg-slate-50" title="Previous Week">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="font-semibold text-slate-800">
                  Week Commencing Monday: {formatDDMMYYYY(weekMonday)}
                </div>
                <button onClick={() => shiftWeek(7)} className="p-2 border rounded hover:bg-slate-50" title="Next Week">
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-full ml-1">
                  Theatre Grid: Week {weekEndoSchedule.cycleWeek} (4-Wk Cycle)
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {weekEndoClashCount > 0 ? (
                  <button
                    onClick={() => setActiveTab('theatre')}
                    className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-bold hover:bg-rose-100 flex items-center gap-1.5 transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    {weekEndoClashCount} Endo Leave {weekEndoClashCount === 1 ? 'Clash' : 'Clashes'} → View Endo Grid
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab('theatre')}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
                  >
                    <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
                    View Endo Grid (Week {weekEndoSchedule.cycleWeek}) →
                  </button>
                )}
              </div>
            </div>

            {/* Department Ward, Oncall & Meeting Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {['hm_oncall', 'ibd_wards', 'liver_wards', 'consults', 'gicc', 'friday_jc'].map(type => {
                const entries = currentWeekEntries.filter(e => e.entry_type === type);
                const titleMap = {
                  hm_oncall: 'H&M Acute Oncall',
                  ibd_wards: 'IBD Inpatient Service',
                  liver_wards: 'Liver Inpatient Service',
                  consults: 'Consults Service',
                  gicc: 'GICC Grand Round (Mon 12:30)',
                  friday_jc: 'Friday Journal Club (8:00)'
                };
                return (
                  <div key={type} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800 border-b pb-2 mb-3 text-sm flex items-center justify-between">
                        {titleMap[type]}
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{entries.length} shifts</span>
                      </h3>
                      {entries.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No scheduled roster entries this week</p>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {entries.map(e => {
                            const isMe = currentUser && matchDoctorName(e.staff_name, currentUser.name);
                            const leaveHit = findDoctorLeaveOnDate(e.staff_name, e.date, null, leaveApplications);
                            return (
                              <li
                                key={e.id}
                                className={`p-2 rounded border text-xs flex justify-between items-center ${
                                  leaveHit
                                    ? 'bg-rose-50 border-rose-300'
                                    : isMe
                                      ? 'bg-amber-50 border-amber-300'
                                      : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <div>
                                  <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                    <span>{e.staff_name}</span>
                                    {leaveHit && (
                                      <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-bold">
                                        ON LEAVE
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-slate-500">{e.role_label || e.title}</div>
                                </div>
                                <button
                                  onClick={() => handleOpenSwapModal(e)}
                                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                    leaveHit
                                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                      : isMe
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                  }`}
                                  title={isMe ? 'Swap your shift' : 'Initiate swap for this shift'}
                                >
                                  Swap
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 2: ENDO & THEATRE GRID */}
        {activeTab === 'theatre' && (
          <TheatreGridManager
            theatreTemplates={theatreTemplates}
            onSaveTemplates={async (next) => {
              const saved = await api.saveTheatreTemplates(next);
              setTheatreTemplates({ ...saved });
            }}
            onResetTemplates={async () => {
              const def = await api.resetTheatreTemplates();
              setTheatreTemplates({ ...def });
            }}
            staffList={staffList}
            weekMonday={weekMonday}
            shiftWeek={shiftWeek}
            setWeekMonday={setWeekMonday}
            weekEndoSchedule={weekEndoSchedule}
            openCoverModal={openCoverModal}
            currentUser={currentUser}
          />
        )}

        {/* TAB: CLINICS & LEAVE COORDINATOR */}
        {activeTab === 'clinics' && (
          <ClinicManager
            staffList={staffList}
            currentUser={currentUser}
            leaveApplications={leaveApplications}
            theatreTemplates={theatreTemplates}
            rosterEntries={rosterEntries}
            endoOverrides={endoOverrides}
            weekMonday={weekMonday}
          />
        )}

        {/* TAB 3: BULLETIN */}
        {activeTab === 'bulletin' && (
          <BulletinManager
            weekMonday={weekMonday}
            rosterEntries={rosterEntries}
            currentUser={currentUser}
          />
        )}

        {/* TAB 4: FULL ROSTER */}
        {activeTab === 'roster' && (
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Filter doctor name..."
                  value={filterDoctor}
                  onChange={(e) => setFilterDoctor(e.target.value)}
                  className="border px-3 py-1.5 rounded text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="border px-3 py-1.5 rounded text-sm bg-white"
                >
                  <option value="all">All Service Types</option>
                  <option value="hm_oncall">H&M Oncall</option>
                  <option value="ibd_wards">IBD Wards</option>
                  <option value="liver_wards">Liver Wards</option>
                  <option value="consults">Consults</option>
                  <option value="gicc">GICC</option>
                  <option value="friday_jc">Journal Club</option>
                </select>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Showing {filteredRoster.length} of {rosterEntries.length} entries
              </div>
            </div>

            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Cycle Week</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Staff</th>
                    <th className="p-2.5">Role</th>
                    <th className="p-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoster.map(e => {
                    const isMe = currentUser && matchDoctorName(e.staff_name, currentUser.name);
                    const onLeave = findDoctorLeaveOnDate(e.staff_name, e.date, null, leaveApplications);
                    return (
                      <tr key={e.id} className={onLeave ? 'bg-rose-50/70' : isMe ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                        <td className="p-2.5 font-medium">{formatDDMMYYYY(e.date)}</td>
                        <td className="p-2.5">
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold text-[10px]">
                            Week {getCycleWeek(e.date)}
                          </span>
                        </td>
                        <td className="p-2.5 capitalize">{e.entry_type.replace('_', ' ')}</td>
                        <td className="p-2.5 font-semibold text-slate-900">
                          {e.staff_name}
                          {isMe && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-normal ml-1">You</span>}
                          {onLeave && <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-bold ml-1">ON LEAVE</span>}
                        </td>
                        <td className="p-2.5 text-slate-500">{e.role_label || '-'}</td>
                        <td className="p-2.5">
                          <button
                            onClick={() => handleOpenSwapModal(e)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-xs flex items-center gap-1"
                          >
                            <ArrowRightLeft className="w-3 h-3" /> Swap
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 5: SHIFT SWAPS */}
        {activeTab === 'swaps' && (
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Shift Swap Dashboard</h2>
              <p className="text-xs text-slate-500">2-step verified swap workflow: Peer agreement → Coordinator sign-off.</p>
            </div>

            {swaps.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No active or past swap requests found.</p>
            ) : (
              <div className="space-y-3">
                {swaps.map(s => {
                  const isPeer = currentUser && matchDoctorName(s.peer_staff_name, currentUser.name);
                  return (
                    <div key={s.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900">{s.requester_staff_name}</span>
                          <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-sm text-slate-900">{s.peer_staff_name}</span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            s.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                            s.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                            s.status === 'pending_peer' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {s.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">Reason: {s.reason || 'None specified'}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        {s.status === 'pending_peer' && isPeer && (
                          <>
                            <button onClick={() => handlePeerAction(s.id, true)} className="px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700">Accept</button>
                            <button onClick={() => handlePeerAction(s.id, false)} className="px-3 py-1 bg-rose-600 text-white rounded text-xs hover:bg-rose-700">Decline</button>
                          </>
                        )}
                        {s.status === 'pending_coordinator' && (
                          <button onClick={() => handleCoordinatorApprove(s)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                            Approve (Coordinator)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 6: LEAVE APPLICATIONS & ENDOSCOPY CLASH TRACKER */}
        {activeTab === 'leave' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Leave Form + Live Theatre & Roster Clash Detector (5 cols) */}
            <form onSubmit={submitLeaveApplication} className="lg:col-span-5 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 self-start">
              <div>
                <h2 className="text-lg font-bold text-slate-800">St Vincent's Leave Application</h2>
                <p className="text-xs text-slate-500">
                  Checks 4-week Theatre Grid (`ENDO` & `Gas/Colon`) and Department Roster for clashes, logs cover, and downloads official PDF.
                </p>
              </div>

              {leaveSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded text-xs font-medium">
                  {leaveSuccess}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="col-span-2 sm:col-span-1">
                  <label className="font-semibold block mb-1">Staff Name</label>
                  <input
                    type="text"
                    list="gastro-staff-datalist"
                    value={leaveForm.staff_name}
                    onChange={(e) => setLeaveForm({ ...leaveForm, staff_name: e.target.value })}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="font-semibold block mb-1">Employee Number</label>
                  <input
                    type="text"
                    value={leaveForm.employee_number}
                    onChange={(e) => setLeaveForm({ ...leaveForm, employee_number: e.target.value })}
                    className="w-full border p-2 rounded"
                    placeholder="e.g. 104829"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Leave Type</label>
                  <select
                    value={leaveForm.leave_type}
                    onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                    className="w-full border p-2 rounded bg-white"
                  >
                    <option>Annual Leave</option>
                    <option>Conference / Study Leave</option>
                    <option>Sick / Carer's Leave</option>
                    <option>Long Service Leave</option>
                    <option>Sabbatical</option>
                    <option>Parental Leave</option>
                    <option>Leave Without Pay</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1">Hours / Days</label>
                  <input
                    type="text"
                    value={leaveForm.leave_hours}
                    onChange={(e) => setLeaveForm({ ...leaveForm, leave_hours: e.target.value })}
                    className="w-full border p-2 rounded"
                    placeholder="e.g. 38 hrs"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value, costing: '' })}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">End Date</label>
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value, costing: '' })}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>

                {/* Live Theatre & Roster Clash Detector Box */}
                {leaveForm.start_date && (
                  <div className="col-span-2 rounded-lg border p-3 space-y-2.5 bg-slate-50 border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
                        Theatre Grid & Roster Alignment
                      </span>
                      {liveFormClashes.cycleWeeks.length > 0 && (
                        <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                          Cycle {liveFormClashes.cycleWeeks.map(w => `Week ${w}`).join(', ')}
                        </span>
                      )}
                    </div>

                    {/* Endoscopy Clashes */}
                    {liveFormClashes.endoClashes.length > 0 ? (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded space-y-1.5">
                        <div className="font-bold text-rose-800 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          {liveFormClashes.endoClashes.length} Endoscopy / Theatre List {liveFormClashes.endoClashes.length === 1 ? 'Clash' : 'Clashes'} Detected:
                        </div>
                        <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
                          {liveFormClashes.endoClashes.map((c, i) => (
                            <li key={i} className="text-[11px] bg-white px-2 py-1 rounded border border-rose-200 flex items-center justify-between">
                              <span>
                                <strong className="text-slate-900">{c.day} {formatDDMMYYYY(c.date)} ({c.session})</strong> — {c.room} ({c.listType})
                              </span>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                                Wk {c.cycleWeek}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        No Endoscopy (`ENDO` / `Gas/Colon`) lists affected during these dates.
                      </div>
                    )}

                    {/* Department Roster Clashes */}
                    {liveFormClashes.rosterClashes.length > 0 && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded space-y-1.5">
                        <div className="font-bold text-amber-900">
                          {liveFormClashes.rosterClashes.length} Department Roster {liveFormClashes.rosterClashes.length === 1 ? 'Duty' : 'Duties'} Affected:
                        </div>
                        <ul className="space-y-1">
                          {liveFormClashes.rosterClashes.map(rc => (
                            <li key={rc.id} className="text-[11px] bg-white px-2 py-1 rounded border border-amber-200 flex items-center justify-between">
                              <span>
                                <strong>{formatDDMMYYYY(rc.date)}</strong>: {rc.title} ({rc.role_label})
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenSwapModal(rc)}
                                className="text-[10px] bg-amber-600 text-white px-1.5 py-0.5 rounded hover:bg-amber-700"
                              >
                                Swap
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="font-semibold block mb-1">SITE (Endoscopy Use Only)</label>
                  <input
                    type="text"
                    value={leaveForm.costing}
                    onChange={(e) => setLeaveForm({ ...leaveForm, costing: e.target.value })}
                    className="w-full border p-2 rounded"
                    placeholder="Auto-filled on Endo clash"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">COVER (Endoscopy Use Only)</label>
                  <input
                    type="text"
                    list="gastro-staff-datalist"
                    value={leaveForm.allowances}
                    onChange={(e) => setLeaveForm({ ...leaveForm, allowances: e.target.value })}
                    className="w-full border p-2 rounded"
                    placeholder="Covering doctor / Vacant"
                  />
                </div>
                <div className="col-span-2">
                  <label className="font-semibold block mb-1">Approving Manager</label>
                  <input
                    type="text"
                    value={leaveForm.manager_name}
                    onChange={(e) => setLeaveForm({ ...leaveForm, manager_name: e.target.value })}
                    className="w-full border p-2 rounded"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={leaveSubmitting}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-2.5 rounded text-xs flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {leaveSubmitting ? 'Submitting...' : 'Submit Leave & Download Official PDF'}
              </button>
            </form>

            {/* Right Column: Coordinator Leave & Endoscopy Clash Tracker (7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Leave & Endoscopy Clash Tracker
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aligned with `SMS monthly leave update` & 4-Week Theatre Grid (`ENDO` / `Gas/Colon`).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium px-2.5 py-1.5 rounded border border-slate-300 flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" /> Import Leave CSV
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleLeaveCsvUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={exportLeaveCsv}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 py-1.5 rounded flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all', label: `All Leave (${enrichedLeaveList.length})` },
                    {
                      id: 'endo_clashes',
                      label: `Endo Clashes (${enrichedLeaveList.filter(i => i.clashes.endoClashes.length > 0 || i.costing).length})`
                    },
                    {
                      id: 'needs_cover',
                      label: `Needs Endo Cover (${enrichedLeaveList.filter(i => (i.clashes.endoClashes.length > 0 || i.costing) && !i.allowances).length})`
                    }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setLeaveFilterMode(tab.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border ${
                        leaveFilterMode === tab.id
                          ? 'bg-blue-900 text-white border-blue-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Search clinician..."
                  value={leaveSearch}
                  onChange={(e) => setLeaveSearch(e.target.value)}
                  className="border px-2.5 py-1 rounded text-xs w-full sm:w-44"
                />
              </div>

              {filteredLeaveList.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-6 text-center">No matching leave records found.</p>
              ) : (
                <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                  {filteredLeaveList.map(app => {
                    const endoList = app.clashes.endoClashes;
                    const rosterList = app.clashes.rosterClashes;
                    const hasEndo = endoList.length > 0 || Boolean(app.costing);
                    return (
                      <div
                        key={app.id}
                        className={`border p-3.5 rounded-lg text-xs space-y-2.5 ${
                          hasEndo
                            ? app.allowances
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : 'bg-rose-50/40 border-rose-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">{app.staff_name}</span>
                              <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                                {app.leave_type}
                              </span>
                              {app.clashes.cycleWeeks.length > 0 && (
                                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-[10px] font-bold">
                                  Cycle {app.clashes.cycleWeeks.map(w => `W${w}`).join(', ')}
                                </span>
                              )}
                            </div>
                            <div className="text-slate-600 font-medium mt-0.5">
                              {formatDDMMYYYY(app.start_date)} → {formatDDMMYYYY(app.end_date)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              onClick={() => generateLeavePdf(app)}
                              className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-300 rounded text-blue-700 hover:bg-blue-50 font-medium"
                              title="Download Official St Vincent's Leave PDF"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </button>
                            <button
                              onClick={() => handleDeleteLeave(app.id)}
                              className="p-1 text-slate-400 hover:text-rose-600"
                              title="Delete Leave Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Clashing Endoscopy Lists Summary */}
                        {endoList.length > 0 && (
                          <div className="bg-white/90 border border-rose-200 rounded p-2 space-y-1">
                            <div className="font-bold text-rose-800 text-[11px] flex items-center justify-between">
                              <span>
                                ⚠️ {endoList.length} Scheduled Endoscopy {endoList.length === 1 ? 'Session' : 'Sessions'} During Leave:
                              </span>
                              {app.clashes.isTruncated && (
                                <span className="text-[10px] font-normal text-slate-500">(Showing first 120 days)</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {endoList.slice(0, 8).map((s, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setWeekMonday( addDaysYMD(s.date, -s.dayIndex) );
                                    setActiveTab('weekly');
                                  }}
                                  className="text-[10px] bg-rose-100 hover:bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-medium transition-colors"
                                  title="Click to jump to this week on Weekly Schedule"
                                >
                                  {s.day.slice(0, 3)} {formatDDMMYYYY(s.date).slice(0, 5)} {s.session}: {s.room} (W{s.cycleWeek})
                                </button>
                              ))}
                              {endoList.length > 8 && (
                                <span className="text-[10px] text-slate-500 self-center">
                                  +{endoList.length - 8} more sessions
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Clashing Roster Shifts Summary */}
                        {rosterList.length > 0 && (
                          <div className="bg-amber-50/90 border border-amber-200 rounded p-2">
                            <div className="font-bold text-amber-900 text-[11px] mb-1">
                              Roster Clashes ({rosterList.length}):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {rosterList.slice(0, 6).map(r => (
                                <span key={r.id} className="text-[10px] bg-white border border-amber-200 text-amber-900 px-2 py-0.5 rounded">
                                  {formatDDMMYYYY(r.date).slice(0, 5)}: {r.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Editable SITE & COVER (Endoscopy Use Only) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                              SITE (Endoscopy Use Only)
                            </label>
                            <input
                              type="text"
                              value={app.costing || ''}
                              placeholder={endoList.length > 0 ? app.clashes.affectedSites.join(', ') : 'No Endo site clash'}
                              onChange={(e) => handleUpdateLeaveField(app.id, 'costing', e.target.value)}
                              className="w-full border border-slate-300 bg-white px-2 py-1 rounded text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                              COVER (Endoscopy Use Only)
                            </label>
                            <input
                              type="text"
                              list="gastro-staff-datalist"
                              value={app.allowances || ''}
                              placeholder={hasEndo ? 'Assign cover doctor / Vacant...' : '—'}
                              onChange={(e) => handleUpdateLeaveField(app.id, 'allowances', e.target.value)}
                              className={`w-full border px-2 py-1 rounded text-xs font-medium ${
                                hasEndo && !app.allowances
                                  ? 'border-rose-300 bg-rose-50/50 placeholder-rose-400'
                                  : 'border-slate-300 bg-white'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: ROSTER INGESTION */}
        {activeTab === 'upload' && (
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-4 text-center">
            <Upload className="w-10 h-10 text-blue-600 mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">In-Browser Excel Roster Uploader</h2>
            <p className="text-xs text-slate-500">
              Drag-and-drop or select new schedule spreadsheets (SMS, GICC, Journal Club). For Hospital Theatre Grid CSVs, use the <strong>Theatre Grid (W1–W4)</strong> tab.
            </p>

            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 bg-slate-50 hover:bg-slate-100 transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="text-xs"
              />
            </div>

            {isUploading && <p className="text-xs text-blue-600 font-medium">Parsing Excel file...</p>}
            {uploadedCount !== null && (
              <p className="text-xs text-emerald-600 font-semibold">
                ✓ Successfully parsed and imported {uploadedCount} shifts into roster!
              </p>
            )}
          </section>
        )}
      </main>

      {/* ENDOSCOPY COVER / BACKFILL MODAL */}
      {coverModalSession && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Endoscopy List Cover / Status</h3>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5 rounded">
                Cycle Week {coverModalSession.cycleWeek}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
              <div>
                <span className="text-slate-500">Session:</span>{' '}
                <strong className="text-slate-900">
                  {coverModalSession.day} {formatDDMMYYYY(coverModalSession.date)} ({coverModalSession.session})
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Room & Type:</span>{' '}
                <strong className="text-slate-900">
                  {coverModalSession.room} — {coverModalSession.listType} ({coverModalSession.site})
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Scheduled Endoscopist:</span>{' '}
                <strong className="text-slate-900">{coverModalSession.staff_name}</strong>
              </div>
              {coverModalSession.leaveClash && (
                <div className="text-rose-700 font-semibold pt-1">
                  ⚠️ On {coverModalSession.leaveClash.leave_type} ({formatDDMMYYYY(coverModalSession.leaveClash.start_date)} to {formatDDMMYYYY(coverModalSession.leaveClash.end_date)})
                </div>
              )}
            </div>

            <form onSubmit={handleSaveSessionCover} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Action / Status:</label>
                <select
                  value={coverStatusInput}
                  onChange={(e) => setCoverStatusInput(e.target.value)}
                  className="w-full border p-2 rounded bg-white"
                >
                  <option value="covered">Backfilled / Covered by Colleague</option>
                  <option value="vacant">Theatre Vacant (Staffing Required)</option>
                  <option value="cancelled">List Closed / Cancelled</option>
                  <option value="scheduled">Reset to Normal Scheduled</option>
                </select>
              </div>

              {coverStatusInput === 'covered' && (
                <div>
                  <label className="font-semibold block mb-1">Covering Endoscopist:</label>
                  <input
                    type="text"
                    list="gastro-staff-datalist"
                    value={coverStaffInput}
                    onChange={(e) => setCoverStaffInput(e.target.value)}
                    placeholder="Select or type covering doctor..."
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCoverModalSession(null)}
                  className="px-3 py-1.5 border rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
                >
                  Save Cover
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SWAP MODAL */}
      {swapModalOpen && selectedEntryToSwap && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-800">Request Shift Swap</h3>
            <p className="text-xs text-slate-500">
              Shift: <span className="font-semibold text-slate-800">{selectedEntryToSwap.title}</span> on {formatDDMMYYYY(selectedEntryToSwap.date)}
            </p>

            <form onSubmit={handleRequestSwap} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Target Doctor to swap with:</label>
                <select
                  value={swapTargetDoctor}
                  onChange={(e) => setSwapTargetDoctor(e.target.value)}
                  className="w-full border p-2 rounded bg-white"
                  required
                >
                  <option value="">Select Doctor...</option>
                  {staffList.filter(s => s.name !== currentUser?.name).map(s => (
                    <option key={s.id || s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Reason / Notes:</label>
                <textarea
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  className="w-full border p-2 rounded"
                  rows={2}
                  placeholder="e.g. On leave / conference"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSwapModalOpen(false)}
                  className="px-3 py-1.5 border rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
                >
                  Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PIN VERIFY MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 space-y-4 text-center">
            <KeyRound className="w-8 h-8 text-blue-600 mx-auto" />
            <h3 className="font-bold text-slate-800">Coordinator PIN Required</h3>
            <p className="text-xs text-slate-500">Enter coordinator verification PIN (Default: 1234)</p>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN"
              className="border text-center text-lg tracking-widest px-4 py-2 rounded w-32 mx-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => setShowPinModal(false)}
                className="px-3 py-1.5 border rounded text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (pinInput === '1234') {
                    setPinVerified(true);
                    setShowPinModal(false);
                    setStatusMsg('Coordinator PIN verified!');
                  } else {
                    alert('Incorrect PIN');
                  }
                }}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
              >
                Verify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
