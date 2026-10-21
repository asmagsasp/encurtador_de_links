/* login.js — Lógica de Login e Cadastro */

const tabLogin         = document.getElementById('tab-login');
const tabRegister      = document.getElementById('tab-register');
const authTitle        = document.getElementById('auth-title');
const authSubtitle     = document.getElementById('auth-subtitle');
const loginBtn         = document.getElementById('login-btn');
const btnSubmitText    = document.getElementById('btn-submit-text');
const btnSubmitIcon    = document.getElementById('btn-submit-icon');
const loginUser        = document.getElementById('login-user');
const loginPass        = document.getElementById('login-pass');
const confirmPassGroup = document.getElementById('confirm-pass-group');
const loginPassConfirm = document.getElementById('login-pass-confirm');
const loginError       = document.getElementById('login-error');
const loginErrorText   = document.getElementById('login-error-text');
const togglePass       = document.getElementById('toggle-pass');
const btnLoader        = loginBtn.querySelector('.btn-loader');
const switchModeBtn    = document.getElementById('switch-mode-btn');
const switchLinkWrap   = document.getElementById('switch-link-wrap');
const loginHint        = document.getElementById('login-hint');

let currentMode = 'login'; // 'login' | 'register'

// Se já estiver logado, vai direto para o painel principal
fetch('/auth/me')
  .then(r => { if (r.ok) window.location.replace('/'); })
  .catch(() => {});

// Toggle mostrar/ocultar senha
togglePass.addEventListener('click', () => {
  const isPass = loginPass.type === 'password';
  loginPass.type = isPass ? 'text' : 'password';
  if (loginPassConfirm) loginPassConfirm.type = loginPass.type;
  togglePass.textContent = isPass ? '🙈' : '👁️';
});

function setMode(mode) {
  currentMode = mode;
  loginError.hidden = true;

  if (mode === 'register') {
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    authTitle.textContent = 'Crie sua conta';
    authSubtitle.textContent = 'Comece no Plano Free e tenha seus links em segundos';
    btnSubmitText.textContent = 'Cadastrar e Começar 🚀';
    btnSubmitIcon.textContent = '→';
    confirmPassGroup.hidden = false;
    switchLinkWrap.innerHTML = 'Já tem uma conta? <a id="switch-mode-btn">Fazer login</a>';
    loginHint.style.display = 'none';
  } else {
    tabRegister.classList.remove('active');
    tabLogin.classList.add('active');
    authTitle.textContent = 'Bem-vindo de volta';
    authSubtitle.textContent = 'Entre na sua conta para gerenciar seus links';
    btnSubmitText.textContent = 'Entrar';
    btnSubmitIcon.textContent = '→';
    confirmPassGroup.hidden = true;
    switchLinkWrap.innerHTML = 'Ainda não tem conta? <a id="switch-mode-btn">Criar conta grátis</a>';
    loginHint.style.display = 'block';
  }

  // Reanexa listener no link dinâmico
  document.getElementById('switch-mode-btn')?.addEventListener('click', () => {
    setMode(currentMode === 'login' ? 'register' : 'login');
  });

  loginUser.focus();
}

tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));
switchModeBtn.addEventListener('click', () => setMode('register'));

function setLoading(loading) {
  loginBtn.disabled = loading;
  btnSubmitText.hidden = loading;
  btnLoader.hidden = !loading;
  btnSubmitIcon.hidden = loading;
}

function showError(msg) {
  loginErrorText.textContent = msg;
  loginError.hidden = false;
}

async function handleSubmit() {
  const username = loginUser.value.trim();
  const password = loginPass.value;

  if (!username) {
    showError('Por favor, informe seu usuário.');
    loginUser.focus();
    return;
  }
  if (!password) {
    showError('Por favor, informe sua senha.');
    loginPass.focus();
    return;
  }

  if (currentMode === 'register') {
    const passwordConfirm = loginPassConfirm.value;
    if (password !== passwordConfirm) {
      showError('As senhas não coincidem. Digite novamente.');
      loginPassConfirm.focus();
      return;
    }
    if (password.length < 4) {
      showError('A senha deve ter no mínimo 4 caracteres.');
      loginPass.focus();
      return;
    }
  }

  loginError.hidden = true;
  setLoading(true);

  try {
    const endpoint = currentMode === 'register' ? '/auth/register' : '/auth/login';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      window.location.replace('/');
    } else {
      showError(data.error || 'Erro ao processar sua solicitação.');
      loginPass.value = '';
      if (loginPassConfirm) loginPassConfirm.value = '';
      loginPass.focus();
    }
  } catch (err) {
    console.error(err);
    showError('Erro de conexão com o servidor.');
  } finally {
    setLoading(false);
  }
}

loginBtn.addEventListener('click', handleSubmit);
loginPass.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (currentMode === 'register') loginPassConfirm.focus();
    else handleSubmit();
  }
});
loginPassConfirm.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });
loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') loginPass.focus(); });
