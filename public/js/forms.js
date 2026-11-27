// Очистка форм: при уходе с экрана поля пустые,
// а при шаге назад внутри формы введённое сохраняется

function clearForms() {
  ['login-box', 'register-box', 'forgot-box', 'change-box'].forEach((id) => {
    $(id).querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
  });

  ['login-message', 'reg-message', 'forgot-message', 'change-message'].forEach((id) => {
    $(id).textContent = '';
  });

  // Регистрация снова начинается с первого шага
  clearInterval(cooldownTimer);
  registrationToken = null;
  $('reg-step-email').classList.remove('hidden');
  $('reg-step-code').classList.add('hidden');
  $('reg-step-profile').classList.add('hidden');

  const resend = $('btn-reg-resend');
  resend.disabled = false;
  resend.textContent = 'Отправить код ещё раз';

  openForgotMenu();
}

// Уход с экрана: выход из аккаунта или возврат ко входу
['btn-logout', 'btn-reg-back', 'btn-forgot-back'].forEach((id) => {
  $(id).addEventListener('click', clearForms);
});

// Отключаем красное подчёркивание (проверку орфографии) в полях
document.querySelectorAll('input, textarea').forEach((el) => {
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('autocorrect', 'off');
});
