// MICTU Portal: script.js (connected to the Django backend)

// Backend address. Change this to your hosted backend URL when you deploy.
const API = "http://127.0.0.1:8000/api";

// --- SCROLL ANIMATIONS ---
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('active');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});

// --- STATE ---
let token = sessionStorage.getItem('mictu_token');
let currentUser = null;
let role = null;          // 'student' or 'supervisor' (supervisors and admins share that view)
let internsCache = [];
let todayRecord = null;

// --- HELPERS ---
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(iso) { return new Date(iso).toLocaleString(); }
function formatTime(iso) { return new Date(iso).toLocaleTimeString(); }
function todayKey() { return new Date().toLocaleDateString('en-CA'); }

function errorText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
    .join(' | ');
}

function clearSession() {
  token = null; currentUser = null; role = null;
  internsCache = []; todayRecord = null;
  sessionStorage.removeItem('mictu_token');
}

async function api(path, { method = 'GET', body = null, isForm = false } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Token ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }

  let data = null;
  try { data = await res.json(); } catch (err) { }

  if (!res.ok) {
    if (res.status === 401 && token) {
      clearSession();
      updateNavState();
      throw new Error('Your session expired. Please log in again.');
    }
    throw new Error(errorText(data) || `Request failed (${res.status}).`);
  }
  return data;
}

