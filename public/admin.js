const ADMIN_TOKEN_STORAGE_KEY = 'adminToken';

let adminToken = null;
let currentlyAdmin = false;

let loginBtn, logoutBtn, adminBadge, adminPanel, adminStatusEl;
let loginModal, loginForm, addShiftForm, shiftListEl;

function renderAdminControls(shift) {
  if (!adminToken) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'admin-controls';
  wrapper.innerHTML = `
    <div class="admin-controls-buttons">
      <button type="button" class="admin-edit-btn">Edit</button>
      <button type="button" class="admin-delete-btn">Delete</button>
      <button type="button" class="admin-view-signups-btn">View Signups</button>
    </div>
    <form class="admin-edit-form hidden">
      <input type="text" name="task" value="${escapeHtml(shift.task)}" placeholder="Task" required />
      <input type="date" name="date" value="${escapeHtml(shift.date)}" required />
      <input type="text" name="time" value="${escapeHtml(shift.time)}" placeholder="Time" required />
      <input type="number" name="slots_available" min="0" value="${shift.slots_available}" required />
      <div class="admin-edit-actions">
        <button type="button" class="admin-edit-cancel">Cancel</button>
        <button type="submit">Save</button>
      </div>
      <p class="form-message" role="status"></p>
    </form>
    <div class="admin-signups-panel hidden"></div>
  `;
  return wrapper;
}
window.renderAdminControls = renderAdminControls;

function showAdminStatus(text, isError) {
  if (!adminStatusEl) return;
  adminStatusEl.textContent = text;
  adminStatusEl.className = `admin-status-message ${isError ? 'error' : 'success'}`;
}

function setAdminMode(active) {
  const changed = active !== currentlyAdmin;
  currentlyAdmin = active;

  loginBtn.classList.toggle('hidden', active);
  logoutBtn.classList.toggle('hidden', !active);
  adminBadge.classList.toggle('hidden', !active);
  adminPanel.classList.toggle('hidden', !active);

  if (changed && typeof loadShifts === 'function') {
    loadShifts();
  }
}

function handleUnauthorized() {
  adminToken = null;
  localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  setAdminMode(false);
  window.alert('Your admin session has expired. Please log in again.');
}

function openLoginModal() {
  loginForm.reset();
  loginForm.querySelector('.form-message').textContent = '';
  loginModal.classList.remove('hidden');
}

function closeLoginModal() {
  loginModal.classList.add('hidden');
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const messageEl = form.querySelector('.form-message');
  const username = form.username.value.trim();
  const password = form.password.value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (res.ok) {
      adminToken = data.token;
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken);
      closeLoginModal();
      setAdminMode(true);
      showAdminStatus('Logged in as admin.', false);
    } else {
      messageEl.textContent = data.message || 'Login failed.';
      messageEl.className = 'form-message error';
    }
  } catch (err) {
    messageEl.textContent = 'Network error — please try again.';
    messageEl.className = 'form-message error';
  }
}

function handleLogoutClick() {
  fetch('/api/admin/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  }).catch(() => {});

  adminToken = null;
  localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  setAdminMode(false);
}

async function handleAddShiftSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const body = {
    task: form.task.value.trim(),
    date: form.date.value,
    time: form.time.value.trim(),
    slots_available: Number(form.slots_available.value),
  };

  try {
    const res = await fetch('/api/admin/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) {
      form.reset();
      showAdminStatus(`Added shift "${data.task}".`, false);
      await loadShifts();
    } else if (res.status === 401) {
      handleUnauthorized();
    } else {
      showAdminStatus(data.message || 'Could not add shift.', true);
    }
  } catch (err) {
    showAdminStatus('Network error — please try again.', true);
  }
}

