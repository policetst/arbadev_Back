import nodemailer from 'nodemailer';
const email = 'renderpolice333@gmail.com'
const password = 'vrhi lcwf elke both';
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: email,
    pass: password,
  },
});

async function sendPasswordEmail(to, newPassword) {
  await transporter.sendMail({
    from: `"Policía Local" <${email}>`,
    to,
    subject: 'Restablecimiento de contraseña',
    html: `
      <h3>Restablecimiento de contraseña</h3>
      <p>Tu nueva contraseña es: <b>${newPassword}</b></p>
      <p>Te recomendamos cambiarla después de iniciar sesión.</p>
    `,
  });
}

  export default transporter;
