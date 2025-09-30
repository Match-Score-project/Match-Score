window.addEventListener('DOMContentLoaded', () => {
    console.log("Verificando autenticação...");
      const isLoggedIn = localStorage.getItem('isLoggedIn');
      if (!isLoggedIn || isLoggedIn !== 'true') {
        window.location.href = 'entrar.html';
      }
    });