async function handleEditShiftSubmit(form, shiftId) {
  const messageEl = form.querySelector('.form-message');
  const body = {
    task: form.task.value.trim(),
    date: form.date.value,
    time: form.time.value.trim(),
    slots_available: Number(form.slots_available.value),
  };

  try {
    const res = await fetch(`/api/admin/shifts/${shiftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) {
      showAdminStatus(`Updated shift "${data.task}".`, false);
      await loadShifts();
    } else if (res.status === 401) {
      handleUnauthorized();
    } else {
      messageEl.textContent = data.message || 'Could not update shift.';
      messageEl.className = 'form-message error';
    }
  } catch (err) {
    messageEl.textContent = 'Network error — please try again.';
    messageEl.className = 'form-message error';
  }
}

async function handleDeleteShift(shiftId) {
  const confirmed = window.confirm('Delete this shift? Any signed-up volunteers will be notified by email.');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/admin/shifts/${shiftId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();

    if (res.ok) {
      window.alert(`Shift deleted. ${data.notified_count} volunteer(s) notified by email.`);
      await loadShifts();
    } else if (res.status === 401) {
      handleUnauthorized();
    } else {
      window.alert(data.message || 'Could not delete shift.');
    }
  } catch (err) {
    window.alert('Network error — please try again.');
  }
}

async function handleViewSignups(shiftId, card, button) {
  const panel = card.querySelector('.admin-signups-panel');
  const isVisible = !panel.classList.contains('hidden');

  if (isVisible) {
    panel.classList.add('hidden');
    button.textContent = 'View Signups';
    return;
  }

  try {
    const res = await fetch(`/api/admin/shifts/${shiftId}/signups`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();

    if (res.ok) {
      panel.innerHTML = data.signups.length
        ? `<ul>${data.signups
            .map((s) => `<li>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)} — ${escapeHtml(s.email)}</li>`)
            .join('')}</ul>`
        : '<p class="empty">No signups yet.</p>';
      panel.classList.remove('hidden');
      button.textContent = 'Hide Signups';
    } else if (res.status === 401) {
      handleUnauthorized();
    } else {
      showAdminStatus(data.message || 'Could not load signups.', true);
    }
  } catch (err) {
    showAdminStatus('Network error — please try again.', true);
  }
}

async function handleShiftListClick(event) {
  const card = event.target.closest('.shift-card');
  if (!card) return;
  const shiftId = Number(card.dataset.shiftId);

  if (event.target.closest('.admin-edit-btn')) {
    card.querySelector('.admin-edit-form').classList.toggle('hidden');
    return;
  }
  if (event.target.closest('.admin-edit-cancel')) {
    card.querySelector('.admin-edit-form').classList.add('hidden');
    return;
  }
  if (event.target.closest('.admin-delete-btn')) {
    await handleDeleteShift(shiftId);
    return;
  }
  const viewBtn = event.target.closest('.admin-view-signups-btn');
  if (viewBtn) {
    await handleViewSignups(shiftId, card, viewBtn);
  }
}

async function handleShiftListSubmit(event) {
  if (!event.target.classList.contains('admin-edit-form')) return;
  event.preventDefault();
  const card = event.target.closest('.shift-card');
  const shiftId = Number(card.dataset.shiftId);
  await handleEditShiftSubmit(event.target, shiftId);
}

async function restoreSession() {
  const storedToken = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  if (!storedToken) {
    setAdminMode(false);
    return;
  }

  try {
    const res = await fetch('/api/admin/session', {
      headers: { Authorization: `Bearer ${storedToken}` },
    });
    if (res.ok) {
      adminToken = storedToken;
      setAdminMode(true);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      setAdminMode(false);
    }
  } catch (err) {
    setAdminMode(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loginBtn = document.getElementById('admin-login-btn');
  logoutBtn = document.getElementById('admin-logout-btn');
  adminBadge = document.getElementById('admin-badge');
  adminPanel = document.getElementById('admin-panel');
  adminStatusEl = document.getElementById('admin-status-message');
  loginModal = document.getElementById('admin-login-modal');
  loginForm = document.getElementById('admin-login-form');
  addShiftForm = document.getElementById('admin-add-shift-form');
  shiftListEl = document.getElementById('shift-list');

  loginBtn.addEventListener('click', openLoginModal);
  document.getElementById('admin-login-cancel').addEventListener('click', closeLoginModal);
  loginModal.addEventListener('click', (event) => {
    if (event.target === loginModal) closeLoginModal();
  });
  loginForm.addEventListener('submit', handleLoginSubmit);
  logoutBtn.addEventListener('click', handleLogoutClick);
  addShiftForm.addEventListener('submit', handleAddShiftSubmit);

  shiftListEl.addEventListener('click', handleShiftListClick);
  shiftListEl.addEventListener('submit', handleShiftListSubmit);

  restoreSession();
});
