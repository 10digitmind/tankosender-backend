const createTransporter = require("../Nodemailer/nodemailer");
const { cleanEmailList } = require("../Utils/cleanemail");

async function sendVerificationEmail(userEmail, userName, token) {
  const transporter = await createTransporter();
  const verificationUrl = `${process.env.CLIENT_URL}/email-verification?token=${token}`;

  const mailOptions = {
    from: "noreply@pay2view.io",
    to: userEmail,
    subject:"Verify Your Email",
    template:"verifyEmail", // template name without extension
    context: {
      name: userName,
      verificationUrl,
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${userEmail}`);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

async function sendPasswordResetEmail(userEmail, userName, resetUrl) {
  const transporter = await createTransporter();

  const mailOptions = {
    from: "noreply@pay2view.io",
    to: userEmail,
    subject: "Password reset  request",
    template: "resetEmail", // template name without extension
    context: {
      name: userName,
      resetUrl,
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`password reset email sent to ${userEmail}`);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

async function subCofirmation(
  userEmail,
  dashboardUrl,
  plan,
  endDate,
  referenceId,
  year
) {
  const transporter = await createTransporter();

  const mailOptions = {
    from: "noreply@pay2view.io",
    to: userEmail,
    subject: "Password reset  request",
    template: "resetEmail", // template name without extension
    context: {
      dashboardUrl,
      plan,
      endDate,
      referenceId,
      year,
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`password reset email sent to ${userEmail}`);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

async function paymentAlert(
  userEmail,
  userWallet,
  amount,
  yourWallet,
  reference
) {
  const transporter = await createTransporter();

  const mailOptions = {
    from: "noreply@pay2view.io",
    to: "tankosender@outlook.com",
    subject: "Payment-Alert",
    template: "payment", // template name without extension
    context: {
      userEmail,

      userWallet,

      amount,

      yourWallet,

    

      reference,
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`payment alert  sent to tankosender@outlook.com`);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

async function signupAlert(name, email,) {
  const transporter = await createTransporter();

  const mailOptions = {
    from:'noreply@pay2view.io',
    to: "tankosender@outlook.com",
    subject: 'new sign up alert!!',
    template: "signupAlert", // template name without extension

    context: {
      name,
      email,
    
    },
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`sign up alert sent to admin`);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}


async function passwordUpdate(
  name,
  email,
  date,
 
) {
  const transporter = await createTransporter();

  const mailOptions = {
    from: "noreply@pay2view.io",
    to: email,
    subject: "Password updated",
    template: "passwordUpdate", // template name without extension
    context: {
     name,
     email,
  date,
    },
  };

  try {
    await transporter.sendMail(mailOptions);
console.log('UODATE PASSWORD EMAIL SENT ')
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  paymentAlert,
  passwordUpdate,
  signupAlert
};
