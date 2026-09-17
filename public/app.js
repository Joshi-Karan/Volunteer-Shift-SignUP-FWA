async function loadShifts() {
  const container = document.getElementById('shift-list');
  try {
    const res = await fetch('/api/shifts');
    if (!res.ok) throw new Error('Failed to load shifts');
    const shifts = await res.json();
    renderShifts(shifts);
  } catch (err) {
    container.innerHTML = '<p class="empty">Could not load shifts. Please refresh the page.</p>';
  }
}

function renderShifts(shifts) {
  const container = document.getElementById('shift-list');
  container.innerHTML = '';

  if (shifts.length === 0) {
    container.innerHTML = '<p class="empty">No shifts available right now.</p>';
    return;
  }

  for (const shift of shifts) {
    container.appendChild(buildShiftCard(shift));
  }
}

function buildShiftCard(shift) {
  const card = document.createElement('section');
  card.className = 'shift-card';
  card.dataset.shiftId = String(shift.shift_id);

  const isFull = shift.slots_available <= 0;

  card.innerHTML = `
    <div class="shift-info">
      <h2>${escapeHtml(shift.task)}</h2>
      <p>${escapeHtml(shift.date)} &middot; ${escapeHtml(shift.time)}</p>
      <p class="slots ${isFull ? 'full' : ''}">${slotsLabel(shift.slots_available)}</p>
    </div>
    <form class="signup-form" data-shift-id="${shift.shift_id}">
      <input type="text" name="first_name" placeholder="First name" required ${isFull ? 'disabled' : ''} />
      <input type="text" name="last_name" placeholder="Last name" required ${isFull ? 'disabled' : ''} />
      <input type="email" name="email" placeholder="Email" required ${isFull ? 'disabled' : ''} />
      <button type="submit" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : 'Sign Up'}</button>
      <p class="form-message" role="status"></p>
    </form>
  `;

  if (typeof window.renderAdminControls === 'function') {
    const adminControls = window.renderAdminControls(shift);
    if (adminControls) card.appendChild(adminControls);
  }

  return card;
}

function slotsLabel(slotsAvailable) {
  if (slotsAvailable <= 0) return 'Full';
  return `${slotsAvailable} slot${slotsAvailable === 1 ? '' : 's'} remaining`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function handleSignupSubmit(event) {
  const form = event.target;
  if (!form.classList.contains('signup-form')) return;
  event.preventDefault();

  const shiftId = Number(form.dataset.shiftId);
  const firstName = form.first_name.value.trim();
  const lastName = form.last_name.value.trim();
  const email = form.email.value.trim();
  const messageEl = form.querySelector('.form-message');
  const submitButton = form.querySelector('button[type="submit"]');

  if (!firstName || !lastName || !email) {
    showMessage(messageEl, 'Please fill in all fields.', true);
    return;
  }

  submitButton.disabled = true;

  try {
    const res = await fetch('/api/signups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email, shift_id: shiftId }),
    });
    const data = await res.json();

    if (res.ok) {
      showMessage(messageEl, "You're signed up! A confirmation has been sent.", false);
      form.reset();
      submitButton.disabled = false;
      updateSlotsRemaining(shiftId, data.slots_available);
    } else {
      showMessage(messageEl, data.message || 'Something went wrong.', true);
      submitButton.disabled = false;
    }
  } catch (err) {
    showMessage(messageEl, 'Network error — please try again.', true);
    submitButton.disabled = false;
  }
}

function showMessage(element, text, isError) {
  element.textContent = text;
  element.className = `form-message ${isError ? 'error' : 'success'}`;
}

function updateSlotsRemaining(shiftId, slotsAvailable) {
  const card = document.querySelector(`.shift-card[data-shift-id="${shiftId}"]`);
  if (!card) return;

  const slotsEl = card.querySelector('.slots');
  const isFull = slotsAvailable <= 0;
  slotsEl.textContent = slotsLabel(slotsAvailable);
  slotsEl.classList.toggle('full', isFull);

  if (isFull) {
    card.querySelectorAll('.signup-form input, .signup-form button').forEach((el) => {
      el.disabled = true;
    });
    card.querySelector('.signup-form button[type="submit"]').textContent = 'Full';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadShifts();
  document.getElementById('shift-list').addEventListener('submit', handleSignupSubmit);
});
