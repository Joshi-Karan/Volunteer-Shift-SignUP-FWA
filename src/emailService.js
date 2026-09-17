function sendConfirmationEmail({ firstName, email, shift }) {
  console.log(
    `[EmailService] Confirmation email sent to ${email} for "${shift.task}" on ${shift.date}`
  );
}

function sendShiftCancellationEmail({ firstName, email, shift }) {
  console.log(
    `[EmailService] Cancellation email sent to ${email}: "${shift.task}" on ${shift.date} was cancelled`
  );
}

module.exports = { sendConfirmationEmail, sendShiftCancellationEmail };