// --- UTILITIES ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  let styleClasses = 'bg-white border-y border-r border-slate-200 shadow-xl';
  let icon = '<i class="fas fa-info-circle text-slate-400 text-lg"></i>';

  if (type === 'success') {
    styleClasses = 'bg-white border-y border-r border-slate-200 border-l-4 border-l-emerald-500 shadow-xl';
    icon = '<i class="fas fa-check-circle text-emerald-500 text-lg"></i>';
  } else if (type === 'error') {
    styleClasses = 'bg-white border-y border-r border-slate-200 border-l-4 border-l-primary-600 shadow-xl';
    icon = '<i class="fas fa-exclamation-triangle text-primary-600 text-lg"></i>';
  }

  toast.className = `${styleClasses} px-5 py-4 rounded-r-xl flex items-center gap-3 toast-enter max-w-sm text-slate-900`;
  toast.innerHTML = `${icon} <span class="text-sm font-medium leading-tight">${esc(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function switchView(viewId) {
  ['view-landing', 'view-student', 'view-supervisor'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
  window.scrollTo(0, 0);

  if (viewId === 'view-landing') {
    document.querySelectorAll('.reveal').forEach(el => {
      el.classList.remove('active');
      setTimeout(() => el.classList.add('active'), 50);
    });
  }
}

function goHome() {
  if (!role) switchView('view-landing');
}

// --- AUTHENTICATION & ROUTING ---
function updateNavState() {
  const pubLinks = document.getElementById('nav-public-links');
  const privLinks = document.getElementById('nav-private-links');
  const mobContainer = document.getElementById('nav-mobile-container');
  const idBtn = document.getElementById('nav-id-btn');
  const greeting = document.getElementById('nav-user-greeting');

  document.getElementById('mobile-menu').classList.add('hidden');

  if (role) {
    pubLinks.classList.add('hidden');
    privLinks.classList.remove('hidden');
    privLinks.classList.add('flex');
    greeting.textContent = `Hi, ${currentUser.full_name.split(' ')[0]}`;

    if (role === 'student') {
      idBtn.classList.remove('hidden');
      idBtn.classList.add('flex');
      mobContainer.innerHTML = `
        <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student Access</div>
        <button onclick="openIdCardModal()" class="w-full text-left px-4 py-3 text-primary-700 font-bold rounded-xl bg-primary-50"><i class="fas fa-id-badge mr-2 text-primary-600"></i> View ID Card</button>
        <button onclick="logoutUser()" class="w-full text-left px-4 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl mt-2"><i class="fas fa-sign-out-alt mr-2"></i> Disconnect</button>
      `;
      renderStudentDashboard();
      switchView('view-student');
    } else {
      idBtn.classList.add('hidden');
      idBtn.classList.remove('flex');
      mobContainer.innerHTML = `
        <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Admin Override</div>
        <button onclick="logoutUser()" class="w-full text-left px-4 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl mt-2"><i class="fas fa-sign-out-alt mr-2"></i> Disconnect</button>
      `;
      renderSupervisorDashboard();
      switchView('view-supervisor');
    }
  } else {
    pubLinks.classList.remove('hidden');
    privLinks.classList.add('hidden');
    privLinks.classList.remove('flex');
    mobContainer.innerHTML = `
      <button onclick="openAuthModal('login', 'supervisor')" class="w-full text-left px-4 py-3 text-slate-600 font-medium hover:bg-slate-50 rounded-xl">Staff Login</button>
      <button onclick="openAuthModal('register', 'student')" class="w-full px-4 py-3 bg-primary-600 text-white font-bold rounded-xl mt-2 shadow-md">Apply Now</button>
    `;
    switchView('view-landing');
  }
}

async function logoutUser() {
  try { await api('/auth/logout/', { method: 'POST' }); } catch (err) { }
  clearSession();
  updateNavState();
  showToast('Disconnected securely.', 'info');
}

// --- AUTH MODAL LOGIC ---
let amMode = 'login';
let amRole = 'student';
let uploadedImageBase64 = null;

function previewImage(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      uploadedImageBase64 = e.target.result;
      document.getElementById('upload-placeholder').classList.add('hidden');
      document.getElementById('upload-preview-container').classList.remove('hidden');
      document.getElementById('upload-preview-img').src = uploadedImageBase64;
      document.getElementById('upload-filename').textContent = input.files[0].name;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function resetImageUpload() {
  document.getElementById('reg-picture').value = '';
  uploadedImageBase64 = null;
  document.getElementById('upload-placeholder').classList.remove('hidden');
  document.getElementById('upload-preview-container').classList.add('hidden');
  document.getElementById('upload-preview-img').src = '';
}

function clearImageUpload(event) {
  event.preventDefault();
  event.stopPropagation();
  resetImageUpload();
}

function openAuthModal(mode, r) {
  amMode = mode; amRole = r;
  updateAuthUI();
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('auth-modal').classList.add('flex');
  document.getElementById('mobile-menu').classList.add('hidden');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-modal').classList.remove('flex');
}

function switchAuthMode(m) { amMode = m; updateAuthUI(); }
function switchAuthRole(r) { amRole = r; updateAuthUI(); }

function updateAuthUI() {
  // Only students can self-register. Staff accounts are created by an admin.
  if (amMode === 'register') amRole = 'student';

  const tLog = document.getElementById('auth-tab-login');
  const tReg = document.getElementById('auth-tab-register');

  if (amMode === 'login') {
    tLog.className = "flex-1 py-4 text-center font-bold text-primary-700 border-b-2 border-primary-600 bg-primary-50/50";
    tReg.className = "flex-1 py-4 text-center font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 border-b-2 border-transparent transition-colors";
  } else {
    tReg.className = "flex-1 py-4 text-center font-bold text-primary-700 border-b-2 border-primary-600 bg-primary-50/50";
    tLog.className = "flex-1 py-4 text-center font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 border-b-2 border-transparent transition-colors";
  }

  const bStu = document.getElementById('role-btn-student');
  const bSup = document.getElementById('role-btn-supervisor');
  if (amRole === 'student') {
    bStu.className = "flex-1 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 shadow-sm rounded-lg transition-all";
    bSup.className = "flex-1 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 rounded-lg transition-all";
  } else {
    bSup.className = "flex-1 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 shadow-sm rounded-lg transition-all";
    bStu.className = "flex-1 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 rounded-lg transition-all";
  }

  ['form-login-student', 'form-login-supervisor', 'form-register-student', 'form-register-supervisor'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(`form-${amMode}-${amRole}`).classList.remove('hidden');
}

async function handleAuthSubmit(e, mode, r) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const email = form.querySelector('input[type="email"]');
  const password = form.querySelector('input[type="password"]');

  if (mode === 'register' && r !== 'student') {
    return showToast('Staff accounts are created by an administrator.', 'error');
  }

  try {
    if (btn) btn.disabled = true;
    let result;

    if (mode === 'login') {
      result = await api('/auth/login/', {
        method: 'POST',
        body: { email: email.value.trim(), password: password.value },
      });
    } else {
      const file = document.getElementById('reg-picture').files[0];
      if (!file) return showToast('Please upload a picture for your ID.', 'error');
      if (file.size > 2 * 1024 * 1024) return showToast('Picture must be 2 MB or smaller.', 'error');
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        return showToast('Picture must be a JPG or PNG.', 'error');
      }

      const fd = new FormData();
      fd.append('full_name', document.getElementById('reg-name').value.trim());
      fd.append('reg_number', document.getElementById('reg-number').value.trim());
      fd.append('phone', document.getElementById('reg-phone').value.trim());
      fd.append('email', email.value.trim());
      fd.append('password', password.value);
      fd.append('department', document.getElementById('reg-dept').value.trim());
      fd.append('level', parseInt(document.getElementById('reg-level').value, 10));
      fd.append('photo', file);
      result = await api('/auth/register/', { method: 'POST', body: fd, isForm: true });
    }

    token = result.token;
    sessionStorage.setItem('mictu_token', token);
    currentUser = result.user;
    role = currentUser.role === 'student' ? 'student' : 'supervisor';

    closeAuthModal();
    form.reset();
    if (mode === 'register') resetImageUpload();
    showToast(mode === 'register' ? 'Registration complete. Security ID Generated.' : 'Authentication accepted.', 'success');
    updateNavState();
    if (mode === 'register') setTimeout(openIdCardModal, 500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- STUDENT DASHBOARD ---
function renderAttendance() {
  const btn = document.getElementById('btn-clock-in');
  const status = document.getElementById('attendance-status');

  if (!todayRecord) {
    btn.textContent = 'Clock In Now';
    btn.className = 'bg-slate-900 text-white hover:bg-slate-800 font-bold py-2.5 px-6 rounded-xl transition-all w-full md:w-auto shadow-md';
    status.innerHTML = '<i class="fas fa-circle text-slate-300 text-xs mr-1"></i> Not Clocked In';
  } else {
    btn.textContent = 'Active (Clocked In)';
    btn.className = 'bg-primary-50 text-primary-600 font-bold py-2.5 px-6 rounded-xl w-full md:w-auto cursor-default pointer-events-none border border-primary-200';
    status.innerHTML = `<i class="fas fa-check-circle text-primary-600 mr-1"></i> Clocked In at ${esc(formatTime(todayRecord.clock_in))}`;
  }
}

async function clockIn() {
  const btn = document.getElementById('btn-clock-in');
  btn.disabled = true;
  try {
    todayRecord = await api('/me/attendance/clock-in/', { method: 'POST' });
    renderAttendance();
    showToast('System log registered.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function renderStudentDashboard() {
  document.getElementById('dash-student-name').textContent = currentUser.full_name.split(' ')[0];
  document.getElementById('dash-student-id').textContent = currentUser.profile ? currentUser.profile.intern_id : '';

  try {
    const [announcements, feedback, attendance] = await Promise.all([
      api('/announcements/'), api('/me/feedback/'), api('/me/attendance/'),
    ]);

    const list = document.getElementById('student-announcements-list');
    list.innerHTML = announcements.length === 0
      ? `<p class="text-slate-400 text-sm italic text-center py-4">No global transmissions yet.</p>`
      : announcements.map(a => `
        <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm shrink-0">
          <p class="text-slate-800 font-medium mb-2 whitespace-pre-line">${esc(a.body)}</p>
          <div class="flex justify-between items-center text-xs border-t border-slate-200 pt-2">
            <span class="text-slate-500 font-mono">${esc(formatDate(a.created_at))}</span>
            <span class="text-slate-500">${esc(a.author || '')}</span>
          </div>
        </div>
      `).join('');

    const fbList = document.getElementById('student-feedback-list');
    fbList.innerHTML = feedback.length === 0
      ? `<div class="text-center py-6 text-slate-400"><i class="fas fa-shield-alt text-2xl mb-2 opacity-50"></i><p class="text-sm">No encrypted feedback available.</p></div>`
      : feedback.map(f => `
        <div class="p-4 bg-primary-50 border border-primary-200 rounded-xl text-sm border-l-4 border-l-primary-600 shrink-0">
          <p class="text-slate-800 font-medium mb-2 whitespace-pre-line">${esc(f.message)}</p>
          <div class="flex justify-between items-center text-xs mt-1 pt-2 border-t border-primary-900/10">
            <span class="text-primary-700 font-bold"><i class="fas fa-user-tie mr-1"></i>${esc(f.sender_name || 'Staff')}</span>
            <span class="text-slate-500 font-mono">${esc(formatDate(f.created_at))}</span>
          </div>
        </div>
      `).join('');

    todayRecord = attendance.find(r => r.date === todayKey()) || null;
    renderAttendance();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- SUPERVISOR DASHBOARD ---
async function renderSupervisorDashboard() {
  try {
    const [interns, stats, announcements] = await Promise.all([
      api('/staff/interns/'), api('/staff/stats/'), api('/announcements/'),
    ]);
    internsCache = interns;

    document.getElementById('sup-stat-total').textContent = stats.total_interns;
    document.getElementById('sup-stat-announcements').textContent = announcements.length;

    const list = document.getElementById('supervisor-intern-list');
    const empty = document.getElementById('sup-empty-state');

    if (interns.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden'); empty.classList.add('flex');
    } else {
      empty.classList.add('hidden'); empty.classList.remove('flex');
      list.innerHTML = interns.map((s, i) => `
        <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
          <td class="px-6 py-4">
            <p class="font-bold text-sm text-slate-900">${esc(s.full_name)}</p>
            <p class="text-xs text-primary-600 font-mono mt-0.5">${esc(s.intern_id)}</p>
          </td>
          <td class="px-6 py-4">
            <p class="text-xs text-slate-600 font-medium"><i class="fab fa-whatsapp text-emerald-500 mr-1 text-sm"></i> ${esc(s.phone)}</p>
          </td>
          <td class="px-6 py-4"><p class="text-xs text-slate-700 font-medium bg-slate-100 border border-slate-200 inline-block px-2 py-1 rounded-md">${esc(s.department)} (${esc(s.level)}lvl)</p></td>
          <td class="px-6 py-4 text-right">
            <button onclick="openFeedbackModal(${i})" class="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 text-xs font-bold transition-colors">Message</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- SUPERVISOR ACTIONS ---
