/**
 * @fileoverview Script de proteção de rotas (Auth Guard).
 * Verifica se o usuário está logado antes de permitir o acesso a páginas protegidas.
 * Se o usuário não estiver autenticado, ele é redirecionado para a página de login.
 */
window.addEventListener('DOMContentLoaded', () => {
  console.log("Verificando autenticação...");
    
    // Verifica no localStorage se existe o item 'isLoggedIn' e se seu valor é 'true'.
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    
    // Se não houver registro de login, redireciona para a página de entrada.
    if (!isLoggedIn || isLoggedIn !== 'true') {
      window.location.href = 'entrar.html';
    }
  });