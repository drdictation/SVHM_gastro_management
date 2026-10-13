import { createClient } from '@supabase/supabase-js';
import initialSeed from './seed_data.json';

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

// Init local storage if empty
function initLocalStore() {
  if (!localStorage.getItem(LS_STAFF)) {
    localStorage.setItem(LS_STAFF, JSON.stringify(initialSeed.staff));
  }
  if (!localStorage.getItem(LS_ROSTER)) {
    localStorage.setItem(LS_ROSTER, JSON.stringify(initialSeed.roster));
  }
  if (!localStorage.getItem(LS_SWAPS)) {
    localStorage.setItem(LS_SWAPS, JSON.stringify([]));
  }
  if (!localStorage.getItem(LS_LEAVE)) {
    localStorage.setItem(LS_LEAVE, JSON.stringify([]));
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
      const { data, error } = await supabase.from('roster_entries').insert(entries);
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
      const { data, error } = await supabase.from('leave_applications').select('*').order('created_at', { ascending: false });
      if (!error) return data;
    }
    return JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
  },

  async submitLeave(form) {
    const record = {
      ...form,
      id: Date.now(),
      created_at: new Date().toISOString(),
      status: 'submitted'
    };
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('leave_applications').insert([record]).select();
      if (data && data[0]) return data[0];
    }
    const current = JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
    current.unshift(record);
    localStorage.setItem(LS_LEAVE, JSON.stringify(current));
    return record;
  },

  async updateLeaveStatus(id, status) {
    if (isSupabaseConfigured) {
      await supabase.from('leave_applications').update({ status }).eq('id', id);
    }
    const current = JSON.parse(localStorage.getItem(LS_LEAVE) || '[]');
    const idx = current.findIndex(l => l.id === id);
    if (idx !== -1) {
      current[idx].status = status;
      localStorage.setItem(LS_LEAVE, JSON.stringify(current));
    }
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
  }
};