let selectedStudentIdx = null;

function openFeedbackModal(idx) {
  selectedStudentIdx = idx;
  document.getElementById('feedback-student-name').textContent = internsCache[idx].full_name;
  document.getElementById('feedback-text').value = '';
  document.getElementById('feedback-modal').classList.remove('hidden');
  document.getElementById('feedback-modal').classList.add('flex');
}
function closeFeedbackModal() { document.getElementById('feedback-modal').classList.add('hidden'); }

async function submitFeedback() {
  const message = document.getElementById('feedback-text').value.trim();
  if (!message) return showToast('Cannot send empty data block.', 'error');

  const student = internsCache[selectedStudentIdx];
  try {
    await api('/staff/feedback/', { method: 'POST', body: { student: student.user_id, message } });
    closeFeedbackModal();
    showToast(`Private feedback routed to ${student.full_name}'s dashboard.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openAnnouncementModal() {
  document.getElementById('announcement-text').value = '';
  document.getElementById('announcement-modal').classList.remove('hidden');
  document.getElementById('announcement-modal').classList.add('flex');
}
function closeAnnouncementModal() { document.getElementById('announcement-modal').classList.add('hidden'); }

async function submitAnnouncement() {
  const text = document.getElementById('announcement-text').value.trim();
  const push = document.getElementById('push-whatsapp').checked;
  if (!text) return showToast('Transmission cannot be empty.', 'error');

  try {
    const title = text.length > 60 ? text.slice(0, 60) + '...' : text;
    await api('/announcements/', { method: 'POST', body: { title, body: text } });
    closeAnnouncementModal();
    renderSupervisorDashboard();

    if (push) {
      if (internsCache.length > 0) {
        const phone = internsCache[0].phone.replace(/\D/g, '');
        const msg = `*MICTU Portal Alert:*\n\n${text}\n\n_- Dispatched by ${currentUser.full_name}_`;
        showToast('Opening external WhatsApp link...', 'success');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
      } else {
        showToast('Dashboard updated. No students in DB to receive WhatsApp push.', 'info');
      }
    } else {
      showToast('Broadcast distributed to all dashboards.', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- ID CARD LOGIC ---
function openIdCardModal() {
  if (!currentUser || role !== 'student' || !currentUser.profile) return;
  const p = currentUser.profile;

  const imgElement = document.getElementById('card-picture');
  const placeholderElement = document.getElementById('card-picture-placeholder');

  if (p.photo) {
    imgElement.crossOrigin = 'anonymous';
    imgElement.src = p.photo;
    imgElement.classList.remove('hidden');
    placeholderElement.classList.add('hidden');
  } else {
    imgElement.classList.add('hidden');
    placeholderElement.classList.remove('hidden');
  }

  document.getElementById('card-name').textContent = currentUser.full_name;
  document.getElementById('card-regnum').textContent = p.reg_number;
  document.getElementById('card-dept').textContent = p.department;
  document.getElementById('card-level').textContent = `${p.level}lvl`;
  document.getElementById('card-intern-id').textContent = p.intern_id;

  const qrCont = document.getElementById('card-qrcode');
  qrCont.innerHTML = '';
  new QRCode(qrCont, {
    text: `${API}/verify/${p.qr_token}/`,
    width: 55, height: 55, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L
  });

  document.getElementById('id-card-modal').classList.remove('hidden');
  document.getElementById('id-card-modal').classList.add('flex');
}

function closeIdCardModal() { document.getElementById('id-card-modal').classList.add('hidden'); }

function downloadIDCard() {
  const card = document.getElementById('printable-id-card');
  const btn = document.getElementById('btn-download-id');
  const ogHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

  setTimeout(() => {
    html2canvas(card, { scale: 3, backgroundColor: null, useCORS: true }).then(canvas => {
      const link = document.createElement('a');
      link.download = `${currentUser.profile.intern_id}_ID_CARD.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      btn.innerHTML = ogHtml;
      showToast('Clearance Document Downloaded.', 'success');
    }).catch(() => {
      showToast('Rendering error.', 'error');
      btn.innerHTML = ogHtml;
    });
  }, 100);
}

// --- INIT: restore the login if the page is refreshed ---
async function init() {
  if (token) {
    try {
      currentUser = await api('/auth/me/');
      role = currentUser.role === 'student' ? 'student' : 'supervisor';
    } catch (err) {
      clearSession();
    }
  }
  updateNavState();
}
init();
