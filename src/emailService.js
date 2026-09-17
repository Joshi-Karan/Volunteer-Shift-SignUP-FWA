function sendConfirmationEmail({ firstName, email, shift }) {
  console.log(
    `[EmailService] Confirmation email sent to ${email} for "${shift.task}" on ${shift.date}`
  );
}

module.exports = { sendConfirmationEmail };
