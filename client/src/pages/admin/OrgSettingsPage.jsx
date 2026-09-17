import React, { useState, useEffect } from 'react';
import { Building, Briefcase, Plus, Trash2, Edit2, X, Save, Check, AlertCircle } from 'lucide-react';
import api from '../../api/client';
import ShiftSettingsPanel from '../../components/admin/ShiftSettingsPanel';
// import SalaryStructurePanel from '../../components/admin/SalaryStructurePanel';
import HolidayCalendarPanel from '../../components/admin/HolidayCalendarPanel';
import OfficeLocationPanel from '../../components/admin/OfficeLocationPanel';
import { useToast } from '../../context/ToastContext';
import Tooltip from '../../components/common/Tooltip';

const OrgSettingsPage = () => {
  const toast = useToast();
  const [tab, setTab] = useState('departments');
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // null = create
  const [form, setForm] = useState({ name: '', code: '', description: '', title: '', department: '' });

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [deptRes, desigRes] = await Promise.all([
        api.get('/departments'),
        api.get('/designations'),
      ]);
      if (deptRes.data.success) setDepartments(deptRes.data.departments);
      if (desigRes.data.success) setDesignations(desigRes.data.designations);
    } catch (error) {
      toast.error('Failed to load organization settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openCreateModal = () => {
    setEditing(null);
    setForm({ name: '', code: '', description: '', title: '', department: departments[0]?._id || '' });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditing(item);
    if (tab === 'departments') {
      setForm({ name: item.name, code: item.code || '', description: item.description || '', title: '', department: '' });
    } else {
      setForm({ name: '', code: '', description: item.description || '', title: item.title, department: item.department?._id || '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (tab === 'departments') {
        const payload = { name: form.name, code: form.code, description: form.description };
        const res = editing
          ? await api.put(`/departments/${editing._id}`, payload)
          : await api.post('/departments', payload);
        if (res.data.success) toast.success(res.data.message);
      } else {
        const payload = { title: form.title, department: form.department || null, description: form.description };
        const res = editing
          ? await api.put(`/designations/${editing._id}`, payload)
          : await api.post('/designations', payload);
        if (res.data.success) toast.success(res.data.message);
      }
      setShowModal(false);
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Something went wrong');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (item) => {
    const label = tab === 'departments' ? item.name : item.title;
    if (!window.confirm(`Delete '${label}'? This cannot be undone.`)) return;
    try {
      const endpoint = tab === 'departments' ? `/departments/${item._id}` : `/designations/${item._id}`;
      const res = await api.delete(endpoint);
      if (res.data.success) {
        toast.success(res.data.message);
        fetchAll();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete');
    }
  };

  const list = tab === 'departments' ? departments : designations;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Organization Settings
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage the master list of departments and designations used across the organization.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add {tab === 'departments' ? 'Department' : 'Designation'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab('departments')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            tab === 'departments'
              ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-300 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building className="w-4 h-4" />
          Departments
        </button>
        <button
          onClick={() => setTab('designations')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
            tab === 'designations'
              ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-300 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Designations
        </button>
      </div>

      {/* List */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm dark:shadow-card">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm">Loading...</span>
          </div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm">
              No {tab} yet. Click "Add {tab === 'departments' ? 'Department' : 'Designation'}" to create one.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">{tab === 'departments' ? 'Department' : 'Designation'}</th>
                  {tab === 'departments' && <th className="px-6 py-4">Code</th>}
                  {tab === 'designations' && <th className="px-6 py-4">Department</th>}
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {list.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                      {tab === 'departments' ? item.name : item.title}
                    </td>
                    {tab === 'departments' && (
                      <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{item.code || '—'}</td>
                    )}
                    {tab === 'designations' && (
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{item.department?.name || '—'}</td>
                    )}
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{item.description || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip label={tab === 'departments' ? 'Edit department' : 'Edit designation'} side="top">
                          <button aria-label={tab === 'departments' ? 'Edit department' : 'Edit designation'}
                            onClick={() => openEditModal(item)}
                            className="p-1.5 rounded-lg bg-brand-600/15 hover:bg-brand-600 text-brand-700 dark:text-brand-300 hover:text-white transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip label={tab === 'departments' ? 'Delete department' : 'Delete designation'} side="top">
                          <button aria-label={tab === 'departments' ? 'Delete department' : 'Delete designation'}
                            onClick={() => handleDelete(item)}
                            className="p-1.5 rounded-lg bg-rose-600/15 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Edit' : 'Add'} {tab === 'departments' ? 'Department' : 'Designation'}
              </h3>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {tab === 'departments' ? (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Customer Support"
                      className="theme-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Code</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder="e.g. CS"
                      className="theme-input w-full"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Title *</label>
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Support Engineer"
                      className="theme-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Department</label>
                    <select
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="theme-input w-full"
                    >
                      <option value="">Unassigned</option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="theme-input w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : editing ? (
                    <Save className="w-4 h-4" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {editing ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ShiftSettingsPanel />
      <OfficeLocationPanel />
      {/* <SalaryStructurePanel /> */}
      <HolidayCalendarPanel />
    </div>
  );
};

export default OrgSettingsPage;
