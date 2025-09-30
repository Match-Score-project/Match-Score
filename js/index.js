'use strict';

/**
 * Exibe a tela de carregamento e depois redireciona para a página desejada.
 * @param {string} page - A URL da página para redirecionar.
 */
function showLoadingAndRedirect(page) {
  const loadingScreen = document.getElementById('loading');
  if (!loadingScreen) return;

  loadingScreen.hidden = false;
  // Usar 'flex' para garantir que o conteúdo seja centralizado, conforme o CSS
  loadingScreen.style.display = 'flex'; 
  document.body.style.cursor = 'wait';

  // Um pequeno atraso para garantir que a animação de loading seja visível
  setTimeout(() => {
    window.location.href = page;
  }, 1500); // 1.5 segundos
}

// Ponto de entrada principal do script, executado após o DOM estar pronto.
document.addEventListener('DOMContentLoaded', () => {
  
  // Verifica se o Firebase foi inicializado corretamente (pelo firebase-config.js)
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    console.error("Firebase não foi inicializado. Verifique se firebase-config.js está sendo carregado corretamente.");
    // Opcional: Desabilitar botões ou mostrar uma mensagem de erro na tela
    return;
  }

  const auth = firebase.auth();
  let currentUser = auth.currentUser;

  // Monitora continuamente o estado de autenticação do usuário
  auth.onAuthStateChanged(user => {
    currentUser = user;
  });

  // Mapeamento dos botões para suas respectivas ações
  const buttons = {
    'criar-conta-btn': () => showLoadingAndRedirect('cadastro.html'),
    'entrar-btn': () => {
      // Se o usuário já estiver logado, vai direto para a tela de início.
      // Caso contrário, vai para a tela de login.
      const destination = currentUser ? 'inicio.html' : 'entrar.html';
      showLoadingAndRedirect(destination);
    },
    'sobre-btn': () => showLoadingAndRedirect('sobre.html')
  };

  // Adiciona os event listeners a todos os botões de forma eficiente
  for (const id in buttons) {
    const buttonElement = document.getElementById(id);
    if (buttonElement) {
      buttonElement.addEventListener('click', buttons[id]);
    }
  }
});