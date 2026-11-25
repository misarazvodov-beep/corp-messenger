const nodemailer = require('nodemailer');

// Настройки почты берём из файла .env
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: Number(process.env.MAIL_PORT) === 465,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
});

// Отправляет сотруднику письмо с одноразовым кодом
async function sendLoginCode(email, code) {
  await transporter.sendMail({
    from: `"Корпоративный мессенджер" <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Код для входа в мессенджер',
    text: `Ваш код для входа: ${code}\n\nКод действует 10 минут. Если вы не запрашивали код, просто проигнорируйте это письмо.`,
  });
}

module.exports = { sendLoginCode };