import React, { useState, useEffect } from 'react';
import {
  User,
  MapPin,
  HeartHandshake,
  Calendar,
  Edit3,
  Save,
  X,
  CalendarDays,
  Sparkles,
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  Camera,
  Check,
  Shield,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Download,
  Upload,
  ImagePlus,
  Type,
  Laptop,
  Hash,
  Edit2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import {
  uploadDocument,
  downloadDocument,
  readBlobError,
  uploadAvatar,
  resetAvatar,
  MAX_DOC_MB,
  MAX_PHOTO_MB,
} from '../api/files';
import { buildInitialsAvatar } from '../utils/initialsAvatar';
import { format } from 'date-fns';
import Tooltip from '../components/common/Tooltip';

const ProfilePage = () => {
  const { user, updateUser, isAdmin } = useAuth();
  const toast = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docLoading, setDocLoading] = useState(false);
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  // Modals state
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetForm, setAssetForm] = useState({ title: '', assetNumber: '', assetType: '' });
  const [assetSubmitting, setAssetSubmitting] = useState(false);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passSubmitting, setPassSubmitting] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [newDoc, setNewDoc] = useState({
    name: '',
    type: 'Aadhar Card',
    fileSize: '1.2 MB',
  });

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    avatar: '',
    department: '',
    designation: '',
    role: 'employee',
    status: 'Active',
    address: {
      street: '',
      city: '',
      state: '',
      zip: '',
    },
    emergencyContact: {
      name: '',
      relation: '',
      phone: '',
    },
  });

  const fetchDocuments = async () => {
    if (!user?._id && !user?.id) return;
    try {
      setDocLoading(true);
      const res = await api.get(`/users/${user._id || user.id}/documents`);
      if (res.data.success) {
        setDocuments(res.data.documents || []);
      }
    } catch (err) {
      console.error('Failed to load documents', err);
    } finally {
      setDocLoading(false);
    }
  };

  const fetchAssets = async () => {
    if (!user?._id && !user?.id) return;
    try {
      setAssetsLoading(true);
      const res = await api.get(`/users/${user._id || user.id}/assets`);
      if (res.data.success) {
        setAssets(res.data.assets || []);
      }
    } catch (err) {
      console.error('Failed to load assets', err);
    } finally {
      setAssetsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        dateOfBirth: user.dateOfBirth ? format(new Date(user.dateOfBirth), 'yyyy-MM-dd') : '',
        avatar: user.avatar || '',
        department: user.department || '',
        designation: user.designation || '',
        role: user.role || 'employee',
        status: user.status || 'Active',
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          zip: user.address?.zip || '',
        },
        emergencyContact: {
          name: user.emergencyContact?.name || '',
          relation: user.emergencyContact?.relation || '',
          phone: user.emergencyContact?.phone || '',
        },
      });
      fetchDocuments();
      fetchAssets();
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.put(`/users/${user._id || user.id}`, formData);
      if (res.data.success) {
        updateUser(res.data.employee);
        toast.success('Profile details saved successfully!');
        setIsEditing(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoPicked = async (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      toast.error(`Image is too large. Maximum size is ${MAX_PHOTO_MB} MB.`);
      return;
    }

    try {
      setPhotoUploading(true);
      const res = await uploadAvatar(user._id || user.id, file);
      if (res.data.success) {
        updateUser(res.data.employee);
        setFormData((prev) => ({ ...prev, avatar: res.data.avatar }));
        toast.success('Profile photo updated successfully!');
        setShowAvatarModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload profile photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleUseInitials = async () => {
    try {
      setPhotoUploading(true);
      const res = await resetAvatar(user._id || user.id);
      if (res.data.success) {
        updateUser(res.data.employee);
        setFormData((prev) => ({ ...prev, avatar: res.data.avatar }));
        toast.success('Profile photo set to your initials');
        setShowAvatarModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset profile photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleAddDocument = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please choose a PDF file to upload');
      return;
    }
    if (!newDoc.type) {
      toast.error('Please select a document type');
      return;
    }

    try {
      setUploading(true);
      const res = await uploadDocument(user._id || user.id, {
        file: selectedFile,
        name: newDoc.name,
        type: newDoc.type,
      });
      if (res.data.success) {
        toast.success(res.data.message || 'Document uploaded successfully!');
        setDocuments(res.data.documents || []);
        setShowAddDocModal(false);
        setSelectedFile(null);
        setNewDoc({ name: '', type: 'Aadhar Card', fileSize: '' });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleFilePicked = (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted.');
      return;
    }
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      toast.error(`File is too large. Maximum size is ${MAX_DOC_MB} MB.`);
      return;
    }
    setSelectedFile(file);
    // Default the title to the real filename unless the person typed one.
    setNewDoc((prev) => ({ ...prev, name: prev.name || file.name }));
  };

  const handleDownloadDocument = async (doc) => {
    try {
      await downloadDocument(user._id || user.id, doc);
    } catch (err) {
      toast.error((await readBlobError(err)) || 'Failed to download document');
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      const res = await api.delete(`/users/${user._id || user.id}/documents/${docId}`);
      if (res.data.success) {
        toast.success('Document deleted successfully');
        setDocuments(res.data.documents || []);
      }
    } catch (err) {
      toast.error('Failed to delete document');
    }
  };

  const openAddAsset = () => {
    setEditingAsset(null);
    setAssetForm({ title: '', assetNumber: '', assetType: '' });
    setShowAssetModal(true);
  };

  const openEditAsset = (asset) => {
    setEditingAsset(asset);
    setAssetForm({
      title: asset.title || '',
      assetNumber: asset.assetNumber || '',
      assetType: asset.assetType || '',
    });
    setShowAssetModal(true);
  };

  const handleAssetSubmit = async (e) => {
    e.preventDefault();
    if (!assetForm.title.trim() || !assetForm.assetNumber.trim() || !assetForm.assetType.trim()) {
      toast.error('Please fill in the asset title, asset number, and asset type.');
      return;
    }

    try {
      setAssetSubmitting(true);
      const userId = user._id || user.id;
      const res = editingAsset
        ? await api.put(`/users/${userId}/assets/${editingAsset._id}`, assetForm)
        : await api.post(`/users/${userId}/assets`, assetForm);

      if (res.data.success) {
        toast.success(res.data.message || (editingAsset ? 'Asset updated' : 'Asset added'));
        setAssets(res.data.assets || []);
        setShowAssetModal(false);
        setEditingAsset(null);
        setAssetForm({ title: '', assetNumber: '', assetType: '' });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save asset');
    } finally {
      setAssetSubmitting(false);
    }
  };

  const handleDeleteAsset = async (assetId) => {
    if (!window.confirm('Remove this asset from your profile?')) return;
    try {
      const res = await api.delete(`/users/${user._id || user.id}/assets/${assetId}`);
      if (res.data.success) {
        toast.success('Asset removed successfully');
        setAssets(res.data.assets || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove asset');
    }
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      toast.error('Please enter both current and new passwords.');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long.');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New password and confirm password do not match.');
      return;
    }

    setPassSubmitting(true);
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      if (res.data.success) {
        toast.success(res.data.message || 'Password changed successfully!');
        setShowPasswordModal(false);
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setPassSubmitting(false);
    }
  };

  const handleVerifyDocument = async (docId, newStatus, rejectionReason = '') => {
    try {
      const res = await api.put(`/users/${user._id || user.id}/documents/${docId}/status`, {
        status: newStatus,
        rejectionReason,
      });
      if (res.data.success) {
        toast.success(res.data.message || `Document marked as ${newStatus}`);
        setDocuments(res.data.documents || []);
        setRejectTarget(null);
        setRejectReason('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update document status');
    }
  };

  const submitRejection = (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      toast.error('Please tell the employee what needs correcting.');
      return;
    }
    handleVerifyDocument(rejectTarget._id, 'Rejected', rejectReason);
  };

  const formattedJoiningDate = user?.joiningDate
    ? format(new Date(user.joiningDate), 'MMMM dd, yyyy')
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Profile Banner / Header Card */}
      <div className="relative rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-orange-700 text-white p-6 sm:p-8 shadow-glow overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative group">
              <img
                src={
                  formData.avatar || buildInitialsAvatar(user?.name, user?.email)
                }
                alt={user?.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover border-2 border-white/50"
              />
              <button
                type="button"
                onClick={() => setShowAvatarModal(true)}
                title="Change Profile Picture"
                className="absolute inset-0 bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-white cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                Change
              </button>
              <span
                className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-brand-600 ${
                  user?.status === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{user?.name}</h2>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-amber-500/25 text-amber-100 border border-amber-300/30'
                      : 'bg-white/20 text-white border border-white/30'
                  }`}
                >
                  {user?.role}
                </span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-black/25 text-white/90">
                  {user?.employeeId}
                </span>
              </div>
              <p className="text-white/85 text-sm font-medium">
                {user?.designation} • <span className="text-white font-semibold">{user?.department}</span>
              </p>
              <p className="text-xs text-white/75 mt-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-white/75" />
                Joined on {formattedJoiningDate}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-2 transition-all border border-white/25 shadow-sm"
            >
              <KeyRound className="w-4 h-4" />
              <span>Change Password</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAvatarModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-2 transition-all border border-white/25"
            >
              <Camera className="w-4 h-4" />
              <span>Change Photo</span>
            </button>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all ${
                isEditing
                  ? 'bg-white/15 text-white hover:bg-white/25 border border-white/25'
                  : 'bg-white text-brand-700 hover:bg-white/90'
              }`}
            >
              {isEditing ? (
                <>
                  <X className="w-4 h-4" /> Cancel
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4" /> Edit Profile
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Leave Balance Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Paid Leave Balance
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {user?.leaveBalance?.paid || 0} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">days</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CalendarDays className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Sick Leave Balance
            </span>
            <div className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">
              {user?.leaveBalance?.sick || 0} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">days</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <HeartHandshake className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              Total Available Leaves
            </span>
            <div className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">
              {(user?.leaveBalance?.paid || 0) + (user?.leaveBalance?.sick || 0)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">days</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Profile Info Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Personal & Work Details Card */}
          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm dark:shadow-card transition-colors">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <User className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              General & Work Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Full Name</label>
                <input
                  type="text"
                  disabled={!isEditing || !isAdmin}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="theme-input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Work Email</label>
                <input
                  type="email"
                  disabled={!isEditing || !isAdmin}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="theme-input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Department</label>
                <input
                  type="text"
                  disabled={!isEditing || !isAdmin}
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="theme-input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Designation</label>
                <input
                  type="text"
                  disabled={!isEditing || !isAdmin}
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="theme-input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Phone Number</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="theme-input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Date of Birth</label>
                <input
                  type="date"
                  disabled={!isEditing}
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  className="theme-input w-full text-sm"
                />
              </div>
            </div>
          </div>

          {/* Contact & Emergency Contact Card */}
          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm dark:shadow-card transition-colors">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <MapPin className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Residential & Emergency Contacts
            </h3>

            {/* Address */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Street Address</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.address.street}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, street: e.target.value },
                    })
                  }
                  placeholder="Street / Flat / Colony"
                  className="theme-input w-full text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">City</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.address.city}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, city: e.target.value },
                      })
                    }
                    placeholder="Bengaluru"
                    className="theme-input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">State</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.address.state}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, state: e.target.value },
                      })
                    }
                    placeholder="Karnataka"
                    className="theme-input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1.5">Zip Code</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.address.zip}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, zip: e.target.value },
                      })
                    }
                    placeholder="560064"
                    className="theme-input w-full text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <HeartHandshake className="w-3.5 h-3.5 text-rose-500" />
                Emergency Contact Details
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Contact Name</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.emergencyContact.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emergencyContact: { ...formData.emergencyContact, name: e.target.value },
                      })
                    }
                    placeholder="Full Name"
                    className="theme-input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Relationship</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.emergencyContact.relation}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emergencyContact: {
                          ...formData.emergencyContact,
                          relation: e.target.value,
                        },
                      })
                    }
                    placeholder="e.g. Spouse, Parent"
                    className="theme-input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-400 mb-1">Phone</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.emergencyContact.phone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emergencyContact: { ...formData.emergencyContact, phone: e.target.value },
                      })
                    }
                    placeholder="+91 98765 43210"
                    className="theme-input w-full text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        {isEditing && (
          <div className="flex items-center justify-end gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-brand-500/30 shadow-soft">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Profile Changes
            </button>
          </div>
        )}
      </form>

      {/* EMPLOYEE DOSSIER & DOCUMENTS SECTION */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card space-y-5 transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              Employee Documents & Verification Dossier
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Official compliance documents, appointment letters, government identity, and educational credentials.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddDocModal(true)}
            className="px-4 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/80 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-800 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            Attach Document
          </button>
        </div>

        {docLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            Loading official documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            No documents attached yet. Click "Attach Document" to add appointment letter or ID proof.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <div
                key={doc._id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 hover:border-brand-500/50 transition-all shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {doc.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-medium px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {doc.type}
                      </span>
                      <span>•</span>
                      <span>{doc.fileSize || '—'}</span>
                    </div>
                    {doc.status === 'Rejected' && doc.rejectionReason && (
                      <div className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1">
                        <span className="font-bold">Reason:</span> {doc.rejectionReason}
                      </div>
                    )}
                    {doc.reviewedByName && doc.status !== 'Pending Verification' && (
                      <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        {doc.status} by {doc.reviewedByName}
                        {doc.reviewedAt ? ` on ${new Date(doc.reviewedAt).toLocaleDateString('en-IN')}` : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      doc.status === 'Verified'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
                        : doc.status === 'Rejected'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25'
                    }`}
                  >
                    {doc.status === 'Verified' && <CheckCircle2 className="w-3 h-3" />}
                    {doc.status === 'Rejected' && <XCircle className="w-3 h-3" />}
                    {doc.status === 'Pending Verification' && <Clock className="w-3 h-3" />}
                    {doc.status}
                  </span>

                  {/* Admin verify actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
                      {doc.status !== 'Verified' && (
                        <Tooltip label="Approve and mark verified" side="top">
                          <button aria-label="Approve and mark verified"
                            type="button"
                            onClick={() => handleVerifyDocument(doc._id, 'Verified')}
                            className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      )}
                      {doc.status !== 'Rejected' && (
                        <Tooltip label="Reject document" side="top">
                          <button aria-label="Reject document"
                            type="button"
                            onClick={() => { setRejectTarget(doc); setRejectReason(''); }}
                            className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  )}

                  <Tooltip label={doc.storedName ? 'Download PDF' : 'No file attached to this legacy record'} side="top">
                    <button aria-label={doc.storedName ? 'Download PDF' : 'No file attached to this legacy record'}
                      type="button"
                      onClick={() => handleDownloadDocument(doc)}
                      disabled={!doc.storedName}
                      className="p-1 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>

                  <Tooltip label="Delete document" side="top">
                    <button aria-label="Delete document"
                      type="button"
                      onClick={() => handleDeleteDocument(doc._id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EMPLOYEE ASSETS SECTION */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-card space-y-5 transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Laptop className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              Assigned Assets
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Company property assigned to you — laptop, phone, and other equipment.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddAsset}
            className="px-4 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 hover:bg-brand-100 dark:hover:bg-brand-900/80 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-800 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Asset
          </button>
        </div>

        {assetsLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
            Loading assets...
          </div>
        ) : assets.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            No assets assigned yet. Click "Add Asset" to record a laptop, phone, or other equipment.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assets.map((asset) => (
              <div
                key={asset._id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 hover:border-brand-500/50 transition-all shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {asset.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-medium px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {asset.assetType}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Hash className="w-3 h-3" />
                        {asset.assetNumber}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Tooltip label="Edit asset" side="top">
                    <button aria-label="Edit asset"
                      type="button"
                      onClick={() => openEditAsset(asset)}
                      className="p-1 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Remove asset" side="top">
                    <button aria-label="Remove asset"
                      type="button"
                      onClick={() => handleDeleteAsset(asset._id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD/EDIT ASSET MODAL */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-soft space-y-5 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {editingAsset ? 'Edit Asset' : 'Add Asset'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {editingAsset ? 'Update this asset\'s details' : 'Record a laptop, phone, or other equipment'}
                  </p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  type="button"
                  onClick={() => { setShowAssetModal(false); setEditingAsset(null); }}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleAssetSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Asset Title *
                </label>
                <input
                  type="text"
                  required
                  value={assetForm.title}
                  onChange={(e) => setAssetForm({ ...assetForm, title: e.target.value })}
                  placeholder="e.g. Dell Latitude 5420 Laptop"
                  className="theme-input w-full"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Asset Number *
                </label>
                <input
                  type="text"
                  required
                  value={assetForm.assetNumber}
                  onChange={(e) => setAssetForm({ ...assetForm, assetNumber: e.target.value })}
                  placeholder="e.g. Serial / Asset Tag Number"
                  className="theme-input w-full"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Asset Type *
                </label>
                <input
                  type="text"
                  required
                  list="asset-type-suggestions"
                  value={assetForm.assetType}
                  onChange={(e) => setAssetForm({ ...assetForm, assetType: e.target.value })}
                  placeholder="e.g. Laptop, Mobile Phone, Monitor"
                  className="theme-input w-full"
                />
                <datalist id="asset-type-suggestions">
                  <option value="Laptop" />
                  <option value="Mobile Phone" />
                  <option value="Monitor" />
                  <option value="Keyboard" />
                  <option value="Mouse" />
                  <option value="Headset" />
                  <option value="SIM Card" />
                </datalist>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowAssetModal(false); setEditingAsset(null); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assetSubmitting}
                  className="px-6 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  {assetSubmitting ? 'Saving...' : editingAsset ? 'Save Changes' : 'Add Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROFILE PHOTO MODAL — upload a real photo, or use generated initials */}
      {showAvatarModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-soft space-y-6 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Profile Photo</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Upload a photo, or use your initials
                  </p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  type="button"
                  onClick={() => setShowAvatarModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            {/* Current photo preview */}
            <div className="flex flex-col items-center gap-3">
              <img
                src={formData.avatar || buildInitialsAvatar(user?.name, user?.email)}
                alt={user?.name}
                className="w-24 h-24 rounded-xl object-cover border-2 border-slate-200 dark:border-slate-700 shadow-soft"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Current photo</span>
            </div>

            {/* Choose from gallery */}
            <label
              className={`block cursor-pointer p-5 rounded-xl border-2 border-dashed text-center transition-all ${
                photoUploading
                  ? 'opacity-50 cursor-wait border-slate-300 dark:border-slate-700'
                  : 'border-brand-300 dark:border-brand-800 hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-950/30'
              }`}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={photoUploading}
                onChange={(e) => {
                  handlePhotoPicked(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <ImagePlus className="w-7 h-7 mx-auto text-brand-500 mb-2" />
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {photoUploading ? 'Uploading...' : 'Choose photo from your device'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                JPG, PNG or WEBP · up to {MAX_PHOTO_MB} MB
              </div>
            </label>

            {/* Or use initials */}
            <button
              type="button"
              onClick={handleUseInitials}
              disabled={photoUploading}
              className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 hover:border-brand-400 flex items-center gap-3 transition-all disabled:opacity-50"
            >
              <img
                src={buildInitialsAvatar(user?.name, user?.email)}
                alt="Initials avatar"
                className="w-11 h-11 rounded-xl shrink-0"
              />
              <div className="text-left">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Use my initials instead
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Generated from your name — no photo needed
                </div>
              </div>
            </button>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAvatarModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD DOCUMENT MODAL */}
      {showAddDocModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-soft space-y-5 my-8 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Attach Document</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Upload a document for your profile</p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  type="button"
                  onClick={() => setShowAddDocModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleAddDocument} className="space-y-4 text-xs">
              {/* Real file picker — the PDF itself is uploaded and stored */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  PDF File *
                </label>
                <label
                  className={`block cursor-pointer p-5 rounded-xl border-2 border-dashed text-center transition-all ${
                    selectedFile
                      ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-brand-300 dark:border-brand-800 hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-950/30'
                  }`}
                >
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      handleFilePicked(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  {selectedFile ? (
                    <>
                      <FileText className="w-7 h-7 mx-auto text-emerald-600 mb-2" />
                      <div className="font-bold text-slate-800 dark:text-slate-200 break-all">
                        {selectedFile.name}
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                        {(selectedFile.size / 1024).toFixed(1)} KB · click to choose a different file
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="w-7 h-7 mx-auto text-brand-500 mb-2" />
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        Choose a PDF from your device
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        PDF only · up to {MAX_DOC_MB} MB
                      </div>
                    </>
                  )}
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  value={newDoc.name}
                  onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                  placeholder="e.g. Aadhar_Card.pdf"
                  className="theme-input w-full"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Document Type *
                </label>
                <select
                  value={newDoc.type}
                  onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value })}
                  className="theme-input w-full"
                >
                  <option value="Aadhar Card">Aadhar Card</option>
                  <option value="PAN Card">PAN Card</option>
                  <option value="12th Marksheet">12th Marksheet</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowAddDocModal(false); setSelectedFile(null); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="px-6 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECT DOCUMENT MODAL — a rejection must say what to fix */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-soft space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Reject Document</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-all">
                  {rejectTarget.name}
                </p>
              </div>
            </div>

            <form onSubmit={submitRejection} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reason for rejection *
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. The scan is blurry — please upload a clearer copy."
                  className="theme-input w-full"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  The employee sees this, so they know exactly what to correct.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 sm:p-8 shadow-soft space-y-5 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Update Password</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Secure your account credentials</p>
                </div>
              </div>
              <Tooltip label="Close" side="left">
                <button aria-label="Close"
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4 text-xs">
              {/* Current Password */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Current Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute inset-y-0 left-3.5 my-auto" />
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    placeholder="Enter current password"
                    className="theme-input w-full pl-10 pr-10 text-xs"
                  />
                  <Tooltip label={showCurrentPass ? 'Hide password' : 'Show password'} side="left">
                    <button
                      type="button"
                      aria-label={showCurrentPass ? 'Hide password' : 'Show password'}
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  New Password (min 6 characters) *
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute inset-y-0 left-3.5 my-auto" />
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="Create a new password"
                    className="theme-input w-full pl-10 pr-10 text-xs"
                  />
                  <Tooltip label={showNewPass ? 'Hide password' : 'Show password'} side="left">
                    <button
                      type="button"
                      aria-label={showNewPass ? 'Hide password' : 'Show password'}
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute inset-y-0 left-3.5 my-auto" />
                  <input
                    type="password"
                    required
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    placeholder="Re-enter new password"
                    className="theme-input w-full pl-10 pr-4 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passSubmitting}
                  className="px-6 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {passSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
