import { createClient } from '@supabase/supabase-js';
import initialSeed from './seed_data.json';
import { createDefaultTheatreTemplates } from './theatreGrid';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Local fallback store keys
const LS_STAFF = 'svha_gastro_staff';
const LS_ROSTER = 'svha_gastro_roster';
const LS_SWAPS = 'svha_gastro_swaps';
const LS_LEAVE = 'svha_gastro_leave';
const LS_THEATRE_TEMPLATES = 'svha_gastro_theatre_templates_v2_all_weeks';
const LS_ENDO_OVERRIDES = 'svha_gastro_endo_overrides_v1';
const LS_LEAVE_SEED_VER = 'svha_gastro_leave_seed_v3_theatre';
const LS_ROSTER_SEED_VER = 'svha_gastro_roster_seed_v2_gicc_fjc';

// Init local storage if empty or if leave seed was updated from V2 Dec 26 CSV
function initLocalStore() {
  if (!localStorage.getItem(LS_STAFF)) {
    localStorage.setItem(LS_STAFF, JSON.stringify(initialSeed.staff));
  }
  if (localStorage.getItem(LS_ROSTER_SEED_VER) !== '1') {
    localStorage.setItem(LS_ROSTER, JSON.stringify(initialSeed.roster));
    localStorage.setItem(LS_ROSTER_SEED_VER, '1');
  } else if (!localStorage.getItem(LS_ROSTER)) {
    localStorage.setItem(LS_ROSTER, JSON.stringify(initialSeed.roster));
  }
  if (!localStorage.getItem(LS_SWAPS)) {
    localStorage.setItem(LS_SWAPS, JSON.stringify([]));
  }
  if (!localStorage.getItem(LS_THEATRE_TEMPLATES)) {
    localStorage.setItem(LS_THEATRE_TEMPLATES, JSON.stringify(createDefaultTheatreTemplates()));
  }
  if (!localStorage.getItem(LS_ENDO_OVERRIDES)) {
    localStorage.setItem(LS_ENDO_OVERRIDES, JSON.stringify({}));
  }
  if (localStorage.getItem(LS_LEAVE_SEED_VER) !== '1') {
    localStorage.setItem(LS_STAFF, JSON.stringify(initialSeed.staff));
    localStorage.setItem(LS_LEAVE, JSON.stringify(initialSeed.leave || []));
    localStorage.setItem(LS_LEAVE_SEED_VER, '1');
  } else if (!localStorage.getItem(LS_LEAVE)) {
    localStorage.setItem(LS_LEAVE, JSON.stringify(initialSeed.leave || []));
  }
}
initLocalStore();

