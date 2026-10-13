import React, { useState, useEffect } from 'react';
import { Download, Save, RefreshCw, Plus, Trash2, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { api } from './api';
import { exportBulletinDocx } from './bulletinDocx';

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  return d.toLocaleDateString('en-AU', options);
}

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatWeekTitle(mondayStr) {
  if (!mondayStr) return '';
  const [y, m, d] = mondayStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = getOrdinal(date.getDate());
  const monthName = date.toLocaleDateString('en-AU', { month: 'long' });
  const year = date.getFullYear();
  return `week beginning ${day} ${monthName} ${year}`;
}

export default function BulletinManager({ weekMonday, rosterEntries, currentUser }) {
  const [bulletinNumber, setBulletinNumber] = useState('146');
  const [contacts, setContacts] = useState('Please contact Anne or Aathira if you would like to \ninclude something in the Bulletin');
  const [meetings, setMeetings] = useState([]);
  const [wardTeam, setWardTeam] = useState([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const weekTitle = formatWeekTitle(weekMonday);

  // Initialize or load bulletin
  useEffect(() => {
    loadBulletin();
  }, [weekMonday, rosterEntries]);

  const loadBulletin = async () => {
    const saved = await api.getBulletin(weekMonday);
    if (saved) {
      setBulletinNumber(saved.bulletinNumber || '146');
      setContacts(saved.contacts || 'Please contact Anne or Aathira if you would like to \ninclude something in the Bulletin');
      setMeetings(saved.meetings || []);
      setWardTeam(saved.wardTeam || []);
    } else {
      generateDefaultBulletin();
    }
  };

  const generateDefaultBulletin = () => {
    // Filter shifts for this week
    const currentWeekEntries = rosterEntries.filter(e => {
      const d = new Date(e.date);
      const m = new Date(weekMonday);
      const diff = (d - m) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff < 7;
    });

    const mondayDate = new Date(weekMonday);
    const mDayStr = formatDisplayDate(weekMonday);
    
    const wedDate = new Date(mondayDate);
    wedDate.setDate(wedDate.getDate() + 2);
    const wDayStr = formatDisplayDate(wedDate.toISOString().slice(0, 10));

    const friDate = new Date(mondayDate);
    friDate.setDate(friDate.getDate() + 4);
    const fDayStr = formatDisplayDate(friDate.toISOString().slice(0, 10));

    // Pull from imported roster if available
    const giccEntries = currentWeekEntries.filter(e => e.entry_type === 'gicc');
    const giccChair = giccEntries.find(e => e.title?.toLowerCase().includes('chair'))?.staff_name || 'Emma Flanagan';
    const giccPresenters = giccEntries
      .filter(e => !e.title?.toLowerCase().includes('chair'))
      .map(e => e.staff_name)
      .join(' / ') || 'Colorectal';

    const jcEntries = currentWeekEntries.filter(e => e.entry_type === 'friday_jc');
    const jcPresenter = jcEntries.map(e => e.staff_name).join(', ') || 'Dan Tassone';

    const ibdMeeting = currentWeekEntries.find(e => e.entry_type === 'ibd_meeting')?.staff_name || 'Clinical Trials update John Ding';

    const defaultMeetings = [
      { day: mDayStr, time: '08:00 – 08:30', name: 'IBD MDM', location: 'Via Teams', details: '' },
      { day: mDayStr, time: '08:30 – 09:00', name: 'IBD UNIT MEETING', location: 'Via Zoom', details: ibdMeeting },
      { day: mDayStr, time: '12:15 – 13:00', name: 'HCC MDM', location: 'Via Teams', details: '' },
      { day: mDayStr, time: '12:30 – 13:45', name: 'Medical Grand Rounds Gastroenterology', location: 'ACMD auditorium or Via Teams', details: 'Presenters: Michael Kamm, Sasha Fehily, Erin Russell & Emily Wright' },
      { day: mDayStr, time: '17:00 – 18:00', name: 'GICC', location: 'Via Zoom', details: `Chair: ${giccChair} Presenting: ${giccPresenters}` },
      { day: wDayStr, time: '12:30 – 13:30', name: 'Liver Research Meeting', location: 'Via Zoom', details: 'Jennifer Fang' },
      { day: fDayStr, time: '12:30 – 13:00', name: 'Ward Audit', location: 'Via Zoom', details: '' },
      { day: fDayStr, time: '13:00 – 13:30', name: 'Journal Club', location: 'Via Zoom', details: jcPresenter },
      { day: fDayStr, time: '13:45 – 14:45', name: 'XR/Path meeting', location: 'Via Zoom', details: '' },
    ];

    // Ward team mapping
    const ibdStaff = currentWeekEntries.filter(e => e.entry_type === 'ibd_wards').map(e => e.staff_name).join('; ') || 'Sasha Fehily; Evangelia Dendrinos';
    const liverStaff = currentWeekEntries.filter(e => e.entry_type === 'liver_wards').map(e => e.staff_name).join('; ') || 'Jessica Howell; Julian Atlas';
    const consultStaff = currentWeekEntries.filter(e => e.entry_type === 'consults').map(e => e.staff_name).join('; ') || 'Emily Wright; Dan Tassone';
    const oncallStaff = currentWeekEntries.filter(e => e.entry_type === 'hm_oncall').map(e => e.staff_name).join(', ') || 'Kyle Wu (Mon); Declan Connoley (Tues-Wed); Kyle Wu (Thurs); Nick Clark (Fri-Sun)';

    const defaultWardTeam = [
      { role: 'GASTRO - IBD', staff: ibdStaff },
      { role: 'GASTRO – LIVER', staff: liverStaff },
      { role: 'CONSULTS', staff: consultStaff },
      { role: 'URGENT ENDOSCOPY', staff: oncallStaff },
      { role: 'HMOs', staff: 'Kieran McKenna; David Motorniak; Lydia Treleaven; Isabella Sawyer/Lauren Magill (Job share)' },
      { role: 'HMO SVOP', staff: 'Lydia Treleaven' },
    ];

    setMeetings(defaultMeetings);
    setWardTeam(defaultWardTeam);
  };

  const handleSave = async () => {
    const data = { bulletinNumber, contacts, meetings, wardTeam };
    await api.saveBulletin(weekMonday, data);
    setSaveStatus('Bulletin saved successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportBulletinDocx({
        bulletinNumber,
        weekTitle,
        contacts,
        meetings,
        wardTeam,
      });
    } catch (err) {
      console.error(err);
      alert('Error exporting document: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const updateMeeting = (idx, field, val) => {
    const next = [...meetings];
    next[idx] = { ...next[idx], [field]: val };
    setMeetings(next);
  };

  const addMeeting = () => {
    setMeetings([...meetings, { day: 'Monday', time: '12:00 – 13:00', name: 'New Meeting', location: 'Via Zoom', details: '' }]);
  };

  const removeMeeting = (idx) => {
    setMeetings(meetings.filter((_, i) => i !== idx));
  };

  const updateWard = (idx, field, val) => {
    const next = [...wardTeam];
    next[idx] = { ...next[idx], [field]: val };
    setWardTeam(next);
  };

  const addWard = () => {
    setWardTeam([...wardTeam, { role: 'NEW ROLE', staff: 'Staff Name' }]);
  };

  const removeWard = (idx) => {
    setWardTeam(wardTeam.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-red-100 text-red-800 text-xs px-2.5 py-0.5 rounded-full font-bold">Bulletin Editor</span>
            <span className="text-xs text-slate-500">For Anne Savage & Aathira</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Weekly Bulletin & Meeting Schedule</h2>
          <p className="text-xs text-slate-500">Edit meetings, ward teams, and export to official Word (.docx) format.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={generateDefaultBulletin}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            title="Auto-repopulate from current week roster"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset / Auto-Populate
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Save Changes
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" /> {isExporting ? 'Generating...' : 'Export Word (.docx)'}
          </button>
        </div>
      </div>

      {saveStatus && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {saveStatus}
        </div>
      )}

      {/* Bulletin Meta Settings */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Bulletin Number</label>
          <input
            type="text"
            value={bulletinNumber}
            onChange={(e) => setBulletinNumber(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. 146"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Week Title</label>
          <input
            type="text"
            readOnly
            value={weekTitle}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md p-2 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Notice</label>
          <input
            type="text"
            value={contacts}
            onChange={(e) => setContacts(e.target.value)}
            className="w-full text-xs border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* TABLE 1: MEETINGS */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-blue-600 rounded-full"></span>
            Meetings Schedule ({meetings.length})
          </h3>
          <button
            onClick={addMeeting}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Add Meeting
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b">
                <th className="p-2.5 w-1/5">Day</th>
                <th className="p-2.5 w-1/6">Time</th>
                <th className="p-2.5 w-1/4">Meeting Title</th>
                <th className="p-2.5 w-1/4">Location & Presenter</th>
                <th className="p-2.5 w-12 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {meetings.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="p-2">
                    <input
                      type="text"
                      value={m.day}
                      onChange={(e) => updateMeeting(idx, 'day', e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs focus:border-blue-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={m.time}
                      onChange={(e) => updateMeeting(idx, 'time', e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs focus:border-blue-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => updateMeeting(idx, 'name', e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs font-semibold focus:border-blue-500"
                    />
                  </td>
                  <td className="p-2 space-y-1">
                    <input
                      type="text"
                      value={m.location}
                      onChange={(e) => updateMeeting(idx, 'location', e.target.value)}
                      placeholder="Location (e.g. Via Zoom)"
                      className="w-full p-1 border border-slate-200 rounded text-xs text-slate-600"
                    />
                    <input
                      type="text"
                      value={m.details}
                      onChange={(e) => updateMeeting(idx, 'details', e.target.value)}
                      placeholder="Speakers / extra info"
                      className="w-full p-1 border border-slate-200 rounded text-xs text-slate-500"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => removeMeeting(idx)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded"
                      title="Remove row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLE 2: WARD TEAM */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-600 rounded-full"></span>
            Ward Team (Inpatient & Consults)
          </h3>
          <button
            onClick={addWard}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Add Team Row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b">
                <th className="p-2.5 w-1/4">Service / Role</th>
                <th className="p-2.5 w-2/3">Assigned Staff</th>
                <th className="p-2.5 w-12 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wardTeam.map((w, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="p-2">
                    <input
                      type="text"
                      value={w.role}
                      onChange={(e) => updateWard(idx, 'role', e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs font-semibold focus:border-blue-500"
                    />
                  </td>
                  <td className="p-2">
                    <textarea
                      rows={2}
                      value={w.staff}
                      onChange={(e) => updateWard(idx, 'staff', e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs focus:border-blue-500"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => removeWard(idx)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded"
                      title="Remove row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
