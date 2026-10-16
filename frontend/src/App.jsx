import React, { useState, useEffect } from 'react';
import { 
  Calendar, RefreshCw, Mail, CheckCircle2, XCircle, ArrowRightLeft, 
  User, UserX, Clock, ShieldCheck, Download, ChevronLeft, ChevronRight, AlertTriangle, FileText, Send, Upload, KeyRound
} from 'lucide-react';
import { api, isSupabaseConfigured } from './api';
import { generateLeavePdf } from './pdfGenerator';
import { parseRosterFile } from './rosterParser';
import BulletinManager from './BulletinManager';
import LeaveCalendar, { doesLeaveOverlapRange, getDoctorLeavesForRange } from './LeaveCalendar';

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
  return d.toISOString().slice(0, 10);
}

// Helper: Normalize name for matching (strips Dr, Prof, Assoc, etc)
function matchDoctorName(nameA, nameB) {
  if (!nameA || !nameB) return false;
  const clean = s => s.toLowerCase().replace(/^(dr\.?|prof\.?|assoc\.?|mr\.?|ms\.?)\s+/i, '').trim();
  const a = clean(nameA);
  const b = clean(nameB);
  return a.includes(b) || b.includes(a);
}

// Helper: Format YYYY-MM-DD or date object to DD/MM/YYYY
export function formatDDMMYYYY(dateInput) {
  if (!dateInput) return '';
  const str = String(dateInput).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('weekly'); // weekly | roster | swaps | leave | upload
  const [staffList, setStaffList] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // Weekly digest initialized to current Melbourne week Monday
  const [weekMonday, setWeekMonday] = useState(getMondayOfCurrentWeek());
  const [rosterEntries, setRosterEntries] = useState([]);
  
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
    costing: '',
    allowances: '',
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
    const staff = await api.getStaff();
    setStaffList(staff);
    if (staff.length > 0 && !currentUser) {
      const def = staff.find(s => s.name.includes("Chamara")) || staff[0];
      setCurrentUser(def);
      setLeaveForm(prev => ({ ...prev, staff_name: def.name }));
    }
    const roster = await api.getRoster();
    setRosterEntries(roster);
    const sw = await api.getSwaps();
    setSwaps(sw);
    const lv = await api.getLeave();
    setLeaveApplications(lv);
  }

  // Week navigation
  const shiftWeek = (days) => {
    const cur = new Date(weekMonday);
    cur.setDate(cur.getDate() + days);
    setWeekMonday(cur.toISOString().slice(0, 10));
  };

  const currentWeekEntries = rosterEntries.filter(e => {
    const d = new Date(e.date);
    const m = new Date(weekMonday);
    const diff = (d - m) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff < 7;
  });

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
      reason: swapReason || "Shift swap request"
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
    // Requires PIN verification
    if (!pinVerified) {
      setShowPinModal(true);
      return;
    }
    await api.updateSwap(swap.id, 'approved', { coordinator_responded_at: new Date().toISOString() });
    await api.updateRosterEntry(swap.requester_entry_id, { staff_name: swap.peer_staff_name });
    setSwaps(prev => prev.map(s => s.id === swap.id ? { ...s, status: 'approved' } : s));
    setRosterEntries(prev => prev.map(e => e.id === swap.requester_entry_id ? { ...e, staff_name: swap.peer_staff_name } : e));
    setStatusMsg(`Swap approved and roster updated!`);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Leave submission & auto-PDF
  const submitLeaveApplication = async (e) => {
    e.preventDefault();
    setLeaveSubmitting(true);
    setLeaveSuccess(null);
    try {
      const record = await api.submitLeave(leaveForm);
      setLeaveApplications(prev => [record, ...prev]);
      // Auto generate & trigger download
      generateLeavePdf(record);
      setLeaveSuccess("Leave application logged in database and official PDF downloaded!");
    } catch (err) {
      console.error(err);
    } finally {
      setLeaveSubmitting(false);
    }
  };

  // Leave Calendar CRUD handlers
  const handleAddLeaveRecord = async (entry) => {
    const record = await api.submitLeave(entry);
    setLeaveApplications(prev => [record, ...prev]);
    setStatusMsg(`Added leave for ${record.staff_name}`);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const handleUpdateLeaveRecord = async (id, patch) => {
    await api.updateLeave(id, patch);
    setLeaveApplications(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    setStatusMsg('Leave entry updated.');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handleDeleteLeaveRecord = async (id) => {
    await api.deleteLeave(id);
    setLeaveApplications(prev => prev.filter(l => l.id !== id));
    setStatusMsg('Leave entry deleted.');
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handleBulkImportLeave = async (records, mode) => {
    const next = await api.bulkImportLeave(records, mode);
    setLeaveApplications(next);
  };

  // Week Sunday helper for Weekly Schedule leave checks
  const weekSunday = (() => {
    const d = new Date(`${weekMonday}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  })();

  const currentWeekLeaves = leaveApplications.filter(l =>
    doesLeaveOverlapRange(l, weekMonday, weekSunday)
  );

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
        alert("No valid shifts found in Excel file.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to parse file: " + err.message);
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
                  {st.name} {st.is_coordinator ? "(Coordinator)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex border-t border-blue-800 overflow-x-auto">
          {[
            { id: 'weekly', label: 'Weekly Schedule', icon: Calendar },
            { id: 'leave_calendar', label: `Who's On Leave (${leaveApplications.length})`, icon: UserX },
            { id: 'bulletin', label: 'Weekly Bulletin', icon: FileText },
            { id: 'roster', label: 'Full Roster', icon: Clock },
            { id: 'swaps', label: `Shift Swaps (${swaps.filter(s => s.status.startsWith('pending')).length})`, icon: ArrowRightLeft },
            { id: 'leave', label: 'Leave Applications', icon: FileText },
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

        {/* TAB 1: WEEKLY DIGEST */}
        {activeTab === 'weekly' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
              <div className="flex items-center gap-2">
                <button onClick={() => shiftWeek(-7)} className="p-2 border rounded hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
                <div className="font-semibold text-slate-800">Week Commencing Monday: {formatDDMMYYYY(weekMonday)}</div>
                <button onClick={() => shiftWeek(7)} className="p-2 border rounded hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="text-sm text-slate-500">
                Logged in as <span className="font-semibold text-slate-800">{currentUser?.name}</span>
              </div>
            </div>

            {/* Consultants On Leave This Week Banner */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserX className="w-4 h-4 text-rose-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Consultants On Leave This Week ({currentWeekLeaves.length})
                  </h3>
                </div>
                <button
                  onClick={() => setActiveTab('leave_calendar')}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Open Full Leave Calendar →
                </button>
              </div>
              {currentWeekLeaves.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No consultants recorded on leave for this week.</p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {currentWeekLeaves.map(lv => (
                    <span
                      key={lv.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-xs text-rose-900"
                    >
                      <span className="font-semibold">{lv.staff_name}</span>
                      <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-rose-200 text-rose-700 font-medium">
                        {lv.leave_type}
                      </span>
                      <span className="text-[10px] text-rose-600">
                        ({formatDDMMYYYY(lv.start_date)}–{lv.end_date === 'TBC' ? 'TBC' : formatDDMMYYYY(lv.end_date)})
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

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
                            const doctorLeaves = getDoctorLeavesForRange(e.staff_name, leaveApplications, weekMonday, weekSunday);
                            const onLeave = doctorLeaves.length > 0;
                            return (
                              <li key={e.id} className={`p-2 rounded border text-xs flex justify-between items-center ${
                                onLeave ? 'bg-rose-50/70 border-rose-300' : isMe ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'
                              }`}>
                                <div>
                                  <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                                    <span>{e.staff_name}</span>
                                    {onLeave && (
                                      <span
                                        className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-0.5"
                                        title={`On Leave: ${doctorLeaves.map(l => `${l.leave_type} (${formatDDMMYYYY(l.start_date)} to ${l.end_date === 'TBC' ? 'TBC' : formatDDMMYYYY(l.end_date)})`).join(', ')}`}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5" /> ON LEAVE
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-slate-500">{e.role_label || e.title}</div>
                                </div>
                                <button
                                  onClick={() => handleOpenSwapModal(e)}
                                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                    isMe
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

        {/* TAB: WHO'S ON LEAVE (PUBLIC CONSULTANT LEAVE CALENDAR) */}
        {activeTab === 'leave_calendar' && (
          <LeaveCalendar
            leaveApplications={leaveApplications}
            staffList={staffList}
            weekMonday={weekMonday}
            onShiftWeek={shiftWeek}
            onSetWeekMonday={setWeekMonday}
            onAddLeave={handleAddLeaveRecord}
            onUpdateLeave={handleUpdateLeaveRecord}
            onDeleteLeave={handleDeleteLeaveRecord}
            onBulkImportLeave={handleBulkImportLeave}
          />
        )}

        {/* TAB 2: BULLETIN */}
        {activeTab === 'bulletin' && (
          <BulletinManager
            weekMonday={weekMonday}
            rosterEntries={rosterEntries}
            currentUser={currentUser}
          />
        )}

        {/* TAB 3: FULL ROSTER */}
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
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Staff</th>
                    <th className="p-2.5">Role</th>
                    <th className="p-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoster.map(e => {
                    const isMe = currentUser && matchDoctorName(e.staff_name, currentUser.name);
                    const shiftEnd = (() => {
                      const d = new Date(`${e.date}T00:00:00`);
                      d.setDate(d.getDate() + 6);
                      return d.toISOString().slice(0, 10);
                    })();
                    const doctorLeaves = getDoctorLeavesForRange(e.staff_name, leaveApplications, e.date, shiftEnd);
                    const onLeave = doctorLeaves.length > 0;
                    return (
                      <tr key={e.id} className={onLeave ? 'bg-rose-50/50' : isMe ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                        <td className="p-2.5 font-medium">{formatDDMMYYYY(e.date)}</td>
                        <td className="p-2.5 capitalize">{e.entry_type.replace('_', ' ')}</td>
                        <td className="p-2.5 font-semibold text-slate-900">
                          {e.staff_name}
                          {isMe && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-normal ml-1">You</span>}
                          {onLeave && (
                            <span
                              className="text-[10px] bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded font-bold ml-1.5"
                              title={doctorLeaves.map(l => `${l.leave_type}: ${formatDDMMYYYY(l.start_date)}–${l.end_date === 'TBC' ? 'TBC' : formatDDMMYYYY(l.end_date)}`).join(', ')}
                            >
                              ON LEAVE
                            </span>
                          )}
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

        {/* TAB 3: SHIFT SWAPS */}
        {activeTab === 'swaps' && (
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Shift Swap Dashboard</h2>
              <p className="text-xs text-slate-500">2-step verified swap workflow: Peer agreement $\rightarrow$ Coordinator sign-off.</p>
            </div>

            {swaps.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No active or past swap requests found.</p>
            ) : (
              <div className="space-y-3">
                {swaps.map(s => {
                  const isPeer = currentUser && s.peer_staff_name.toLowerCase().includes(currentUser.name.toLowerCase());
                  const isRequester = currentUser && s.requester_staff_name.toLowerCase().includes(currentUser.name.toLowerCase());
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

        {/* TAB 4: LEAVE APPLICATIONS */}
        {activeTab === 'leave' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <form onSubmit={submitLeaveApplication} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">St Vincent's Leave Application</h2>
                <p className="text-xs text-slate-500">Submits to database and automatically downloads ready-to-sign PDF.</p>
              </div>

              {leaveSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded text-xs">
                  {leaveSuccess}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Staff Name</label>
                  <input
                    type="text"
                    value={leaveForm.staff_name}
                    onChange={(e) => setLeaveForm({ ...leaveForm, staff_name: e.target.value })}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
                <div>
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
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">End Date</label>
                  <input
                    type="date"
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full border p-2 rounded"
                    required
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
                {leaveSubmitting ? "Submitting..." : "Submit Application & Download Official PDF"}
              </button>
            </form>

            {/* List */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-sm">Past Leave Applications</h3>
              {leaveApplications.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No leave applications recorded yet.</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {leaveApplications.map(app => (
                    <div key={app.id} className="border p-3 rounded text-xs flex items-center justify-between bg-slate-50">
                      <div>
                        <div className="font-bold text-slate-900">{app.staff_name} — {app.leave_type}</div>
                        <div className="text-slate-500">{formatDDMMYYYY(app.start_date)} to {formatDDMMYYYY(app.end_date)} ({app.leave_hours || 'N/A'} hrs)</div>
                      </div>
                      <button
                        onClick={() => generateLeavePdf(app)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: ROSTER INGESTION */}
        {activeTab === 'upload' && (
          <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-4 text-center">
            <Upload className="w-10 h-10 text-blue-600 mx-auto" />
            <h2 className="text-lg font-bold text-slate-800">In-Browser Excel Roster Uploader</h2>
            <p className="text-xs text-slate-500">
              Drag-and-drop or select new schedule spreadsheets (SMS, GICC, Journal Club). Parsed client-side and committed directly to the database.
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

      {/* SWAP MODAL */}
      {swapModalOpen && selectedEntryToSwap && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-slate-800">Request Shift Swap</h3>
            <p className="text-xs text-slate-500">
              Shift: <span className="font-semibold text-slate-800">{selectedEntryToSwap.title}</span> on {selectedEntryToSwap.date}
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
                    setStatusMsg("Coordinator PIN verified!");
                  } else {
                    alert("Incorrect PIN");
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