export const api = {
  // Staff
  async getStaff() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('staff').select('*').order('name');
      if (!error && data?.length) return data;
    }
    return JSON.parse(localStorage.getItem(LS_STAFF) || '[]');
  },

  // Roster entries
  async getRoster() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('roster_entries').select('*').order('date');
      if (!error && data?.length) return data;
    }
    return JSON.parse(localStorage.getItem(LS_ROSTER) || '[]');
  },

  async bulkAddRoster(entries) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('roster_entries').insert(entries);
      if (error) console.error("Supabase insert error", error);
    }
    const current = JSON.parse(localStorage.getItem(LS_ROSTER) || '[]');
    const next = [...current, ...entries];
    localStorage.setItem(LS_ROSTER, JSON.stringify(next));
    return next;
  },

  async updateRosterEntry(id, patch) {
    if (isSupabaseConfigured) {
      await supabase.from('roster_entries').update(patch).eq('id', id);
    }
    const current = JSON.parse(localStorage.getItem(LS_ROSTER) || '[]');
    const idx = current.findIndex(e => e.id === id);
    if (idx !== -1) {
      current[idx] = { ...current[idx], ...patch };
      localStorage.setItem(LS_ROSTER, JSON.stringify(current));
    }
  },

  // Swaps
  async getSwaps() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('swap_requests').select('*').order('created_at', { ascending: false });
      if (!error) return data;
    }
    return JSON.parse(localStorage.getItem(LS_SWAPS) || '[]');
  },

  async createSwap(swap) {
    const newSwap = {
      ...swap,
      id: Date.now(),
      created_at: new Date().toISOString(),
      status: 'pending_peer'
    };
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('swap_requests').insert([newSwap]).select();
      if (data && data[0]) return data[0];
    }
    const current = JSON.parse(localStorage.getItem(LS_SWAPS) || '[]');
    current.unshift(newSwap);
    localStorage.setItem(LS_SWAPS, JSON.stringify(current));
    return newSwap;
  },

  async updateSwap(id, status, notes = {}) {
    if (isSupabaseConfigured) {
      await supabase.from('swap_requests').update({ status, ...notes }).eq('id', id);
    }
    const current = JSON.parse(localStorage.getItem(LS_SWAPS) || '[]');
    const idx = current.findIndex(s => s.id === id);
    if (idx !== -1) {
      current[idx] = { ...current[idx], status, ...notes };
      localStorage.setItem(LS_SWAPS, JSON.stringify(current));
    }
  },

  // Leave
  async getLeave() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.from('leave_applications').select('*').order('start_date', { ascending: true });
      if (!error && data?.length) return data;
    }
    return JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
  },

  async submitLeave(form) {
    let backendResult = null;
    try {
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        backendResult = await res.json();
      }
    } catch (e) {
      console.warn('Backend /api/leave call note:', e);
    }

    const record = {
      ...form,
      id: backendResult?.id || Date.now(),
      created_at: new Date().toISOString(),
      status: form.status || 'approved',
      email_dispatched: backendResult?.email_dispatched ?? false,
      email_simulated: backendResult?.email_simulated ?? false,
      email_recipients: backendResult?.email_recipients || [],
      email_message: backendResult?.email_message || ''
    };

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase.from('leave_applications').insert([record]).select();
        if (data && data[0]) return { ...data[0], ...record };
      } catch (err) {
        console.warn('Supabase insert error', err);
      }
    }
    const current = JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
    current.unshift(record);
    localStorage.setItem(LS_LEAVE, JSON.stringify(current));
    return record;
  },

  async updateLeave(id, patch) {
    if (isSupabaseConfigured) {
      await supabase.from('leave_applications').update(patch).eq('id', id);
    }
    const current = JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
    const idx = current.findIndex(l => l.id === id);
    if (idx !== -1) {
      current[idx] = { ...current[idx], ...patch };
      localStorage.setItem(LS_LEAVE, JSON.stringify(current));
      return current[idx];
    }
    return null;
  },

  async deleteLeave(id) {
    if (isSupabaseConfigured) {
      await supabase.from('leave_applications').delete().eq('id', id);
    }
    const current = JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
    const next = current.filter(l => l.id !== id);
    localStorage.setItem(LS_LEAVE, JSON.stringify(next));
    return next;
  },

  async bulkImportLeave(records, mode = 'replace') {
    const stamped = records.map((r, i) => ({
      ...r,
      id: r.id || Date.now() + i,
      created_at: r.created_at || new Date().toISOString(),
      status: r.status || 'approved'
    }));
    if (isSupabaseConfigured) {
      if (mode === 'replace') {
        await supabase.from('leave_applications').delete().neq('id', 0);
      }
      await supabase.from('leave_applications').insert(stamped);
    }
    const current = mode === 'replace' ? [] : JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
    const next = [...current, ...stamped];
    localStorage.setItem(LS_LEAVE, JSON.stringify(next));
    return next;
  },

  async updateLeaveStatus(id, status) {
    return this.updateLeave(id, { status });
  },

  // Bulletin
  async getBulletin(weekMonday) {
    const key = `svha_gastro_bulletin_${weekMonday}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  },

  async saveBulletin(weekMonday, bulletinData) {
    const key = `svha_gastro_bulletin_${weekMonday}`;
    localStorage.setItem(key, JSON.stringify(bulletinData));
    return bulletinData;
  },

  // Theatre Grid Templates (Weeks 1-4)
  async getTheatreTemplates() {
    const saved = localStorage.getItem(LS_THEATRE_TEMPLATES);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    const defaults = createDefaultTheatreTemplates();
    localStorage.setItem(LS_THEATRE_TEMPLATES, JSON.stringify(defaults));
    return defaults;
  },

  async saveTheatreTemplates(templates) {
    localStorage.setItem(LS_THEATRE_TEMPLATES, JSON.stringify(templates));
    return templates;
  },

  async resetTheatreTemplates() {
    const defaults = createDefaultTheatreTemplates();
    localStorage.setItem(LS_THEATRE_TEMPLATES, JSON.stringify(defaults));
    return defaults;
  },

  // Endoscopy Per-Date Session Overrides (Cover / Vacant / Cancelled)
  async getEndoOverrides() {
    const saved = localStorage.getItem(LS_ENDO_OVERRIDES);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {};
  },

  async saveEndoOverride(overrideKey, patch) {
    const current = await this.getEndoOverrides();
    if (!patch || (!patch.cover_staff_name && (!patch.status || patch.status === 'scheduled'))) {
      delete current[overrideKey];
    } else {
      current[overrideKey] = {
        ...(current[overrideKey] || {}),
        ...patch,
        updated_at: new Date().toISOString()
      };
    }
    localStorage.setItem(LS_ENDO_OVERRIDES, JSON.stringify(current));
    return current;
  },

  // Clinic Roster
  async getClinicRoster(params = {}) {
    const cleanParams = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    const qs = new URLSearchParams(cleanParams).toString();
    try {
      const res = await fetch(`/api/clinic-roster${qs ? `?${qs}` : ''}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // fallback
    }
    const seed = (await import('./clinic_roster_seed.json')).default;
    let list = JSON.parse(localStorage.getItem('svha_gastro_clinic_roster') || 'null');
    if (!list) {
      list = seed.clinics || [];
      localStorage.setItem('svha_gastro_clinic_roster', JSON.stringify(list));
    }
    if (params.clinic_name) list = list.filter(c => c.clinic_name === params.clinic_name);
    if (params.staff_name) list = list.filter(c => c.staff_name?.toLowerCase().includes(params.staff_name.toLowerCase()));
    if (params.coverage_status) list = list.filter(c => c.coverage_status === params.coverage_status);
    if (params.status) list = list.filter(c => c.status === params.status);
    if (params.start_date) list = list.filter(c => c.date >= params.start_date);
    if (params.end_date) list = list.filter(c => c.date <= params.end_date);
    return list;
  },

  async updateClinicCoverage(id, covering_staff_name, notes) {
    try {
      const res = await fetch(`/api/clinic-roster/${id}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ covering_staff_name, notes })
      });
      if (res.ok) return await res.json();
    } catch (e) {
      // fallback
    }
    const list = JSON.parse(localStorage.getItem('svha_gastro_clinic_roster') || '[]');
    const idx = list.findIndex(c => c.id === id);
    if (idx !== -1) {
      list[idx].covering_staff_name = covering_staff_name || null;
      list[idx].coverage_status = covering_staff_name ? 'covered' : 'uncovered';
      if (notes) list[idx].notes = notes;
      localStorage.setItem('svha_gastro_clinic_roster', JSON.stringify(list));
      return list[idx];
    }
    return null;
  },

  async getLeaveCoverageCoordinator(params = {}) {
    const cleanParams = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    const qs = new URLSearchParams(cleanParams).toString();
    try {
      const res = await fetch(`/api/leave-coverage-coordinator${qs ? `?${qs}` : ''}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // fallback
    }
    return {
      summary: {
        uncovered_clinics: 0,
        covered_clinics: 0,
        theatre_conflicts: 0,
        uncovered_theatre: 0,
        gicc_conflicts: 0,
        jc_conflicts: 0,
        ward_oncall_conflicts: 0,
        approved_leaves_count: 0
      },
      clinic_slots: [],
      theatre_conflicts: [],
      gicc_conflicts: [],
      jc_conflicts: [],
      ward_conflicts: [],
      leaves: []
    };
  },

  async updateTheatreCoverage(id, covering_staff_name, notes) {
    try {
      const res = await fetch(`/api/theatre-grid/${id}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ covering_staff_name, notes })
      });
      if (res.ok) return await res.json();
    } catch (e) {
      // fallback
    }
    return null;
  }
};
