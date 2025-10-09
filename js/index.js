'use strict';

/**
 * @fileoverview Script para a página inicial (index.html).
 * Lida com a navegação inicial do usuário, redirecionando para as páginas
 * de cadastro, login ou sobre, e exibe uma tela de carregamento durante a transição.
 */

/**
 * Exibe a tela de carregamento e, após um breve intervalo, redireciona o usuário
 * para a página especificada.
 * @param {string} page - A URL da página de destino.
 */
function showLoadingAndRedirect(page) {
  const loadingScreen = document.getElementById('loading');
  if (!loadingScreen) return;

  // Torna a tela de carregamento visível
  loadingScreen.hidden = false;
  loadingScreen.style.display = 'flex'; 
  document.body.style.cursor = 'wait'; // Muda o cursor do mouse

  // Adiciona um pequeno atraso para que a animação de loading seja percebida
  setTimeout(() => {
    window.location.href = page;
  }, 1500); // 1.5 segundos
}

// Executa o script após o carregamento completo do DOM.
document.addEventListener('DOMContentLoaded', () => {
  
  // Verifica se o Firebase foi inicializado corretamente.
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    console.error("Firebase não foi inicializado. Verifique se firebase-config.js está sendo carregado corretamente.");
    return;
  }

  const auth = firebase.auth();
  let currentUser = auth.currentUser;

  // Monitora continuamente o estado de autenticação para saber se o usuário está logado.
  auth.onAuthStateChanged(user => {
    currentUser = user;
  });

  // Mapeia os IDs dos botões para suas respectivas funções de redirecionamento.
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

  // Adiciona os event listeners a todos os botões de forma eficiente.
  for (const id in buttons) {
    const buttonElement = document.getElementById(id);
    if (buttonElement) {
      buttonElement.addEventListener('click', buttons[id]);
    }
  }
});